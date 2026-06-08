use sea_orm::prelude::{DateTimeWithTimeZone, Uuid};
use serde::Serialize;
use utoipa::ToSchema;

use crate::entities::{folders, users};
use crate::models::OwnerInfo;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FolderResponse {
    pub id: Uuid,
    pub name: String,
    pub folder_id: Option<Uuid>,
    pub owner: OwnerInfo,
    #[schema(value_type = String, format = "date-time")]
    pub created_at: DateTimeWithTimeZone,
    #[schema(value_type = String, format = "date-time")]
    pub updated_at: DateTimeWithTimeZone,
}

impl FolderResponse {
    pub fn from_models(folder: &folders::Model, owner: &users::Model) -> Self {
        Self {
            id: folder.id,
            name: folder.name.clone(),
            folder_id: folder.folder_id,
            owner: OwnerInfo::from(owner),
            created_at: folder
                .created_at
                .unwrap_or_else(|| owner.created_at.clone()),
            updated_at: folder
                .updated_at
                .unwrap_or_else(|| owner.updated_at.clone()),
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ListFoldersResponse {
    pub folders: Vec<FolderResponse>,
    pub total: u64,
    pub page: u64,
    pub limit: u64,
}
