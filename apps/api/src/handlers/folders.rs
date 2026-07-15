use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use axum_valid::Valid;
use chrono::Utc;
use sea_orm::prelude::{DateTimeWithTimeZone, Uuid};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, Condition, ConnectionTrait, EntityTrait,
    FromQueryResult, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Statement, TransactionTrait,
};
use sea_orm::sea_query::{Expr, LockType};

use crate::entities::{files, folders, users};
use crate::extractors::AuthUser;
use crate::utils::storage::StorageDriver;
use crate::models::{FolderResponse, ListFoldersResponse};
use crate::openapi::SessionAuthErrors;
use crate::payloads::folders::{CreateFolderRequest, DeleteFolderQuery, ListFoldersQuery, UpdateFolderRequest};
use crate::utils::auth::AuthError;
use crate::utils::folder_size::adjust_folder_chain;
use crate::utils::name_dedup;
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

const STORAGE_DELETE_CONCURRENCY: usize = 16;

fn make_uuid_array(ids: &[Uuid]) -> sea_orm::Value {
    let values: Vec<sea_orm::Value> = ids.iter().map(|id| sea_orm::Value::Uuid(Some(*id))).collect();
    sea_orm::Value::Array(sea_orm::sea_query::ArrayType::Uuid, Some(Box::new(values)))
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
        sea_orm::DatabaseBackend::Postgres,
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

    let favorites_across_hierarchy = query.is_favorite == Some(true);
    if let Some(is_favorite) = query.is_favorite {
        selector = selector.filter(folders::Column::IsFavorite.eq(is_favorite));
    }

    // Only the favorites view spans the full folder hierarchy.
    if !favorites_across_hierarchy {
        selector = match query.folder_id {
            Some(parent_id) => selector.filter(folders::Column::FolderId.eq(parent_id)),
            None => selector.filter(folders::Column::FolderId.is_null()),
        };
    }

    let paginator = selector.paginate(&state.db, limit);
    let total = paginator.num_items().await?;
    let rows = paginator.fetch_page(page - 1).await?;

    let folders_list = rows
        .iter()
        .map(|f| FolderResponse::from_models(f, &owner))
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

    // 同一親フォルダー内の同名フォルダーを避けるため、未使用の名前へ採番する
    let name = name_dedup::dedup_folder_name(&txn, auth.user_id, payload.folder_id, &name, None).await?;

    let folder = folders::ActiveModel {
        id: Set(folder_id),
        name: Set(name),
        folder_id: Set(payload.folder_id),
        owner_id: Set(auth.user_id),
        is_deleted: Set(false),
        is_favorite: Set(false),
        total_size: Set(0),
        deleted_at: Set(None),
        created_at: Set(Some(now)),
        updated_at: Set(Some(now)),
    };

    let model = folder.insert(&txn).await?;
    txn.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(FolderResponse::from_models(&model, &owner)),
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
    Ok(Json(FolderResponse::from_models(&folder, &owner)))
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
    if payload.name.is_none() && payload.folder_id.is_none() && payload.is_favorite.is_none() {
        return Err(AuthError::InvalidInput(
            "name, folder_id and is_favorite cannot all be omitted".into(),
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

    // フォルダーを移動する場合、旧親から total_size を引き、新親に加算する
    if let Some(ref np) = new_parent {
        let size = folder.total_size;
        adjust_folder_chain(&txn, folder.folder_id, -size, now).await?;
        adjust_folder_chain(&txn, *np, size, now).await?;
    }

    let mut am: folders::ActiveModel = folder.clone().into();
    // リネーム/移動時は、移動先の親フォルダー内で自分以外の同名を避けて採番する
    if new_name.is_some() || payload.folder_id.is_some() {
        let effective_parent = match new_parent {
            Some(parent) => parent,
            None => folder.folder_id,
        };
        let desired = new_name.unwrap_or_else(|| folder.name.clone());
        am.name = Set(name_dedup::dedup_folder_name(
            &txn,
            auth.user_id,
            effective_parent,
            &desired,
            Some(folder.id),
        )
        .await?);
    }
    if let Some(parent) = new_parent {
        am.folder_id = Set(parent);
    }
    if let Some(is_favorite) = payload.is_favorite {
        am.is_favorite = Set(is_favorite);
    }
    am.updated_at = Set(Some(now));
    let folder = am.update(&txn).await?;
    txn.commit().await?;

    Ok(Json(FolderResponse::from_models(&folder, &owner)))
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
    let folder = get_owned_folder(&txn, id, auth.user_id, true).await?;

    // 親フォルダーの total_size からこのフォルダーの合計サイズ分を引く
    adjust_folder_chain(&txn, folder.folder_id, -folder.total_size, now).await?;

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

// 削除済みの子孫フォルダー ID を再帰 CTE で収集する
async fn collect_deleted_descendant_ids<C: ConnectionTrait>(
    db: &C,
    root_id: Uuid,
    user_id: Uuid,
    min_deleted_at: Option<DateTimeWithTimeZone>,
) -> Result<Vec<Uuid>, AuthError> {
    // min_deleted_at が指定されている場合、それ以前に個別削除された子孫は除外する。
    // 親フォルダーと同時に削除された子孫のみ対象とすることで、ユーザーが
    // 明示的に削除した子フォルダーを意図せず復元しないようにする。
    let sql = match min_deleted_at {
        Some(_) => r#"
            WITH RECURSIVE descendants AS (
                SELECT id FROM folders
                WHERE folder_id = $1 AND owner_id = $2 AND is_deleted = true AND deleted_at >= $3
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN descendants d ON f.folder_id = d.id
                WHERE f.owner_id = $2 AND f.is_deleted = true AND f.deleted_at >= $3
            )
            SELECT id FROM descendants
        "#,
        None => r#"
            WITH RECURSIVE descendants AS (
                SELECT id FROM folders
                WHERE folder_id = $1 AND owner_id = $2 AND is_deleted = true
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN descendants d ON f.folder_id = d.id
                WHERE f.owner_id = $2 AND f.is_deleted = true
            )
            SELECT id FROM descendants
        "#,
    };
    let stmt = match min_deleted_at {
        Some(ts) => Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            sql,
            [root_id.into(), user_id.into(), ts.into()],
        ),
        None => Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            sql,
            [root_id.into(), user_id.into()],
        ),
    };
    let rows = DescendantId::find_by_statement(stmt).all(db).await?;
    Ok(rows.into_iter().map(|r| r.id).collect())
}

#[utoipa::path(
    get,
    path = "/trash",
    params(ListFoldersQuery),
    responses(
        (status = 200, description = "ゴミ箱内フォルダー一覧", body = ListFoldersResponse),
        SessionAuthErrors,
    )
)]
pub async fn get_trash_folders(
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

    // 親フォルダー自体も削除済みのものは除外（ゴミ箱のトップレベルのみ表示）。
    // IN リストではなくサブクエリで除外し、削除済みフォルダーが大量でも
    // PostgreSQL のパラメーター上限（65535）を超えないようにする。
    let deleted_ids_subquery = sea_orm::sea_query::Query::select()
        .column(folders::Column::Id)
        .from(folders::Entity)
        .cond_where(
            Condition::all()
                .add(folders::Column::OwnerId.eq(auth.user_id))
                .add(folders::Column::IsDeleted.eq(true))
        )
        .to_owned();

    let paginator = folders::Entity::find()
        .filter(folders::Column::OwnerId.eq(auth.user_id))
        .filter(folders::Column::IsDeleted.eq(true))
        .filter(
            Condition::any()
                .add(folders::Column::FolderId.is_null())
                .add(folders::Column::FolderId.not_in_subquery(deleted_ids_subquery)),
        )
        .order_by_desc(folders::Column::DeletedAt)
        .paginate(&state.db, limit);

    let total = paginator.num_items().await?;
    let folder_rows = paginator.fetch_page(page - 1).await?;
    let owner = load_owner(&state.db, auth.user_id).await?;
    let folders_resp = folder_rows.iter().map(|f| FolderResponse::from_models(f, &owner)).collect();

    Ok(Json(ListFoldersResponse { folders: folders_resp, total, page, limit }))
}

#[utoipa::path(
    post,
    path = "/trash/{id}/restore",
    params(("id" = Uuid, Path, description = "復元するフォルダーID")),
    responses(
        (status = 204, description = "復元しました"),
        (status = 400, description = "ゴミ箱にないフォルダー"),
        SessionAuthErrors,
        (status = 404, description = "フォルダーが見つかりません"),
    )
)]
pub async fn restore_folder(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AuthError> {
    let now = Utc::now().fixed_offset();
    let txn = state.db.begin().await?;

    // ロック順序を delete_folder と統一（親 → 子）するため、
    // まずロックなしで対象フォルダーを読み folder_id を取得する。
    let folder_preview = folders::Entity::find_by_id(id)
        .filter(folders::Column::OwnerId.eq(auth.user_id))
        .one(&txn)
        .await?
        .ok_or(AuthError::NotFound)?;

    if !folder_preview.is_deleted {
        let _ = txn.rollback().await;
        return Err(AuthError::InvalidInput("フォルダーはゴミ箱にありません".into()));
    }

    // 親フォルダーが存在する場合、先にロックしてから削除状態を再確認する。
    // delete_folder と同じ親→子ロック順でデッドロックを防ぎ、ロック取得後の
    // 再確認で「確認後に親が削除 → 孤立」の競合を排除する。
    if let Some(parent_id) = folder_preview.folder_id {
        let parent = folders::Entity::find_by_id(parent_id)
            .filter(folders::Column::OwnerId.eq(auth.user_id))
            .lock(LockType::Update)
            .one(&txn)
            .await?;
        match parent {
            None => {
                let _ = txn.rollback().await;
                return Err(AuthError::InvalidInput("親フォルダーが存在しません".into()));
            }
            Some(p) if p.is_deleted => {
                let _ = txn.rollback().await;
                return Err(AuthError::InvalidInput("親フォルダーがゴミ箱にあります。親フォルダーを復元してください".into()));
            }
            Some(_) => {}
        }
    }

    // 親フォルダーの後に対象フォルダーをロックし（親→子順）、状態を再確認する。
    let folder = folders::Entity::find_by_id(id)
        .filter(folders::Column::OwnerId.eq(auth.user_id))
        .lock(LockType::Update)
        .one(&txn)
        .await?
        .ok_or(AuthError::NotFound)?;

    if !folder.is_deleted {
        let _ = txn.rollback().await;
        return Err(AuthError::InvalidInput("フォルダーはゴミ箱にありません".into()));
    }

    let descendant_ids = collect_deleted_descendant_ids(&txn, id, auth.user_id, folder.deleted_at).await?;
    let mut all_folder_ids = vec![id];
    all_folder_ids.extend(descendant_ids);

    // is_in() は ID ごとにパラメーターを展開するため 65535 件超で失敗する。
    // ANY($1::uuid[]) で配列を 1 パラメーターにまとめて上限を回避する。
    let id_array = make_uuid_array(&all_folder_ids);

    // すべての削除済みフォルダーを復元
    txn.execute_raw(Statement::from_sql_and_values(
        sea_orm::DatabaseBackend::Postgres,
        "UPDATE folders SET is_deleted = false, deleted_at = NULL, updated_at = $2 WHERE id = ANY($1)",
        [id_array.clone(), now.into()],
    )).await?;

    // フォルダーと同時にゴミ箱へ移されたファイルだけを復元する。
    // フォルダー削除前に個別削除されたファイル（deleted_at < folder.deleted_at）は
    // ユーザーが意図して削除したものなので復元しない。
    if let Some(folder_deleted_at) = folder.deleted_at {
        txn.execute_raw(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            "UPDATE files SET is_deleted = false, deleted_at = NULL, updated_at = $2 \
             WHERE folder_id = ANY($1) AND is_deleted = true AND deleted_at >= $3",
            [id_array.clone(), now.into(), folder_deleted_at.into()],
        )).await?;
    }

    // 復元したサブツリーの total_size を再計算する
    // ANY($1) でパラメータバインドしてクエリプランをキャッシュ可能にする
    let cte_sql = r#"
        WITH RECURSIVE subtree AS (
            SELECT id AS ancestor_id, id AS folder_id
            FROM folders WHERE id = ANY($1)
            UNION ALL
            SELECT s.ancestor_id, f.id AS folder_id
            FROM folders f
            INNER JOIN subtree s ON f.folder_id = s.folder_id
            WHERE f.is_deleted = false
        ),
        sizes AS (
            SELECT s.ancestor_id, COALESCE(SUM(fi.filesize), 0)::bigint AS total_size
            FROM subtree s
            LEFT JOIN files fi ON fi.folder_id = s.folder_id AND fi.is_deleted = false
            GROUP BY s.ancestor_id
        )
        UPDATE folders SET total_size = sizes.total_size
        FROM sizes WHERE folders.id = sizes.ancestor_id
    "#;
    txn.execute_raw(Statement::from_sql_and_values(
        sea_orm::DatabaseBackend::Postgres,
        cte_sql,
        [id_array],
    )).await?;

    // 最新の total_size を取得して親チェーンに加算する
    let updated = folders::Entity::find_by_id(id).one(&txn).await?.ok_or(AuthError::NotFound)?;
    adjust_folder_chain(&txn, updated.folder_id, updated.total_size, now).await?;

    txn.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    delete,
    path = "/trash/{id}",
    params(("id" = Uuid, Path, description = "完全削除するフォルダーID")),
    responses(
        (status = 204, description = "完全削除しました"),
        (status = 400, description = "ゴミ箱にないフォルダー"),
        SessionAuthErrors,
        (status = 404, description = "フォルダーが見つかりません"),
    )
)]
pub async fn purge_folder(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AuthError> {
    let txn = state.db.begin().await?;

    let folder = folders::Entity::find_by_id(id)
        .filter(folders::Column::OwnerId.eq(auth.user_id))
        .filter(folders::Column::IsDeleted.eq(true))
        .lock(LockType::Update)
        .one(&txn)
        .await?
        .ok_or(AuthError::NotFound)?;

    if !folder.is_deleted {
        let _ = txn.rollback().await;
        return Err(AuthError::InvalidInput("フォルダーはゴミ箱にありません".into()));
    }

    let descendant_ids = collect_deleted_descendant_ids(&txn, id, auth.user_id, None).await?;
    let mut all_folder_ids = vec![id];
    all_folder_ids.extend(descendant_ids);

    let id_array = make_uuid_array(&all_folder_ids);

    // フォルダー内のファイルをすべて取得（ストレージ削除用）。
    // is_in() ではなく ANY($1) で取得し、サブツリーが大きくてもパラメーター上限を超えない。
    let files_to_delete = files::Model::find_by_statement(Statement::from_sql_and_values(
        sea_orm::DatabaseBackend::Postgres,
        "SELECT * FROM files WHERE folder_id = ANY($1) FOR UPDATE",
        [id_array.clone()],
    )).all(&txn).await?;

    // DB からファイル・フォルダーを削除
    txn.execute_raw(Statement::from_sql_and_values(
        sea_orm::DatabaseBackend::Postgres,
        "DELETE FROM files WHERE folder_id = ANY($1)",
        [id_array.clone()],
    )).await?;
    txn.execute_raw(Statement::from_sql_and_values(
        sea_orm::DatabaseBackend::Postgres,
        "DELETE FROM folders WHERE id = ANY($1)",
        [id_array],
    )).await?;
    txn.commit().await?;

    // ストレージオブジェクトを削除（同時実行数を制限してレート制限を回避する）
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(STORAGE_DELETE_CONCURRENCY));
    let mut join_set = tokio::task::JoinSet::new();
    for file in files_to_delete {
        let storage = state.storage.clone();
        let url = file.url.clone();
        let permit = sem.clone().acquire_owned().await.unwrap();
        join_set.spawn(async move {
            let _permit = permit;
            if let Err(e) = storage.delete(&url).await {
                tracing::warn!("ストレージ削除失敗 key={}: {e}", url);
            }
        });
    }
    while join_set.join_next().await.is_some() {}

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    delete,
    path = "/trash",
    responses(
        (status = 204, description = "すべての削除済みフォルダーを完全削除しました"),
        SessionAuthErrors,
    )
)]
pub async fn empty_trash_folders(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<StatusCode, AuthError> {
    let txn = state.db.begin().await?;

    // 削除済みフォルダーを行ロックする（restore_folder との競合を直列化）。
    // ID リストではなく条件で直接ロックし、フォルダー数が多くてもパラメーター上限を超えない。
    let locked = DescendantId::find_by_statement(Statement::from_sql_and_values(
        sea_orm::DatabaseBackend::Postgres,
        "SELECT id FROM folders WHERE owner_id = $1 AND is_deleted = true FOR UPDATE",
        [auth.user_id.into()],
    )).all(&txn).await?;

    if locked.is_empty() {
        let _ = txn.rollback().await;
        return Ok(StatusCode::NO_CONTENT);
    }

    // フォルダー内のファイルをすべて取得（ストレージ削除用）。
    // JOIN で絞り込み、フォルダーが大量でもパラメーター上限を超えない。
    let files_to_delete = files::Model::find_by_statement(Statement::from_sql_and_values(
        sea_orm::DatabaseBackend::Postgres,
        r#"SELECT f.* FROM files f
           INNER JOIN folders fo ON fo.id = f.folder_id
           WHERE fo.owner_id = $1 AND fo.is_deleted = true
           FOR UPDATE OF f"#,
        [auth.user_id.into()],
    )).all(&txn).await?;

    // DB からファイル・フォルダーを削除（サブクエリで IN リストを回避）
    txn.execute_raw(Statement::from_sql_and_values(
        sea_orm::DatabaseBackend::Postgres,
        "DELETE FROM files WHERE folder_id IN (SELECT id FROM folders WHERE owner_id = $1 AND is_deleted = true)",
        [auth.user_id.into()],
    )).await?;
    txn.execute_raw(Statement::from_sql_and_values(
        sea_orm::DatabaseBackend::Postgres,
        "DELETE FROM folders WHERE owner_id = $1 AND is_deleted = true",
        [auth.user_id.into()],
    )).await?;
    txn.commit().await?;

    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(STORAGE_DELETE_CONCURRENCY));
    let mut join_set = tokio::task::JoinSet::new();
    for file in files_to_delete {
        let storage = state.storage.clone();
        let url = file.url.clone();
        let permit = sem.clone().acquire_owned().await.unwrap();
        join_set.spawn(async move {
            let _permit = permit;
            if let Err(e) = storage.delete(&url).await {
                tracing::warn!("ストレージ削除失敗 key={}: {e}", url);
            }
        });
    }
    while join_set.join_next().await.is_some() {}

    Ok(StatusCode::NO_CONTENT)
}
