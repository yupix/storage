use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use axum_valid::Valid;
use chrono::Utc;
use sea_orm::prelude::Uuid;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, EntityTrait, PaginatorTrait,
    QueryFilter, QueryOrder,
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

#[derive(Validate, Debug, Deserialize, utoipa::ToSchema)]
pub struct UpdateFolderRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub folder_id: Option<Option<Uuid>>,
}

fn deserialize_optional_field<'de, D>(
    deserializer: D,
) -> Result<Option<Option<Uuid>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<Uuid>::deserialize(deserializer).map(Some)
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

async fn get_owned_folder(
    db: &sea_orm::DatabaseConnection,
    folder_id: Uuid,
    user_id: Uuid,
) -> Result<folders::Model, AuthError> {
    folders::Entity::find_by_id(folder_id)
        .filter(folders::Column::OwnerId.eq(user_id))
        .filter(folders::Column::IsDeleted.eq(false))
        .one(db)
        .await?
        .ok_or(AuthError::NotFound)
}

async fn collect_descendant_ids<C: ConnectionTrait>(
    db: &C,
    root_id: Uuid,
    user_id: Uuid,
) -> Result<Vec<Uuid>, AuthError> {
    let mut descendants = Vec::new();
    let mut queue = vec![root_id];

    while let Some(current) = queue.pop() {
        let children = folders::Entity::find()
            .filter(folders::Column::FolderId.eq(current))
            .filter(folders::Column::OwnerId.eq(user_id))
            .filter(folders::Column::IsDeleted.eq(false))
            .all(db)
            .await?;

        for child in children {
            descendants.push(child.id);
            queue.push(child.id);
        }
    }

    Ok(descendants)
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
    let folder = get_owned_folder(&state.db, id, auth.user_id).await?;
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
        (status = 409, description = "Duplicate folder name"),
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

    let mut folder = get_owned_folder(&state.db, id, auth.user_id).await?;
    let owner = load_owner(&state.db, auth.user_id).await?;
    let now = Utc::now().fixed_offset();

    let new_name = if let Some(ref name) = payload.name {
        Some(trim_name(name)?)
    } else {
        None
    };

    let new_parent = match payload.folder_id {
        None => None,
        Some(None) => Some(None),
        Some(Some(parent_id)) => {
            if parent_id == id {
                return Err(AuthError::InvalidInput("circular folder reference".into()));
            }
            verify_parent_folder(&state.db, parent_id, auth.user_id).await?;
            let descendants = collect_descendant_ids(&state.db, id, auth.user_id).await?;
            if descendants.contains(&parent_id) {
                return Err(AuthError::InvalidInput("circular folder reference".into()));
            }
            Some(Some(parent_id))
        }
    };

    let effective_parent = match new_parent {
        Some(ref p) => *p,
        None => folder.folder_id,
    };

    let effective_name = new_name.as_deref().unwrap_or(&folder.name);

    if duplicate_name_exists(
        &state.db,
        auth.user_id,
        effective_parent,
        effective_name,
        Some(id),
    )
    .await?
    {
        return Err(AuthError::Conflict("duplicate-folder-name".into()));
    }

    let mut am: folders::ActiveModel = folder.clone().into();
    if let Some(name) = new_name {
        am.name = Set(name);
    }
    if let Some(parent) = new_parent {
        am.folder_id = Set(parent);
    }
    am.updated_at = Set(Some(now));
    folder = am.update(&state.db).await?;

    Ok(Json(FolderResponse::from_models(&folder, &owner)))
}
