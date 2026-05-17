use api::{AppState, server::run};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let settings = api::settings::load_settings()?;
    let db = sea_orm::Database::connect(&settings.database_url).await?;
    db.get_schema_registry("backend::entities::*")
        .sync(&db)
        .await?;

    let redis_client = api::utils::redis::RedisConnection::new(&settings.redis_url);
    redis_client.ping().await?;
    let state = AppState {
        settings,
        db,
        redis_client,
    };
    run(state).await?;

    Ok(())
}
