use apalis::prelude::*;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, DbErr, EntityTrait};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppState,
    entities::files,
    jobs::embed::EmbedJob,
    utils::{caption::CaptionDriver, storage::StorageDriver},
};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CaptionJob {
    pub file_id: Uuid,
    pub storage_key: String,
    pub mime: String,
}

pub async fn process_caption_job(job: CaptionJob, state: Data<AppState>) -> Result<(), String> {
    let file_id = job.file_id;

    let exists = files::Entity::find_by_id(file_id)
        .one(&state.db)
        .await
        .map_err(|e| format!("db check: {e}"))?
        .is_some();
    if !exists {
        return Ok(());
    }

    let ext = job.mime.split('/').last().unwrap_or("bin");
    let tmp = tempfile::Builder::new()
        .suffix(&format!(".{ext}"))
        .tempfile()
        .map_err(|e| format!("tempfile: {e}"))?
        .into_temp_path();

    state
        .storage
        .download_to(&job.storage_key, &tmp)
        .await
        .map_err(|e| format!("download: {e}"))?;

    let caption = state
        .captioner
        .caption(&tmp, &job.mime)
        .await
        .map_err(|e| format!("caption: {e}"))?;

    let Some(caption) = caption else {
        return Ok(());
    };

    eprintln!("[Caption job] 完了: {} 文字 → file_id={file_id}", caption.chars().count());

    let mut active = files::ActiveModel {
        id: Set(file_id),
        ..Default::default()
    };
    active.caption = Set(Some(caption));
    match active.update(&state.db).await {
        Ok(_) => {}
        Err(DbErr::RecordNotUpdated) => return Ok(()),
        Err(e) => return Err(format!("db update: {e}")),
    }

    if let Err(e) = state.embed_queue.clone().push(EmbedJob { file_id }).await {
        eprintln!("[Caption job] EmbedJob のキュー追加失敗: {e}");
    }

    Ok(())
}
