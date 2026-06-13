use std::time::Duration;

use apalis::prelude::*;
use apalis_redis::RedisStorage;
use api::{AppState, jobs::ocr, server::run};

// OCR タイムアウト（ocr.rs と合わせる）＋余裕
const WORKER_DRAIN_SECS: u64 = 150;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
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

    let worker = WorkerBuilder::new("ocr-worker")
        .backend(ocr_queue)
        .concurrency(2)
        .data(state.clone())
        .build(ocr::process_ocr_job);

    // ワーカーを別タスクで起動する。
    // tokio::select! で run(state) が完了した瞬間に worker.run() をキャンセルすると、
    // 処理中の OCR ジョブが途中で放棄されるため、ワーカーは独立したタスクで動かす。
    let worker_task = tokio::spawn(worker.run());

    // API サーバーを起動し、シグナルを受けるまでブロック
    run(state).await?;

    // サーバーが停止したら新規アップロードは受け付けない。
    // 実行中の OCR ジョブが完了するまでドレイン期間を設ける。
    eprintln!("[shutdown] ワーカーの完了を待機中 (最大 {WORKER_DRAIN_SECS} 秒)...");
    match tokio::time::timeout(Duration::from_secs(WORKER_DRAIN_SECS), worker_task).await {
        Ok(Ok(Ok(()))) => {}
        Ok(Ok(Err(e))) => eprintln!("[shutdown] ワーカーエラー: {e}"),
        Ok(Err(e)) => eprintln!("[shutdown] ワーカータスクエラー: {e}"),
        Err(_) => eprintln!("[shutdown] ワーカーのドレインがタイムアウトしました"),
    }

    Ok(())
}
