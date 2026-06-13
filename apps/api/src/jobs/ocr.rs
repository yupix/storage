use apalis::prelude::*;
use sea_orm::{ActiveModelTrait, ActiveValue::Set};
use serde::{Deserialize, Serialize};

use crate::{
    AppState,
    entities::files,
    utils::{ocr, storage::StorageDriver},
};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OcrJob {
    pub file_id: String,
    pub storage_key: String,
    pub mime: String,
}

pub async fn process_ocr_job(job: OcrJob, state: Data<AppState>) -> Result<(), String> {
    eprintln!("[OCR job] 開始: file_id={}", job.file_id);

    let file_id: uuid::Uuid = job.file_id.parse().map_err(|e| format!("invalid file_id: {e}"))?;
    let ext = ocr::mime_to_ext(&job.mime);

    let tmp = tempfile::Builder::new()
        .suffix(&format!(".{ext}"))
        .tempfile()
        .map_err(|e| format!("tempfile: {e}"))?;

    state
        .storage
        .download_to(&job.storage_key, tmp.path())
        .await
        .map_err(|e| format!("download failed: {e}"))?;

    let Some(text) = ocr::extract_text(tmp.path()).await else {
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
