use axum::{
    Json, 
    extract::{State, Path, Query},
    http::StatusCode,
};
use sea_orm::{Paginator, PaginatorTrait, sqlx::query_builder};
use sea_orm::{EntityTrait, ColumnTrait, QueryFilter, ModelTrait};
use crate::extractors::CurrentUser;
use crate::payloads::files::{FileListQuery, FileResponse, PaginatedFileResponse};
use crate::AppState;
use crate::entities::files;

#[utoipa::path(
    get,
    path = "/mine",
    responses(
        (status = 200, description = "successful", body = PaginatedFileResponse),
        (status = 500, description = "Internal server error"),
    )
)]
pub async fn get_files(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Query(query): Query<FileListQuery>
) -> Result<Json<PaginatedFileResponse>, StatusCode> {

    //page番号の決定(省略時は1)
    let page = query.page.unwrap_or(1);

    //件数の決定(50~100の範囲)
    let mut limit = query.limit.unwrap_or(50);
    if limit > 100 {
        limit = 100;
    }

    let mut query_builder = files::Entity::find()
    .filter(files::Column::AuthorId.eq(current_user.id.clone()))
    .filter(files::Column::IsDeleted.eq(false));

    if let Some(f_id) = query.folder_id {
        //指定フォルダー内のみ
        query_builder = query_builder.filter(files::Column::FolderId.eq(f_id));
    } else {
        //省略時はルート
        query_builder = query_builder.filter(files::Column::FolderId.is_null())
    }

    // ページネーターの作成
    let pagenator = query_builder.paginate(&state.db, limit);
    
    // 総件数の取得
    let total_items = pagenator.num_items().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // 指定ページのデータ取得
    let db_files = pagenator
        .fetch_page(page - 1)        
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    // 🛠️ 【ここまで差し替え】

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

    // 🛠️ 【ここも差し替え！】古い Ok(Json(response)) から、大きな箱に詰め替える処理に変更
    let final_response = PaginatedFileResponse {
        files: response,
        total: total_items,
        page,
        limit,
    };
    
    Ok(Json(final_response))
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
