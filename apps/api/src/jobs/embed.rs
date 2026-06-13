use apalis::prelude::*;
use sea_orm::EntityTrait;
use serde::{Deserialize, Serialize};
use serde_json::json;
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
    // multilingual-e5 はドキュメント側に "passage: " プレフィックスが必要
    let texts = vec![format!("passage: {text}")];
    let embeddings = tokio::task::spawn_blocking(move || embedder.embed(texts, None))
        .await
        .map_err(|e| format!("spawn_blocking: {e}"))?
        .map_err(|e| format!("embed: {e}"))?;

    let embedding = embeddings.into_iter().next().ok_or("no embedding returned")?;

    let payload = json!({
        "user_id": file.author_id.to_string(),
        "file_id": file_id.to_string(),
    });

    state
        .qdrant
        .upsert_point(QDRANT_COLLECTION, file_id, embedding, payload)
        .await
        .map_err(|e| format!("qdrant upsert: {e}"))?;

    Ok(())
}
