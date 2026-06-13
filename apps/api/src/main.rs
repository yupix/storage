use apalis::prelude::*;
use apalis_redis::RedisStorage;
use api::{AppState, jobs::ocr, server::run};

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

    tokio::select! {
        res = run(state) => res?,
        res = worker.run() => res?,
    }

    Ok(())
}
