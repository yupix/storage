use sea_orm::{EntityTrait, ColumnTrait, QueryFilter};
use crate::extractors::CurrentUser; // 
use crate::AppState;
use axum::{Json, extract::State, http::StatusCode};

#[derive(Debug, serde::Serialize, utoipa::ToSchema)] 
pub struct FileResponse {
    pub id: String,
    pub name: String,
    pub size: i64,
    pub updated_at: String,
    pub sender_id: String,  
}

//引数としてデータベースへのpathとuser情報を受け取る
pub async fn get_files(
    State(state): State<AppState>,
    current_user: CurrentUser
) -> Result<Json<Vec<FileResponse>>, StatusCode> {
    
}
