use sea_orm::{EntityTrait, ColumnTrait, QueryFilter};
use crate::extractors::CurrentUser;
use crate::AppState;
use axum::{
    Json, extract::State, 
    http::StatusCode,
};
// ⭕ 修正：preludeが迷子でも確実に files.rs を直接見に行くルートです
use crate::entities::files; 

#[derive(Debug, serde::Serialize, utoipa::ToSchema)] 
pub struct FileResponse {
    pub id: String,
    pub name: String,
    pub size: i64,
    pub updated_at: String,
    pub sender_id: String,  
}

#[utoipa::path(
    get,
    path = "/",
    responses(
        (status = 200, description = "successful", body = [FileResponse]),
        (status = 500, description = "Internal server error"),
    )
)]
pub async fn get_files(
    State(state): State<AppState>,
    current_user: CurrentUser
) -> Result<Json<Vec<FileResponse>>, StatusCode> {

    // files::Entity と書くことで、上の files.rs の中身を直接使えます
    let db_files = files::Entity::find()
        .filter(files::Column::AuthorId.eq(current_user.id.clone()))
        .all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response: Vec<FileResponse> = db_files
    .into_iter()
    .map(|file| FileResponse {
        id: file.id.to_string(),
        name: file.filename,
        size: file.filesize,
        updated_at: file.updated_at.to_string(),
        sender_id: file.author_id.to_string(),
    })
    .collect();

    Ok(Json(response))
}