use apalis::prelude::*;
use qdrant_client::qdrant::{PointStruct, UpsertPointsBuilder};
use sea_orm::EntityTrait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{AppState, QDRANT_COLLECTION, entities::files};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmbedJob {
    pub file_id: Uuid,
}

pub async fn process_embed_job(job: EmbedJob, state: Data<AppState>) -> Result<(), String> {
    let file_id = job.file_id;

    let file = files::Entity::find_by_id(file_id)
        .one(&state.db)
        .await
        .map_err(|e| format!("db fetch: {e}"))?;

    let Some(file) = file else {
        return Ok(());
    };

    let mut text = file.filename.clone();
    if let Some(ref ocr) = file.ocr_text {
        if !ocr.is_empty() {
            text.push(' ');
            text.push_str(ocr);
        }
    }

    let embedder = state.embedder.clone();
    let texts = vec![text];
    let embeddings = tokio::task::spawn_blocking(move || embedder.embed(texts, None))
        .await
        .map_err(|e| format!("spawn_blocking: {e}"))?
        .map_err(|e| format!("embed: {e}"))?;

    let embedding = embeddings.into_iter().next().ok_or("no embedding returned")?;

    let payload: HashMap<String, qdrant_client::qdrant::Value> = [
        ("user_id".to_string(), file.author_id.to_string().into()),
        ("file_id".to_string(), file_id.to_string().into()),
    ]
    .into_iter()
    .collect();

    let point = PointStruct::new(file_id.to_string(), embedding, payload);

    state
        .qdrant
        .upsert_points(UpsertPointsBuilder::new(QDRANT_COLLECTION, vec![point]))
        .await
        .map_err(|e| format!("qdrant upsert: {e}"))?;

    Ok(())
}
