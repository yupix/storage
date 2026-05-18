use axum::{Json, extract::State};
use sea_orm::{EntityTrait, ColumnTrait, QueryFilter};
use crate::extractors::CurrentUser; // 


#[derive(Debug, serde::Serialize, utoipa::ToSchema)] 
pub struct FileResponse {
    pub id: String,
    pub name: String,
    pub size: i64,
    pub updated_at: String,
}

