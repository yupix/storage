use apalis::prelude::*;
use sea_orm::{ActiveModelTrait, ActiveValue::Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppState,
    entities::files,
    utils::{ocr, storage::StorageDriver},
};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OcrJob {
    pub file_id: Uuid,
    pub storage_key: String,
    pub mime: String,
}

pub async fn process_ocr_job(job: OcrJob, state: Data<AppState>) -> Result<(), String> {
    eprintln!("[OCR job] 開始: file_id={}", job.file_id);

    let file_id = job.file_id;
    let ext = ocr::mime_to_ext(&job.mime);

    let tmp = tempfile::Builder::new()
        .suffix(&format!(".{ext}"))
        .tempfile()
        .map_err(|e| format!("tempfile: {e}"))?
        .into_temp_path();

    state
        .storage
        .download_to(&job.storage_key, &tmp)
        .await
        .map_err(|e| format!("download failed: {e}"))?;

    let Some(text) = ocr::extract_text(&tmp).await else {
        eprintln!("[OCR job] テキストなし: file_id={}", job.file_id);
        return Ok(());
    };

    eprintln!("[OCR job] 完了: {} 文字 → file_id={}", text.chars().count(), job.file_id);

    let mut active = files::ActiveModel {
        id: Set(file_id),
        ..Default::default()
    };
    active.ocr_text = Set(Some(text));
    active
        .update(&state.db)
        .await
        .map_err(|e| format!("db update: {e}"))?;

    Ok(())
}
