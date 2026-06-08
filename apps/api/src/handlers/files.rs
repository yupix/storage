use sea_orm::{EntityTrait, ColumnTrait, QueryFilter, ModelTrait};
use crate::extractors::CurrentUser;
use crate::payloads::files::FileResponse;
use crate::AppState;
use axum::{
    Json, extract::{State, Path},
    http::StatusCode,
};
use crate::entities::files;

#[utoipa::path(
    get,
    path = "/mine",
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
            updated_at: file.updated_at
                .map(|dt| dt.to_string())
                .unwrap_or_default(),
            sender_id: file.author_id.to_string(),
        })
        .collect();

    Ok(Json(response))
}

#[utoipa::path(
    delete,
    path = "/{id}",
    params(
        ("id" = String, Path, description = "削除するファイルのUUID")
    ),
    responses(
        (status = 204, description = "正常に削除されました（返却データなし）"),
        (status = 403, description = "このファイルを削除する権限がありません"),
        (status = 404, description = "ファイルが見つかりません"),
        (status = 500, description = "Internal server error"),
    )
)]
pub async fn delete_file(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(file_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let uuid_id = sea_orm::prelude::Uuid::parse_str(&file_id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let file_model = files::Entity::find_by_id(uuid_id)
        .one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if file_model.author_id != current_user.id {
        return Err(StatusCode::FORBIDDEN);
    }

    file_model.delete(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}
