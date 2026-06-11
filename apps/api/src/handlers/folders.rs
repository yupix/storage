use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use axum_valid::Valid;
use chrono::Utc;
use sea_orm::prelude::Uuid;
use std::collections::HashMap;

use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, DatabaseBackend, EntityTrait,
    FromQueryResult, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Statement, TransactionTrait,
};
use sea_orm::sea_query::{Expr, LockType};

use crate::entities::{files, folders, users};
use crate::extractors::AuthUser;
use crate::models::{FolderResponse, ListFoldersResponse};
use crate::openapi::SessionAuthErrors;
use crate::payloads::folders::{CreateFolderRequest, DeleteFolderQuery, ListFoldersQuery, UpdateFolderRequest};
use crate::utils::auth::AuthError;
use crate::AppState;

fn trim_name(name: &str) -> Result<String, AuthError> {
    let trimmed = name.trim();
    let char_count = trimmed.chars().count();
    if char_count == 0 || char_count > 255 {
        return Err(AuthError::InvalidInput("invalid name".into()));
    }
    Ok(trimmed.to_string())
}

async fn load_owner(db: &sea_orm::DatabaseConnection, user_id: Uuid) -> Result<users::Model, AuthError> {
    users::Entity::find_by_id(user_id)
        .one(db)
        .await?
        .ok_or(AuthError::Unauthorized)
}

async fn verify_parent_folder<C: ConnectionTrait>(
    db: &C,
    parent_id: Uuid,
    user_id: Uuid,
) -> Result<(), AuthError> {
    let parent = folders::Entity::find_by_id(parent_id)
        .filter(folders::Column::IsDeleted.eq(false))
        .filter(folders::Column::OwnerId.eq(user_id))
        .one(db)
        .await?;
    if parent.is_none() {
        return Err(AuthError::NotFound);
    }
    Ok(())
}

async fn get_owned_folder<C: ConnectionTrait>(
    db: &C,
    folder_id: Uuid,
    user_id: Uuid,
    lock: bool,
) -> Result<folders::Model, AuthError> {
    let q = folders::Entity::find_by_id(folder_id)
        .filter(folders::Column::OwnerId.eq(user_id))
        .filter(folders::Column::IsDeleted.eq(false));
    let q = if lock { q.lock(LockType::Update) } else { q };
    q.one(db).await?.ok_or(AuthError::NotFound)
}

#[derive(FromQueryResult)]
struct DescendantId {
    id: Uuid,
}

#[derive(FromQueryResult)]
struct FolderSize {
    root_id: Uuid,
    total_size: i64,
}

/// 複数フォルダーの再帰的ファイル合計サイズを一括取得する。
/// 返り値: folder_id → total_size（バイト）のマップ。存在しないIDは 0 扱い。
async fn compute_folder_sizes<C: ConnectionTrait>(
    db: &C,
    folder_ids: &[Uuid],
) -> Result<HashMap<Uuid, i64>, AuthError> {
    if folder_ids.is_empty() {
        return Ok(HashMap::new());
    }

    // UUID 配列を $1::uuid[] として渡すことでクエリプランのキャッシュ効率を高める
    let sql = r#"
        WITH RECURSIVE tree AS (
            SELECT id, id AS root_id
            FROM folders
            WHERE id = ANY($1::uuid[]) AND is_deleted = false
            UNION ALL
            SELECT f.id, t.root_id
            FROM folders f
            INNER JOIN tree t ON f.folder_id = t.id
            WHERE f.is_deleted = false
        )
        SELECT t.root_id, COALESCE(SUM(fi.filesize), 0)::bigint AS total_size
        FROM tree t
        LEFT JOIN files fi ON fi.folder_id = t.id AND fi.is_deleted = false
        GROUP BY t.root_id
    "#;

    let array_value = sea_orm::Value::Array(
        sea_orm::sea_query::ArrayType::Uuid,
        Some(Box::new(
            folder_ids
                .iter()
                .map(|id| sea_orm::Value::Uuid(Some(*id)))
                .collect(),
        )),
    );
    let stmt = Statement::from_sql_and_values(DatabaseBackend::Postgres, sql, [array_value]);
    let rows = FolderSize::find_by_statement(stmt).all(db).await?;

    let mut map = HashMap::new();
    for row in rows {
        map.insert(row.root_id, row.total_size);
    }
    Ok(map)
}

async fn collect_descendant_ids<C: ConnectionTrait>(
    db: &C,
    root_id: Uuid,
    user_id: Uuid,
) -> Result<Vec<Uuid>, AuthError> {
    let sql = r#"
        WITH RECURSIVE descendants AS (
            SELECT id FROM folders
            WHERE folder_id = $1 AND owner_id = $2 AND is_deleted = false
            UNION ALL
            SELECT f.id FROM folders f
            INNER JOIN descendants d ON f.folder_id = d.id
            WHERE f.owner_id = $2 AND f.is_deleted = false
        )
        SELECT id FROM descendants
    "#;

    let stmt = Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        sql,
        [root_id.into(), user_id.into()],
    );

    let rows = DescendantId::find_by_statement(stmt).all(db).await?;
    Ok(rows.into_iter().map(|r| r.id).collect())
}

async fn soft_delete_folders<C: ConnectionTrait>(
    txn: &C,
    folder_ids: &[Uuid],
    now: sea_orm::prelude::DateTimeWithTimeZone,
) -> Result<(), AuthError> {
    if folder_ids.is_empty() {
        return Ok(());
    }
    folders::Entity::update_many()
        .col_expr(folders::Column::IsDeleted, Expr::value(true))
        .col_expr(folders::Column::DeletedAt, Expr::value(now))
        .col_expr(folders::Column::UpdatedAt, Expr::value(now))
        .filter(folders::Column::Id.is_in(folder_ids.to_vec()))
        .exec(txn)
        .await?;
    Ok(())
}

async fn soft_delete_files_in_folders<C: ConnectionTrait>(
    txn: &C,
    folder_ids: &[Uuid],
    now: sea_orm::prelude::DateTimeWithTimeZone,
) -> Result<(), AuthError> {
    if folder_ids.is_empty() {
        return Ok(());
    }
    files::Entity::update_many()
        .col_expr(files::Column::IsDeleted, Expr::value(true))
        .col_expr(files::Column::DeletedAt, Expr::value(now))
        .col_expr(files::Column::UpdatedAt, Expr::value(now))
        .filter(files::Column::FolderId.is_in(folder_ids.to_vec()))
        .filter(files::Column::IsDeleted.eq(false))
        .exec(txn)
        .await?;
    Ok(())
}

#[utoipa::path(
    get,
    path = "/",
    params(ListFoldersQuery),
    responses(
        (status = 200, description = "Folder list", body = ListFoldersResponse),
        SessionAuthErrors,
        (status = 404, description = "Parent folder not found"),
    )
)]
pub async fn list_folders(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<ListFoldersQuery>,
) -> Result<Json<ListFoldersResponse>, AuthError> {
    let page = query.page.unwrap_or(1);
    if page == 0 {
        return Err(AuthError::InvalidInput("invalid page".into()));
    }

    let limit = query.limit.unwrap_or(50).min(100);
    if limit == 0 {
        return Err(AuthError::InvalidInput("invalid limit".into()));
    }

    if let Some(parent_id) = query.folder_id {
        verify_parent_folder(&state.db, parent_id, auth.user_id).await?;
    }

    let owner = load_owner(&state.db, auth.user_id).await?;

    let mut selector = folders::Entity::find()
        .filter(folders::Column::OwnerId.eq(auth.user_id))
        .filter(folders::Column::IsDeleted.eq(false))
        .order_by_asc(folders::Column::Name)
        .order_by_asc(folders::Column::Id);

    selector = match query.folder_id {
        Some(parent_id) => selector.filter(folders::Column::FolderId.eq(parent_id)),
        None => selector.filter(folders::Column::FolderId.is_null()),
    };

    let paginator = selector.paginate(&state.db, limit);
    let total = paginator.num_items().await?;
    let rows = paginator.fetch_page(page - 1).await?;

    let folder_ids: Vec<Uuid> = rows.iter().map(|f| f.id).collect();
    let sizes = compute_folder_sizes(&state.db, &folder_ids).await?;

    let folders_list = rows
        .iter()
        .map(|f| FolderResponse::from_models(f, &owner, sizes.get(&f.id).copied().unwrap_or(0)))
        .collect();

    Ok(Json(ListFoldersResponse {
        folders: folders_list,
        total,
        page,
        limit,
    }))
}

#[utoipa::path(
    post,
    path = "/",
    request_body = CreateFolderRequest,
    responses(
        (status = 201, description = "Folder created", body = FolderResponse),
        SessionAuthErrors,
        (status = 404, description = "Parent folder not found"),
    )
)]
pub async fn create_folder(
    State(state): State<AppState>,
    auth: AuthUser,
    Valid(Json(payload)): Valid<Json<CreateFolderRequest>>,
) -> Result<(StatusCode, Json<FolderResponse>), AuthError> {
    let name = trim_name(&payload.name)?;
    let owner = load_owner(&state.db, auth.user_id).await?;
    let now = Utc::now().fixed_offset();
    let folder_id = Uuid::new_v4();
    let txn = state.db.begin().await?;

    if let Some(parent_id) = payload.folder_id {
        // Lock parent row to prevent concurrent soft-delete between validation and INSERT
        folders::Entity::find_by_id(parent_id)
            .filter(folders::Column::OwnerId.eq(auth.user_id))
            .filter(folders::Column::IsDeleted.eq(false))
            .lock(LockType::Update)
            .one(&txn)
            .await?
            .ok_or(AuthError::NotFound)?;
    }

    let folder = folders::ActiveModel {
        id: Set(folder_id),
        name: Set(name),
        folder_id: Set(payload.folder_id),
        owner_id: Set(auth.user_id),
        is_deleted: Set(false),
        deleted_at: Set(None),
        created_at: Set(Some(now)),
        updated_at: Set(Some(now)),
    };

    let model = folder.insert(&txn).await?;
    txn.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(FolderResponse::from_models(&model, &owner, 0)),
    ))
}

#[utoipa::path(
    get,
    path = "/{id}",
    params(("id" = Uuid, Path, description = "Folder ID")),
    responses(
        (status = 200, description = "Folder detail", body = FolderResponse),
        SessionAuthErrors,
        (status = 404, description = "Folder not found"),
    )
)]
pub async fn get_folder(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<FolderResponse>, AuthError> {
    let folder = get_owned_folder(&state.db, id, auth.user_id, false).await?;
    let owner = load_owner(&state.db, auth.user_id).await?;
    let sizes = compute_folder_sizes(&state.db, &[id]).await?;
    let total_size = sizes.get(&id).copied().unwrap_or(0);
    Ok(Json(FolderResponse::from_models(&folder, &owner, total_size)))
}

#[utoipa::path(
    patch,
    path = "/{id}",
    params(("id" = Uuid, Path, description = "Folder ID")),
    request_body = UpdateFolderRequest,
    responses(
        (status = 200, description = "Folder updated", body = FolderResponse),
        SessionAuthErrors,
        (status = 404, description = "Folder or destination not found"),
    )
)]
pub async fn update_folder(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Valid(Json(payload)): Valid<Json<UpdateFolderRequest>>,
) -> Result<Json<FolderResponse>, AuthError> {
    if payload.name.is_none() && payload.folder_id.is_none() {
        return Err(AuthError::InvalidInput(
            "name and folder_id cannot both be omitted".into(),
        ));
    }

    let new_name = if let Some(ref name) = payload.name {
        Some(trim_name(name)?)
    } else {
        None
    };

    let owner = load_owner(&state.db, auth.user_id).await?;
    let now = Utc::now().fixed_offset();
    let txn = state.db.begin().await?;

    // Lock target row first to serialize concurrent moves of the same folder
    let folder = folders::Entity::find_by_id(id)
        .filter(folders::Column::OwnerId.eq(auth.user_id))
        .filter(folders::Column::IsDeleted.eq(false))
        .lock(LockType::Update)
        .one(&txn)
        .await?
        .ok_or(AuthError::NotFound)?;

    let new_parent = match payload.folder_id {
        None => None,
        Some(None) => Some(None),
        Some(Some(parent_id)) => {
            if parent_id == id {
                return Err(AuthError::InvalidInput("circular folder reference".into()));
            }
            // Lock new parent row too; concurrent A→B / B→A moves will deadlock here,
            // causing PostgreSQL to abort one of them and prevent cycle creation.
            folders::Entity::find_by_id(parent_id)
                .filter(folders::Column::OwnerId.eq(auth.user_id))
                .filter(folders::Column::IsDeleted.eq(false))
                .lock(LockType::Update)
                .one(&txn)
                .await?
                .ok_or(AuthError::NotFound)?;
            let descendants = collect_descendant_ids(&txn, id, auth.user_id).await?;
            if descendants.contains(&parent_id) {
                return Err(AuthError::InvalidInput("circular folder reference".into()));
            }
            Some(Some(parent_id))
        }
    };

    let mut am: folders::ActiveModel = folder.clone().into();
    if let Some(name) = new_name {
        am.name = Set(name);
    }
    if let Some(parent) = new_parent {
        am.folder_id = Set(parent);
    }
    am.updated_at = Set(Some(now));
    let folder = am.update(&txn).await?;
    txn.commit().await?;

    let sizes = compute_folder_sizes(&state.db, &[id]).await?;
    let total_size = sizes.get(&id).copied().unwrap_or(0);
    Ok(Json(FolderResponse::from_models(&folder, &owner, total_size)))
}

#[utoipa::path(
    delete,
    path = "/{id}",
    params(
        ("id" = Uuid, Path, description = "Folder ID"),
        DeleteFolderQuery,
    ),
    responses(
        (status = 204, description = "Folder deleted"),
        SessionAuthErrors,
        (status = 404, description = "Folder not found"),
    )
)]
pub async fn delete_folder(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<DeleteFolderQuery>,
) -> Result<StatusCode, AuthError> {
    let to_home = query.to_home.unwrap_or(false);
    let now = Utc::now().fixed_offset();
    let txn = state.db.begin().await?;

    // アップロード/移動処理と同じフォルダー行を最初にロックして直列化する
    get_owned_folder(&txn, id, auth.user_id, true).await?;

    if to_home {
        folders::Entity::update_many()
            .col_expr(folders::Column::FolderId, Expr::value(Option::<Uuid>::None))
            .col_expr(folders::Column::UpdatedAt, Expr::value(now))
            .filter(folders::Column::FolderId.eq(id))
            .filter(folders::Column::OwnerId.eq(auth.user_id))
            .filter(folders::Column::IsDeleted.eq(false))
            .exec(&txn)
            .await?;

        files::Entity::update_many()
            .col_expr(files::Column::FolderId, Expr::value(Option::<Uuid>::None))
            .col_expr(files::Column::UpdatedAt, Expr::value(now))
            .filter(files::Column::FolderId.eq(id))
            .filter(files::Column::IsDeleted.eq(false))
            .exec(&txn)
            .await?;

        soft_delete_folders(&txn, &[id], now).await?;
    } else {
        let descendants = collect_descendant_ids(&txn, id, auth.user_id).await?;
        let mut all_folder_ids = vec![id];
        all_folder_ids.extend(descendants);
        soft_delete_folders(&txn, &all_folder_ids, now).await?;
        soft_delete_files_in_folders(&txn, &all_folder_ids, now).await?;
    }

    txn.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
