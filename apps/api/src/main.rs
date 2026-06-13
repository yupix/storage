use std::time::Duration;

use apalis::prelude::*;
use apalis_redis::RedisStorage;
use api::{AppState, jobs::ocr, server::run};
use tokio_util::sync::CancellationToken;

// Ctrl+C でサーバーが停止してからワーカーが応答するまでの猶予時間
const WORKER_DRAIN_SECS: u64 = 30;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    let settings = api::settings::load_settings()?;
    let db = sea_orm::Database::connect(&settings.database_url).await?;
    db.get_schema_registry("backend::entities::*")
        .sync(&db)
        .await?;

    let redis_client = api::utils::redis::RedisConnection::new(&settings.redis_url);
    redis_client.ping().await?;

    let storage = api::utils::storage::build_storage(&settings)?;

    let redis = redis::Client::open(settings.redis_url.as_str())?;
    let conn = redis::aio::ConnectionManager::new(redis).await?;
    let ocr_queue = RedisStorage::new(conn);

    let state = AppState {
        settings,
        db,
        redis_client,
        storage,
        ocr_queue: ocr_queue.clone(),
    };

    // API とワーカーで共有するシャットダウントークン。
    // どちらかが先に停止した場合、もう一方も停止させる。
    let shutdown = CancellationToken::new();

    // ワーカータスク: shutdown キャンセル時にポーリングループを即時終了する
    let worker_shutdown = shutdown.clone();
    // ワーカー名を起動ごとにユニークにする。
    // 固定名だと Redis に残った前回の登録が "worker is still active" エラーを引き起こす。
    let worker_id = format!("ocr-worker-{}", uuid::Uuid::new_v4());
    let worker = WorkerBuilder::new(&worker_id)
        .backend(ocr_queue)
        .concurrency(2)
        .data(state.clone())
        .build(ocr::process_ocr_job);
    let mut worker_task = tokio::spawn(async move {
        tokio::select! {
            biased;
            _ = worker_shutdown.cancelled() => Ok(()),
            res = worker.run() => res,
        }
    });

    // API サーバータスク: Ctrl+C または shutdown キャンセルで停止する
    let server_shutdown = shutdown.clone();
    let mut server_task = tokio::spawn(run(state, server_shutdown));

    tokio::select! {
        result = &mut server_task => {
            // サーバー停止 → ワーカーに停止を通知してドレイン待機
            shutdown.cancel();
            eprintln!("[shutdown] ワーカーの完了を待機中 (最大 {WORKER_DRAIN_SECS} 秒)...");
            let _ = tokio::time::timeout(Duration::from_secs(WORKER_DRAIN_SECS), worker_task).await;
            result??;
        }
        result = &mut worker_task => {
            match result {
                Ok(Ok(())) => {
                    // ワーカーが正常終了（外部 stop 等）: サーバーも止める
                    shutdown.cancel();
                    let _ = server_task.await;
                }
                Ok(Err(e)) => {
                    // ワーカー異常終了: サーバーも停止させてエラーを伝播する
                    eprintln!("[shutdown] ワーカー異常終了、サーバーを停止します: {e}");
                    shutdown.cancel();
                    let _ = server_task.await;
                    return Err(e.into());
                }
                Err(e) => {
                    // タスクパニック
                    eprintln!("[shutdown] ワーカータスクがパニック、サーバーを停止します: {e}");
                    shutdown.cancel();
                    let _ = server_task.await;
                    return Err(e.into());
                }
            }
        }
    }

    Ok(())
}
