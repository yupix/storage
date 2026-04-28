use axum::{http::StatusCode, Json, extract::State};
use sea_orm::EntityTrait;

use crate::models::{CreateUser, User};
use crate::AppState;
use entity::users;

pub async fn list_users(
    State(state): State<AppState>,
) -> (StatusCode, Json<Vec<users::Model>>) {
    match users::Entity::find().all(&state.db).await {
        Ok(users_list) => (StatusCode::OK, Json(users_list)),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(vec![])),
    }
}

pub async fn create_user(
    Json(payload): Json<CreateUser>,
) -> (StatusCode, Json<User>) {
    let user = User {
        id: 1337,
        username: payload.username,
    };

    (StatusCode::CREATED, Json(user))
}
