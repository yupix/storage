use std::sync::Arc;
use std::time::Duration;

use apalis::prelude::*;
use apalis_board::axum::{
    framework::{ApiBuilder, RegisterRoute},
    sse::{TracingBroadcaster, TracingSubscriber},
    ui::ServeUI,
};
use apalis_redis::RedisStorage;
use api::{AppState, EMBED_DIM, QDRANT_COLLECTION, jobs::{caption, embed, ocr}, server::run, utils::caption::build_captioner, utils::qdrant::QdrantRest};
use axum::{Extension, Router};
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use tokio_util::sync::CancellationToken;
use tracing_subscriber::{EnvFilter, Layer as TracingLayer, layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

const WORKER_DRAIN_SECS: u64 = 30;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    let broadcaster = TracingBroadcaster::create();
    let board_subscriber = TracingSubscriber::new(&broadcaster);
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info,api=debug".parse().unwrap());

    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().with_filter(env_filter.clone()))
        .with(board_subscriber.layer().with_filter(env_filter))
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

    // apalis-board ダッシュボード (既定ポート 3401、API_BOARD_ADDR で上書き可)
    let board_addr =
        std::env::var("API_BOARD_ADDR").unwrap_or_else(|_| "0.0.0.0:3401".to_string());
    let board_api = ApiBuilder::new(Router::new())
        .register(ocr_queue.clone())
        .register(embed_queue.clone())
        .register(caption_queue.clone())
        .build();
    let board_router = Router::new()
        .nest("/api/v1", board_api)
        .fallback_service(ServeUI::new())
        .layer(Extension(broadcaster));
    let board_listener = tokio::net::TcpListener::bind(&board_addr).await?;
    tokio::spawn(async move {
        eprintln!("[board] ダッシュボード起動: http://{board_addr}");
        axum::serve(board_listener, board_router).await.unwrap();
    });

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
        watchword_rooms: api::utils::watchword_rooms::WatchwordRooms::new(),
    };

    // サーバーが終了したことを Monitor に通知するチャネル
    let (server_done_tx, server_done_rx) = tokio::sync::oneshot::channel::<()>();
    let server_shutdown = CancellationToken::new();
    let server_cancel_token = server_shutdown.clone();

    // HTTPサーバーをバックグラウンドで起動
    let server_task = tokio::spawn({
        let state = state.clone();
        async move {
            let res = run(state, server_shutdown).await;
            let _ = server_done_tx.send(());
            res
        }
    });

    // UUID はプロセス起動時に一度だけ生成する。
    // クロージャ内で生成すると Monitor がワーカーを再起動するたびに新 ID が発行され
    // ゴーストワーカーが Redis に蓄積するため、起動時の ID を再利用する。
    let ocr_worker_id = format!("ocr-worker-{}", Uuid::new_v4());
    let embed_worker_id = format!("embed-worker-{}", Uuid::new_v4());
    let caption_worker_id = format!("caption-worker-{}", Uuid::new_v4());

    // Monitor でワーカーを管理:
    // - サーバー終了を受けてドレイン開始
    // - インスタンスごとに異なる UUID でマルチインスタンス時も衝突しない
    let monitor_result = Monitor::new()
        .shutdown_timeout(Duration::from_secs(WORKER_DRAIN_SECS))
        .register({
            let ocr_queue = ocr_queue.clone();
            let state = state.clone();
            let id = ocr_worker_id.clone();
            move |_| {
                WorkerBuilder::new(id.clone())
                    .backend(ocr_queue.clone())
                    .concurrency(2)
                    .data(state.clone())
                    .build(ocr::process_ocr_job)
            }
        })
        .register({
            let embed_queue = embed_queue.clone();
            let state = state.clone();
            let id = embed_worker_id.clone();
            move |_| {
                WorkerBuilder::new(id.clone())
                    .backend(embed_queue.clone())
                    .concurrency(1)
                    .data(state.clone())
                    .build(embed::process_embed_job)
            }
        })
        .register({
            let caption_queue = caption_queue.clone();
            let state = state.clone();
            let id = caption_worker_id.clone();
            move |_| {
                WorkerBuilder::new(id.clone())
                    .backend(caption_queue.clone())
                    .concurrency(2)
                    .data(state.clone())
                    .build(caption::process_caption_job)
            }
        })
        .run_with_signal(async move {
            // サーバーが止まったタイミングでワーカーのドレインを開始する
            let _ = server_done_rx.await;
            eprintln!("[shutdown] サーバー終了を検知、ワーカーをドレイン中 (最大 {WORKER_DRAIN_SECS} 秒)...");
            Ok(())
        })
        .await;

    // Monitor 終了後にサーバーも停止させる（ワーカー異常時など）
    server_cancel_token.cancel();
    let server_result = server_task.await?;

    monitor_result?;
    server_result?;

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
