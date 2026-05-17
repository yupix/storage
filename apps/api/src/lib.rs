use sea_orm::DatabaseConnection;

use crate::{settings::Settings, utils::redis::RedisConnection};

pub mod config;
pub mod entities;
pub mod error;
pub mod extractors;
pub mod handlers;
pub mod models;
pub mod openapi;
pub mod routes;
pub mod server;
pub mod settings;
pub mod utils;

#[derive(Clone)]
pub struct AppState {
    pub settings: Settings,
    pub db: DatabaseConnection,
    pub redis_client: RedisConnection,
}
