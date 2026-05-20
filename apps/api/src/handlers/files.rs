use sea_orm::{EntityTrait, ColumnTrait, QueryFilter};
use crate::extractors::CurrentUser;
use crate::AppState;
use axum::{
    Json, extract::State, 
    http::StatusCode,
};
use crate::entities::files::Entity as DbFiles;
use crate::entities::files::Column as DbColumn;

#[derive(Debug, serde::Serialize, utoipa::ToSchema)] 
pub struct FileResponse {
    pub id: String,
    pub name: String,
    pub size: i64,
    pub updated_at: String,
    pub sender_id: String,  
}

//引数としてデータベースへのpathとuser情報を受け取る
//AIコードのため後々理解＆修正
#[utoipa::path(
    get,
    path = "/",
    // request_body = LoginRequest,
    responses(
        (status = 200, description = "successful", body = [FileResponse]),
        (status = 500, description = "Internal server error"),
    )
)]
pub async fn get_files(
    State(state): State<AppState>,
    current_user: CurrentUser
) -> Result<Json<Vec<FileResponse>>, StatusCode> {

    let db_files = files::Entity::find()
        .filter(files::Column::SenderId.eq(&current_user.id))
        .all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response: Vec<FileResponse> = db_files
    .into_iter()
    .map(|file| FileResponse {
        id: file.id,
        name: file.name,
        size: file.size,
        updated_at: file.updated_at.to_string(), // 日時をStringに変換
        sender_id: file.sender_id,
    })
    .collect();

    Ok(Json(response))

}
