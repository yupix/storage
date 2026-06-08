use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct FileListQuery {
    pub folder_id: Option<String>,
    pub page: Option<u64>,
    pub limit: Option<u64>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct FileResponse {
    pub id: String,
    pub name: String,
    pub size: i64,
    pub updated_at: String,
    pub sender_id: String,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct PaginatedFileResponse {
    pub files: Vec<FileResponse>,
    pub total: u64,
    pub page: u64,
    pub limit: u64,
}
