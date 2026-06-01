use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use axum_valid::Valid;
use chrono::Utc;
use sea_orm::prelude::Uuid;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder,
};
use serde::Deserialize;
use validator::Validate;

use crate::entities::{folders, users};
use crate::extractors::AuthUser;
use crate::models::{FolderResponse, ListFoldersResponse};
use crate::openapi::SessionAuthErrors;
use crate::utils::auth::AuthError;
use crate::AppState;

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct ListFoldersQuery {
    pub folder_id: Option<Uuid>,
    pub page: Option<u64>,
    pub limit: Option<u64>,
}

#[derive(Validate, Debug, Deserialize, utoipa::ToSchema)]
pub struct CreateFolderRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    pub folder_id: Option<Uuid>,
}

fn trim_name(name: &str) -> Result<String, AuthError> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.len() > 255 {
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

async fn verify_parent_folder(
    db: &sea_orm::DatabaseConnection,
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

async fn duplicate_name_exists(
    db: &sea_orm::DatabaseConnection,
    user_id: Uuid,
    parent_folder_id: Option<Uuid>,
    name: &str,
    exclude_id: Option<Uuid>,
) -> Result<bool, AuthError> {
    let mut query = folders::Entity::find()
        .filter(folders::Column::OwnerId.eq(user_id))
        .filter(folders::Column::IsDeleted.eq(false))
        .filter(folders::Column::Name.eq(name));

    query = match parent_folder_id {
        Some(pid) => query.filter(folders::Column::FolderId.eq(pid)),
        None => query.filter(folders::Column::FolderId.is_null()),
    };

    if let Some(id) = exclude_id {
        query = query.filter(folders::Column::Id.ne(id));
    }

    Ok(query.one(db).await?.is_some())
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
        .order_by_asc(folders::Column::Name);

    selector = match query.folder_id {
        Some(parent_id) => selector.filter(folders::Column::FolderId.eq(parent_id)),
        None => selector.filter(folders::Column::FolderId.is_null()),
    };

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
        (status = 409, description = "Duplicate folder name"),
    )
)]
pub async fn create_folder(
    State(state): State<AppState>,
    auth: AuthUser,
    Valid(Json(payload)): Valid<Json<CreateFolderRequest>>,
) -> Result<(StatusCode, Json<FolderResponse>), AuthError> {
    let name = trim_name(&payload.name)?;

    if let Some(parent_id) = payload.folder_id {
        verify_parent_folder(&state.db, parent_id, auth.user_id).await?;
    }

    if duplicate_name_exists(
        &state.db,
        auth.user_id,
        payload.folder_id,
        &name,
        None,
    )
    .await?
    {
        return Err(AuthError::Conflict("duplicate-folder-name".into()));
    }

    let owner = load_owner(&state.db, auth.user_id).await?;
    let now = Utc::now().fixed_offset();
    let folder_id = Uuid::new_v4();

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

    let model = folder.insert(&state.db).await?;

    Ok((
        StatusCode::CREATED,
        Json(FolderResponse::from_models(&model, &owner)),
    ))
}
