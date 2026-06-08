use serde::Serialize;

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct FileResponse {
    pub id: String,
    pub name: String,
    pub size: i64,
    pub updated_at: String,
    pub sender_id: String,
}