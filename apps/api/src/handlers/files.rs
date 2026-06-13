use axum::{
    Json,
    extract::{Multipart, Path, Query, State},
    http::{StatusCode, Uri, header},
    response::IntoResponse,
};
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, Condition, DatabaseConnection, EntityTrait,
    PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, TransactionTrait,
};
use sea_orm::sea_query::LockType;
use sea_orm::prelude::Uuid;
use sha2::{Digest, Sha256};
use std::time::Duration;
use tokio::io::AsyncWriteExt;

use crate::entities::{file_permissions, files, folders, users};
use crate::extractors::CurrentUser;
use crate::utils::storage::StorageDriver;
use crate::payloads::files::{
    EmptyTrashResponse, FileDetailResponse, FileListQuery, FileResponse, FileSearchQuery,
    PaginatedFileResponse, UpdateFileRequest, UploadFileRequest,
};
use crate::utils::auth::AuthError;
use crate::utils::folder_size::adjust_folder_chain;
use crate::utils::ocr;
use crate::jobs::ocr::OcrJob;
use crate::AppState;
use apalis::prelude::TaskSink;

fn file_to_response(file: files::Model) -> FileResponse {
    FileResponse {
        id: file.id.to_string(),
        name: file.filename,
        file_type: file.file_type,
        size: file.filesize,
        updated_at: file.updated_at.map(|dt| dt.to_string()).unwrap_or_default(),
        sender_id: file.author_id.to_string(),
        is_favorite: file.is_favorite,
    }
}

/// 作者でない場合に file_permissions と所有者の凍結状態を確認する。
/// `require_editor = true` なら editor ロールが必要、false なら viewer でも可。
async fn check_file_permission(
    db: &DatabaseConnection,
    file_id: Uuid,
    file_author_id: Uuid,
    user_id: Uuid,
    require_editor: bool,
) -> Result<(), AuthError> {
    // 所有者が凍結されている場合は共有ファイルへのアクセスを拒否
    let owner = users::Entity::find_by_id(file_author_id)
        .one(db)
        .await?
        .ok_or(AuthError::NotFound)?;
    if owner.is_suspended {
        return Err(AuthError::Forbidden);
    }

    let perm = file_permissions::Entity::find()
        .filter(file_permissions::Column::FileId.eq(file_id))
        .filter(file_permissions::Column::UserId.eq(user_id))
        .one(db)
        .await?;

    match perm {
        Some(p) if !require_editor || p.role == "editor" => Ok(()),
        _ => Err(AuthError::Forbidden),
    }
}

#[utoipa::path(
    get,
    path = "/mine",
    params(FileListQuery),
    responses(
        (status = 200, description = "自分のファイル一覧", body = PaginatedFileResponse),
        (status = 401, description = "未認証"),
    )
)]
pub async fn get_files(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Query(query): Query<FileListQuery>,
) -> Result<Json<PaginatedFileResponse>, AuthError> {
    let page = query.page.unwrap_or(1);
    if page == 0 {
        return Err(AuthError::InvalidInput("invalid page".into()));
    }
    let limit = query.limit.unwrap_or(50).min(100);
    if limit == 0 {
        return Err(AuthError::InvalidInput("invalid limit".into()));
    }

    let mut selector = files::Entity::find()
        .filter(files::Column::AuthorId.eq(current_user.id))
        .filter(files::Column::IsDeleted.eq(false))
        .order_by_desc(files::Column::UpdatedAt)
        .order_by_asc(files::Column::Id);

    if let Some(is_fav) = query.is_favorite {
        selector = selector.filter(files::Column::IsFavorite.eq(is_fav));
        // お気に入りフィルター時はフォルダーによる絞り込みをしない
    } else {
        selector = match query.folder_id {
            Some(fid) => selector.filter(files::Column::FolderId.eq(fid)),
            None => selector.filter(files::Column::FolderId.is_null()),
        };
    }

    let paginator = selector.paginate(&state.db, limit);
    let total = paginator.num_items().await?;
    let db_files = paginator.fetch_page(page - 1).await?;

    Ok(Json(PaginatedFileResponse {
        files: db_files.into_iter().map(file_to_response).collect(),
        total,
        page,
        limit,
    }))
}

#[utoipa::path(
    post,
    path = "/",
    request_body(content = UploadFileRequest, content_type = "multipart/form-data"),
    responses(
        (status = 201, description = "アップロード成功", body = FileResponse),
        (status = 400, description = "不正なリクエスト"),
        (status = 401, description = "未認証"),
        (status = 404, description = "指定フォルダーが見つかりません"),
    )
)]
pub async fn upload_file(
    State(state): State<AppState>,
    current_user: CurrentUser,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<FileResponse>), AuthError> {
    let mut folder_id: Option<Uuid> = None;

    // ファイルフィールドの情報（バイト列はまだ読まない）
    struct FileField {
        filename: String,
        mime: String,
        tmp: tempfile::NamedTempFile,
        filesize: i64,
        hash: String,
    }
    let mut file_field: Option<FileField> = None;

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| AuthError::InvalidInput(e.to_string()))?
    {
        match field.name().unwrap_or("") {
            "file" => {
                let raw_name = field.file_name().unwrap_or("unnamed").to_string();
                let fname = std::path::Path::new(&raw_name)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unnamed")
                    .to_string();
                let mime = field.content_type().map(|s| s.to_string()).unwrap_or_else(|| "application/octet-stream".to_string());

                // テンポラリファイルにチャンク単位で書き込みながらハッシュを計算
                let tmp = tempfile::NamedTempFile::new()
                    .map_err(|e| AuthError::Internal(anyhow::anyhow!("temp file: {e}")))?;
                let mut async_file = tokio::fs::File::from_std(
                    tmp.as_file()
                        .try_clone()
                        .map_err(|e| AuthError::Internal(anyhow::anyhow!("file clone: {e}")))?,
                );
                let mut hasher = Sha256::new();
                let mut filesize: i64 = 0;

                while let Some(chunk) = field
                    .chunk()
                    .await
                    .map_err(|e| AuthError::InvalidInput(e.to_string()))?
                {
                    filesize += chunk.len() as i64;
                    hasher.update(&chunk);
                    async_file
                        .write_all(&chunk)
                        .await
                        .map_err(|e| AuthError::Internal(anyhow::anyhow!("write chunk: {e}")))?;
                }
                async_file
                    .flush()
                    .await
                    .map_err(|e| AuthError::Internal(anyhow::anyhow!("flush: {e}")))?;
                drop(async_file);

                let hash = format!("{:x}", hasher.finalize());
                file_field = Some(FileField { filename: fname, mime, tmp, filesize, hash });
            }
            "folder_id" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| AuthError::InvalidInput(e.to_string()))?;
                folder_id = Some(
                    Uuid::parse_str(&text)
                        .map_err(|_| AuthError::InvalidInput("invalid folder_id".into()))?,
                );
            }
            _ => {}
        }
    }

    let ff = file_field.ok_or_else(|| AuthError::InvalidInput("file フィールドが必要です".into()))?;
    let filename = {
        let trimmed = ff.filename.trim().to_string();
        if trimmed.is_empty() || trimmed.chars().count() > 255 {
            return Err(AuthError::InvalidInput("invalid filename".into()));
        }
        trimmed
    };
    let mime = ff.mime;
    let filesize = ff.filesize;
    let hash = ff.hash;

    let file_id = Uuid::new_v4();
    let storage_key = format!("{}/{}", current_user.id, file_id);

    let ocr_mime = mime.clone();
    let ocr_supported = ocr::is_ocr_supported(&mime);

    state
        .storage
        .upload(&storage_key, ff.tmp.path(), &mime)
        .await
        .map_err(|e| AuthError::Internal(e))?;

    let now = Utc::now().fixed_offset();
    // トランザクション内でフォルダーをロックしてから INSERT することで、
    // 検証後にフォルダーが論理削除されても未削除フォルダーへの参照を保証する
    let txn = match state.db.begin().await {
        Ok(t) => t,
        Err(e) => {
            // begin() 失敗時もアップロード済みオブジェクトを補償削除する
            if let Err(se) = state.storage.delete(&storage_key).await {
                tracing::warn!("補償削除失敗 key={storage_key}: {se}");
            }
            return Err(e.into());
        }
    };
    let model = match async {
        if let Some(fid) = folder_id {
            folders::Entity::find_by_id(fid)
                .filter(folders::Column::OwnerId.eq(current_user.id))
                .filter(folders::Column::IsDeleted.eq(false))
                .lock(LockType::Update)
                .one(&txn)
                .await?
                .ok_or(AuthError::NotFound)?;
        }
        let model = files::ActiveModel {
            id: Set(file_id),
            filename: Set(filename),
            file_type: Set(mime),
            filesize: Set(filesize),
            filehash: Set(hash),
            url: Set(storage_key.clone()),
            folder_id: Set(folder_id),
            author_id: Set(current_user.id),
            is_deleted: Set(false),
            deleted_at: Set(None),
            ocr_text: Set(None),
            created_at: Set(Some(now)),
            updated_at: Set(Some(now)),
            is_favorite: Set(false),
        }
        .insert(&txn)
        .await
        .map_err(AuthError::from)?;
        adjust_folder_chain(&txn, folder_id, filesize, now).await?;
        Ok(model)
    }
    .await
    {
        Ok(m) => {
            if let Err(e) = txn.commit().await {
                // commit 結果が不明なためストレージは削除しない。
                // コミット済みの場合に削除するとメタデータだけ残りファイルが失われるため、
                // 孤立オブジェクトとして残し照合・回収できる状態にする。
                tracing::warn!("commit 失敗、ストレージオブジェクトを保留 key={storage_key}: {e}");
                return Err(e.into());
            }
            m
        }
        Err(e) => {
            let _ = txn.rollback().await;
            // DB 登録失敗時はアップロード済みオブジェクトを補償削除
            if let Err(se) = state.storage.delete(&storage_key).await {
                tracing::warn!("補償削除失敗 key={storage_key}: {se}");
            }
            return Err(e);
        }
    };

    if ocr_supported {
        let job = OcrJob {
            file_id,
            storage_key: storage_key.clone(),
            mime: ocr_mime,
        };
        if let Err(e) = state.ocr_queue.clone().push(job).await {
            // キュー投入失敗は OCR が永久に実行されない原因となるため、
            // ファイル削除・フォルダーサイズ戻し・ストレージ削除を行いアップロードをロールバックする。
            eprintln!("[OCR] キューへの追加失敗、アップロードをロールバック: file_id={file_id} err={e}");
            if let Ok(comp_txn) = state.db.begin().await {
                let _ = files::Entity::delete_by_id(file_id).exec(&comp_txn).await;
                let comp_now = chrono::Utc::now().fixed_offset();
                let _ = adjust_folder_chain(&comp_txn, folder_id, -filesize, comp_now).await;
                let _ = comp_txn.commit().await;
            }
            if let Err(se) = state.storage.delete(&storage_key).await {
                tracing::warn!("補償削除失敗 key={storage_key}: {se}");
            }
            return Err(AuthError::Internal(anyhow::anyhow!("OCR キューへの追加に失敗しました")));
        }
    }

    Ok((StatusCode::CREATED, Json(file_to_response(model))))
}

#[utoipa::path(
    get,
    path = "/{id}",
    params(("id" = Uuid, Path, description = "ファイルID")),
    responses(
        (status = 200, description = "ファイル詳細 + 署名付きURL", body = FileDetailResponse),
        (status = 401, description = "未認証"),
        (status = 403, description = "アクセス権限なし"),
        (status = 404, description = "ファイルが見つかりません"),
    )
)]
pub async fn get_file(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(file_id): Path<Uuid>,
) -> Result<Json<FileDetailResponse>, AuthError> {
    let file = files::Entity::find_by_id(file_id)
        .filter(files::Column::IsDeleted.eq(false))
        .one(&state.db)
        .await?
        .ok_or(AuthError::NotFound)?;

    if file.author_id != current_user.id {
        check_file_permission(&state.db, file.id, file.author_id, current_user.id, false).await?;
    }

    let url = state
        .storage
        .get_download_url(&file.url, &file.file_type, Duration::from_secs(3600))
        .await
        .map_err(|e| AuthError::Internal(e))?;

    Ok(Json(FileDetailResponse {
        id: file.id.to_string(),
        name: file.filename,
        file_type: file.file_type,
        size: file.filesize,
        updated_at: file.updated_at.map(|dt| dt.to_string()).unwrap_or_default(),
        sender_id: file.author_id.to_string(),
        is_favorite: file.is_favorite,
        url,
        url_expires_in: 3600,
    }))
}

#[utoipa::path(
    get,
    path = "/{id}/view",
    params(("id" = Uuid, Path, description = "ファイルID")),
    responses(
        (status = 302, description = "署名付きURLへリダイレクト"),
        (status = 401, description = "未認証"),
        (status = 403, description = "アクセス権限なし"),
        (status = 404, description = "ファイルが見つかりません"),
    )
)]
pub async fn view_file(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(file_id): Path<Uuid>,
) -> Result<impl IntoResponse, AuthError> {
    let file = files::Entity::find_by_id(file_id)
        .filter(files::Column::IsDeleted.eq(false))
        .one(&state.db)
        .await?
        .ok_or(AuthError::NotFound)?;

    if file.author_id != current_user.id {
        check_file_permission(&state.db, file.id, file.author_id, current_user.id, false).await?;
    }

    let url = state
        .storage
        .get_download_url(&file.url, &file.file_type, Duration::from_secs(3600))
        .await
        .map_err(|e| AuthError::Internal(e))?;

    // localhost URL はプロキシ経由にするためパス部分だけにする
    let redirect_to = url.parse::<Uri>()
        .ok()
        .filter(|u| matches!(u.host(), Some("localhost") | Some("127.0.0.1")))
        .and_then(|u| u.path_and_query().map(|pq| pq.to_string()))
        .unwrap_or(url);

    Ok((StatusCode::FOUND, [(header::LOCATION, redirect_to)]))
}

#[utoipa::path(
    patch,
    path = "/{id}",
    params(("id" = Uuid, Path, description = "ファイルID")),
    request_body = UpdateFileRequest,
    responses(
        (status = 200, description = "更新後のファイル情報", body = FileResponse),
        (status = 400, description = "不正なリクエスト"),
        (status = 401, description = "未認証"),
        (status = 403, description = "アクセス権限なし"),
        (status = 404, description = "ファイルが見つかりません"),
    )
)]
pub async fn update_file(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(file_id): Path<Uuid>,
    Json(payload): Json<UpdateFileRequest>,
) -> Result<Json<FileResponse>, AuthError> {
    if payload.filename.is_none() && payload.folder_id.is_none() && payload.is_favorite.is_none() {
        return Err(AuthError::InvalidInput(
            "filename と folder_id と is_favorite の全てが省略されています".into(),
        ));
    }

    let file = files::Entity::find_by_id(file_id)
        .filter(files::Column::IsDeleted.eq(false))
        .one(&state.db)
        .await?
        .ok_or(AuthError::NotFound)?;

    if file.author_id != current_user.id {
        check_file_permission(&state.db, file.id, file.author_id, current_user.id, true).await?;
    }

    let author_id = file.author_id;
    let old_folder_id = file.folder_id;
    let filesize = file.filesize;
    let now = Utc::now().fixed_offset();
    let mut active: files::ActiveModel = file.into();

    if let Some(name) = payload.filename {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() || trimmed.chars().count() > 255 {
            return Err(AuthError::InvalidInput("invalid filename".into()));
        }
        active.filename = Set(trimmed);
    }
    if let Some(fid) = payload.folder_id {
        active.folder_id = Set(fid);
    }
    if let Some(is_fav) = payload.is_favorite {
        active.is_favorite = Set(is_fav);
    }
    active.updated_at = Set(Some(now));

    // トランザクション内でフォルダーをロックしてから UPDATE することで
    // 検証後のフォルダー論理削除との競合を防ぐ
    let txn = state.db.begin().await?;
    if let Some(Some(fid)) = payload.folder_id {
        // 移動先はファイル所有者のフォルダーとして検証する
        folders::Entity::find_by_id(fid)
            .filter(folders::Column::OwnerId.eq(author_id))
            .filter(folders::Column::IsDeleted.eq(false))
            .lock(LockType::Update)
            .one(&txn)
            .await?
            .ok_or(AuthError::NotFound)?;
    }
    let moving = payload.folder_id.is_some();
    let new_folder_id = if moving { active.folder_id.clone().unwrap() } else { old_folder_id };
    let updated = match async {
        let m = active.update(&txn).await?;
        if moving {
            adjust_folder_chain(&txn, old_folder_id, -filesize, now).await?;
            adjust_folder_chain(&txn, new_folder_id, filesize, now).await?;
        }
        Ok::<_, AuthError>(m)
    }.await {
        Ok(m) => { txn.commit().await?; m }
        Err(e) => { let _ = txn.rollback().await; return Err(e); }
    };
    Ok(Json(file_to_response(updated)))
}

#[utoipa::path(
    delete,
    path = "/{id}",
    params(("id" = Uuid, Path, description = "ファイルID")),
    responses(
        (status = 204, description = "ゴミ箱に移動"),
        (status = 401, description = "未認証"),
        (status = 403, description = "アクセス権限なし"),
        (status = 404, description = "ファイルが見つかりません"),
    )
)]
pub async fn delete_file(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(file_id): Path<Uuid>,
) -> Result<StatusCode, AuthError> {
    let file = files::Entity::find_by_id(file_id)
        .filter(files::Column::IsDeleted.eq(false))
        .one(&state.db)
        .await?
        .ok_or(AuthError::NotFound)?;

    if file.author_id != current_user.id {
        check_file_permission(&state.db, file.id, file.author_id, current_user.id, true).await?;
    }

    let folder_id = file.folder_id;
    let filesize = file.filesize;
    let now = Utc::now().fixed_offset();

    let txn = state.db.begin().await?;
    // フォルダーを先にロックしてから（Folder → File 順）ファイルをロック
    if let Some(fid) = folder_id {
        folders::Entity::find_by_id(fid)
            .lock(LockType::Update)
            .one(&txn)
            .await?;
    }
    let mut active: files::ActiveModel = file.into();
    active.is_deleted = Set(true);
    active.deleted_at = Set(Some(now));
    active.updated_at = Set(Some(now));
    active.update(&txn).await?;
    adjust_folder_chain(&txn, folder_id, -filesize, now).await?;
    txn.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/trash",
    params(FileListQuery),
    responses(
        (status = 200, description = "ゴミ箱内ファイル一覧", body = PaginatedFileResponse),
        (status = 401, description = "未認証"),
    )
)]
pub async fn get_trash(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Query(query): Query<FileListQuery>,
) -> Result<Json<PaginatedFileResponse>, AuthError> {
    let page = query.page.unwrap_or(1);
    if page == 0 {
        return Err(AuthError::InvalidInput("invalid page".into()));
    }
    let limit = query.limit.unwrap_or(50).min(100);
    if limit == 0 {
        return Err(AuthError::InvalidInput("invalid limit".into()));
    }

    // 削除済みフォルダー配下のファイルはフォルダーとしてゴミ箱に表示されるため除外する。
    // IN リストではなくサブクエリで除外し、削除済みフォルダーが大量でも
    // PostgreSQL のパラメーター上限（65535）を超えないようにする。
    let deleted_folder_subquery = sea_orm::sea_query::Query::select()
        .column(folders::Column::Id)
        .from(folders::Entity)
        .cond_where(
            Condition::all()
                .add(folders::Column::OwnerId.eq(current_user.id))
                .add(folders::Column::IsDeleted.eq(true))
        )
        .to_owned();

    let paginator = files::Entity::find()
        .filter(files::Column::AuthorId.eq(current_user.id))
        .filter(files::Column::IsDeleted.eq(true))
        .filter(
            Condition::any()
                .add(files::Column::FolderId.is_null())
                .add(files::Column::FolderId.not_in_subquery(deleted_folder_subquery)),
        )
        .order_by_desc(files::Column::DeletedAt)
        .order_by_asc(files::Column::Id)
        .paginate(&state.db, limit);

    let total = paginator.num_items().await?;
    let db_files = paginator.fetch_page(page - 1).await?;

    Ok(Json(PaginatedFileResponse {
        files: db_files.into_iter().map(file_to_response).collect(),
        total,
        page,
        limit,
    }))
}

#[utoipa::path(
    post,
    path = "/trash/{id}/restore",
    params(("id" = Uuid, Path, description = "復元するファイルID")),
    responses(
        (status = 200, description = "復元後のファイル情報", body = FileResponse),
        (status = 400, description = "ゴミ箱にないファイル"),
        (status = 401, description = "未認証"),
        (status = 403, description = "アクセス権限なし"),
        (status = 404, description = "ファイルが見つかりません"),
    )
)]
pub async fn restore_file(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(file_id): Path<Uuid>,
) -> Result<Json<FileResponse>, AuthError> {
    let txn = state.db.begin().await?;

    // ロック順序を delete_folder と統一（Folder → File）するため、
    // まずロックなしで file を読み folder_id を取得する。
    let file_preview = files::Entity::find_by_id(file_id)
        .filter(files::Column::AuthorId.eq(current_user.id))
        .one(&txn)
        .await?
        .ok_or(AuthError::NotFound)?;

    if !file_preview.is_deleted {
        let _ = txn.rollback().await;
        return Err(AuthError::InvalidInput("ファイルはゴミ箱にありません".into()));
    }

    // フォルダーを先にロック（delete_folder との Folder → File 順序を合わせてデッドロックを防ぐ）
    let restored_folder_id = if let Some(fid) = file_preview.folder_id {
        let exists = folders::Entity::find_by_id(fid)
            .filter(folders::Column::OwnerId.eq(current_user.id))
            .filter(folders::Column::IsDeleted.eq(false))
            .lock(LockType::Update)
            .one(&txn)
            .await?
            .is_some();
        if exists { Some(fid) } else { None }
    } else {
        None
    };

    // フォルダーの後にファイルをロック（empty_trash との競合も直列化）
    let file = files::Entity::find_by_id(file_id)
        .filter(files::Column::AuthorId.eq(current_user.id))
        .lock(LockType::Update)
        .one(&txn)
        .await?
        .ok_or(AuthError::NotFound)?;

    // ロック取得後に再確認（ロック待ち中に状態が変化した場合に対応）
    if !file.is_deleted {
        let _ = txn.rollback().await;
        return Err(AuthError::InvalidInput("ファイルはゴミ箱にありません".into()));
    }

    let now = Utc::now().fixed_offset();
    let filesize = file.filesize;
    let mut active: files::ActiveModel = file.into();
    active.is_deleted = Set(false);
    active.deleted_at = Set(None);
    active.folder_id = Set(restored_folder_id);
    active.updated_at = Set(Some(now));

    let updated = active.update(&txn).await?;
    adjust_folder_chain(&txn, restored_folder_id, filesize, now).await?;
    txn.commit().await?;
    Ok(Json(file_to_response(updated)))
}

#[utoipa::path(
    delete,
    path = "/trash/{id}",
    params(("id" = Uuid, Path, description = "完全削除するファイルID")),
    responses(
        (status = 204, description = "完全削除しました"),
        (status = 400, description = "ゴミ箱にないファイル"),
        (status = 401, description = "未認証"),
        (status = 403, description = "アクセス権限なし"),
        (status = 404, description = "ファイルが見つかりません"),
    )
)]
pub async fn purge_file(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(file_id): Path<Uuid>,
) -> Result<StatusCode, AuthError> {
    let txn = state.db.begin().await?;

    // restore_file との競合を直列化するため SELECT FOR UPDATE で取得
    let file = files::Entity::find_by_id(file_id)
        .lock(LockType::Update)
        .one(&txn)
        .await?
        .ok_or(AuthError::NotFound)?;

    if file.author_id != current_user.id {
        let _ = txn.rollback().await;
        return Err(AuthError::Forbidden);
    }
    if !file.is_deleted {
        let _ = txn.rollback().await;
        return Err(AuthError::InvalidInput("ファイルはゴミ箱にありません".into()));
    }

    let url = file.url.clone();
    files::Entity::delete_by_id(file_id).exec(&txn).await?;
    txn.commit().await?;

    if let Err(e) = state.storage.delete(&url).await {
        tracing::warn!("ストレージ削除失敗 key={}: {e}", url);
    }

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    delete,
    path = "/trash",
    responses(
        (status = 204, description = "ゴミ箱を空にしました"),
        (status = 207, description = "一部のファイル削除に失敗しました", body = EmptyTrashResponse),
        (status = 401, description = "未認証"),
    )
)]
pub async fn empty_trash(
    State(state): State<AppState>,
    current_user: CurrentUser,
) -> Result<impl axum::response::IntoResponse, AuthError> {
    // SELECT FOR UPDATE で restore_file との競合を直列化する。
    // ロック取得時点で is_deleted = true のファイルのみ対象にするため、
    // 復元済みファイルを誤って削除しない。
    let txn = state.db.begin().await?;
    let trashed = files::Entity::find()
        .filter(files::Column::AuthorId.eq(current_user.id))
        .filter(files::Column::IsDeleted.eq(true))
        .lock(LockType::Update)
        .all(&txn)
        .await?;

    // DB 削除をストレージ削除より先にコミットする。
    // ストレージ削除後に DB がロールバックされると存在しないオブジェクトを
    // 参照する行が残るため、順序を DB → ストレージとする。
    // ストレージ削除失敗は孤立オブジェクトとして残るがオペレーターが回収できる。
    if !trashed.is_empty() {
        let ids: Vec<Uuid> = trashed.iter().map(|f| f.id).collect();
        files::Entity::delete_many()
            .filter(files::Column::Id.is_in(ids))
            .exec(&txn)
            .await?;
    }
    txn.commit().await?;

    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(16));
    let mut join_set = tokio::task::JoinSet::new();
    for file in &trashed {
        let storage = state.storage.clone();
        let url = file.url.clone();
        let id = file.id.to_string();
        let permit = sem.clone().acquire_owned().await.unwrap();
        join_set.spawn(async move {
            let _permit = permit;
            match storage.delete(&url).await {
                Ok(()) => Ok(id),
                Err(e) => Err((id, url, e)),
            }
        });
    }

    let mut deleted_strs: Vec<String> = Vec::new();
    let mut failed_ids: Vec<String> = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(Ok(id)) => deleted_strs.push(id),
            Ok(Err((id, url, e))) => {
                tracing::warn!("ストレージ削除失敗 key={}: {e}", url);
                failed_ids.push(id);
            }
            Err(e) => tracing::warn!("ストレージ削除タスク失敗: {e}"),
        }
    }

    if failed_ids.is_empty() {
        Ok(StatusCode::NO_CONTENT.into_response())
    } else {
        Ok((
            StatusCode::MULTI_STATUS,
            Json(EmptyTrashResponse {
                deleted: deleted_strs,
                failed: failed_ids,
            }),
        )
            .into_response())
    }
}

#[utoipa::path(
    get,
    path = "/search",
    params(FileSearchQuery),
    responses(
        (status = 200, description = "検索結果", body = PaginatedFileResponse),
        (status = 401, description = "未認証"),
    )
)]
pub async fn search_files(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Query(query): Query<FileSearchQuery>,
) -> Result<Json<PaginatedFileResponse>, AuthError> {
    let page = query.page.unwrap_or(1);
    if page == 0 {
        return Err(AuthError::InvalidInput("invalid page".into()));
    }
    let limit = query.limit.unwrap_or(50).min(100);
    if limit == 0 {
        return Err(AuthError::InvalidInput("invalid limit".into()));
    }

    let q = query.q.trim().to_string();
    if q.is_empty() {
        return Ok(Json(PaginatedFileResponse { files: vec![], total: 0, page, limit }));
    }
    let pattern = format!("%{}%", q);

    let paginator = files::Entity::find()
        .filter(files::Column::AuthorId.eq(current_user.id))
        .filter(files::Column::IsDeleted.eq(false))
        .filter(
            Condition::any()
                .add(files::Column::Filename.ilike(&pattern))
                .add(files::Column::OcrText.ilike(&pattern)),
        )
        .order_by_desc(files::Column::UpdatedAt)
        .order_by_asc(files::Column::Id)
        .paginate(&state.db, limit);

    let total = paginator.num_items().await?;
    let db_files = paginator.fetch_page(page - 1).await?;

    Ok(Json(PaginatedFileResponse {
        files: db_files.into_iter().map(file_to_response).collect(),
        total,
        page,
        limit,
    }))
}
