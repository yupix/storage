use std::sync::Arc;

use fastembed::TextEmbedding;
use sea_orm::DatabaseConnection;

use crate::{settings::Settings, utils::redis::RedisConnection, utils::storage::Storage};

pub mod config;
pub mod entities;
pub mod error;
pub mod extractors;
pub mod handlers;
pub mod jobs;
pub mod models;
pub mod openapi;
pub mod payloads;
pub mod routes;
pub mod server;
pub mod settings;
pub mod utils;

pub const QDRANT_COLLECTION: &str = "files";
pub const EMBED_DIM: u64 = 384;

#[derive(Clone)]
pub struct AppState {
    pub settings: Settings,
    pub db: DatabaseConnection,
    pub redis_client: RedisConnection,
    pub storage: Storage,
    pub ocr_queue: apalis_redis::RedisStorage<jobs::ocr::OcrJob>,
    pub embed_queue: apalis_redis::RedisStorage<jobs::embed::EmbedJob>,
    pub qdrant: Arc<qdrant_client::Qdrant>,
    pub embedder: Arc<TextEmbedding>,
}
