use std::sync::Arc;
use std::time::Duration;

use apalis::prelude::*;
use apalis_redis::RedisStorage;
use api::{AppState, EMBED_DIM, QDRANT_COLLECTION, jobs::{caption, embed, ocr}, server::run, utils::caption::build_captioner, utils::qdrant::QdrantRest};
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use tokio_util::sync::CancellationToken;

const WORKER_DRAIN_SECS: u64 = 30;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,api=debug".parse().unwrap()),
        )
        .init();

    let settings = api::settings::load_settings()?;
    let db = sea_orm::Database::connect(&settings.database_url).await?;

    let redis_client = api::utils::redis::RedisConnection::new(&settings.redis_url);
    redis_client.ping().await?;

    let storage = api::utils::storage::build_storage(&settings)?;

    let redis = redis::Client::open(settings.redis_url.as_str())?;
    let conn = redis::aio::ConnectionManager::new(redis).await?;
    let ocr_queue = RedisStorage::new(conn.clone());
    let embed_queue = RedisStorage::new(conn.clone());
    let caption_queue = RedisStorage::new(conn);

    let captioner = build_captioner(&settings)?;

    let qdrant = QdrantRest::new(&settings.qdrant_url, settings.qdrant_api_key.as_deref())?;
    ensure_qdrant_collection(&qdrant).await?;

    eprintln!("[startup] 埋め込みモデルを初期化中...");
    let embedder = Arc::new(
        tokio::task::spawn_blocking(|| {
            TextEmbedding::try_new(
                InitOptions::new(EmbeddingModel::MultilingualE5Small),
            )
        })
        .await??
    );
    eprintln!("[startup] 埋め込みモデルの初期化完了");

    let state = AppState {
        settings,
        db,
        redis_client,
        storage,
        ocr_queue: ocr_queue.clone(),
        embed_queue: embed_queue.clone(),
        caption_queue: caption_queue.clone(),
        qdrant: qdrant.clone(),
        embedder,
        captioner,
    };

    let shutdown = CancellationToken::new();

    let ocr_shutdown = shutdown.clone();
    let ocr_worker_id = format!("ocr-worker-{}", uuid::Uuid::new_v4());
    let ocr_worker = WorkerBuilder::new(&ocr_worker_id)
        .backend(ocr_queue)
        .concurrency(2)
        .data(state.clone())
        .build(ocr::process_ocr_job);
    let mut ocr_task = tokio::spawn(async move {
        tokio::select! {
            biased;
            _ = ocr_shutdown.cancelled() => Ok(()),
            res = ocr_worker.run() => res,
        }
    });

    let embed_shutdown = shutdown.clone();
    let embed_worker_id = format!("embed-worker-{}", uuid::Uuid::new_v4());
    let embed_worker = WorkerBuilder::new(&embed_worker_id)
        .backend(embed_queue)
        .concurrency(1)
        .data(state.clone())
        .build(embed::process_embed_job);
    let mut embed_task = tokio::spawn(async move {
        tokio::select! {
            biased;
            _ = embed_shutdown.cancelled() => Ok(()),
            res = embed_worker.run() => res,
        }
    });

    let caption_shutdown = shutdown.clone();
    let caption_worker_id = format!("caption-worker-{}", uuid::Uuid::new_v4());
    let caption_worker = WorkerBuilder::new(&caption_worker_id)
        .backend(caption_queue)
        .concurrency(2)
        .data(state.clone())
        .build(caption::process_caption_job);
    let mut caption_task = tokio::spawn(async move {
        tokio::select! {
            biased;
            _ = caption_shutdown.cancelled() => Ok(()),
            res = caption_worker.run() => res,
        }
    });

    let server_shutdown = shutdown.clone();
    let mut server_task = tokio::spawn(run(state, server_shutdown));

    tokio::select! {
        result = &mut server_task => {
            shutdown.cancel();
            eprintln!("[shutdown] ワーカーの完了を待機中 (最大 {WORKER_DRAIN_SECS} 秒)...");
            let _ = tokio::time::timeout(
                Duration::from_secs(WORKER_DRAIN_SECS),
                async { let _ = tokio::join!(ocr_task, embed_task, caption_task); },
            ).await;
            result??;
        }
        result = &mut ocr_task => {
            match result {
                Ok(Ok(())) => { shutdown.cancel(); let _ = server_task.await; }
                Ok(Err(e)) => {
                    eprintln!("[shutdown] OCRワーカー異常終了: {e}");
                    shutdown.cancel(); let _ = server_task.await;
                    return Err(e.into());
                }
                Err(e) => {
                    eprintln!("[shutdown] OCRワーカーパニック: {e}");
                    shutdown.cancel(); let _ = server_task.await;
                    return Err(e.into());
                }
            }
        }
        result = &mut embed_task => {
            match result {
                Ok(Ok(())) => { shutdown.cancel(); let _ = server_task.await; }
                Ok(Err(e)) => {
                    eprintln!("[shutdown] Embedワーカー異常終了: {e}");
                    shutdown.cancel(); let _ = server_task.await;
                    return Err(e.into());
                }
                Err(e) => {
                    eprintln!("[shutdown] Embedワーカーパニック: {e}");
                    shutdown.cancel(); let _ = server_task.await;
                    return Err(e.into());
                }
            }
        }
        result = &mut caption_task => {
            match result {
                Ok(Ok(())) => { shutdown.cancel(); let _ = server_task.await; }
                Ok(Err(e)) => {
                    eprintln!("[shutdown] Captionワーカー異常終了: {e}");
                    shutdown.cancel(); let _ = server_task.await;
                    return Err(e.into());
                }
                Err(e) => {
                    eprintln!("[shutdown] Captionワーカーパニック: {e}");
                    shutdown.cancel(); let _ = server_task.await;
                    return Err(e.into());
                }
            }
        }
    }

    Ok(())
}

async fn ensure_qdrant_collection(qdrant: &QdrantRest) -> Result<(), anyhow::Error> {
    let exists = qdrant.collection_exists(QDRANT_COLLECTION).await?;
    if !exists {
        qdrant.create_collection(QDRANT_COLLECTION, EMBED_DIM).await?;
        eprintln!("[startup] Qdrant コレクション '{QDRANT_COLLECTION}' を作成しました");
    }
    Ok(())
}
