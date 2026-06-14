use axum_session::Session;
use axum_session_redispool::SessionRedisPool;
use axum::{Json, extract::State};
use sea_orm::{ActiveValue::Set, EntityTrait};
use sea_orm::{ActiveModelTrait};
use sea_orm::{ColumnTrait, QueryFilter};
use chrono::{Utc};
use axum_valid::Valid;
use crate::extractors::AuthUser;

use crate::payloads::account::{DeleteRequest};

use crate::entities::users;
use crate::utils::auth::{verify_password};
use crate::{AppState, utils::auth::AuthError};




#[utoipa::path(
    post,
    path = "/v1/accounts/me",
    request_body = DeleteRequest,
    responses(
        (status = 200, description = "Delete success", body = String),
    )
)]
pub async fn delete(
    session: Session<SessionRedisPool>,
    State(state):State<AppState>,
    auth:AuthUser,
    Valid(Json(payload)): Valid<Json<DeleteRequest>>,
    
) -> Result<Json<String>, AuthError> {
    // sessionからuser_id取得
    let user_id = auth.user_id;
    // データベースからそのaccountのidを取得 
    let user= users::Entity::find()
    .filter(users::Column::Id.eq(user_id))
    .filter(users::Column::DeletedAt.is_null())
    .one(&state.db)
    .await?
    .ok_or(AuthError::Unauthorized)?;
    // パスワードチェック
    if !verify_password(&payload.password, &user.password_hash)?{
        return Err(AuthError::Unauthorized)
    }
    let now = Utc::now().fixed_offset();
    // 削除
    let mut active: users::ActiveModel = user.into();
    active.deleted_at = Set(Some(now));
    active.update(&state.db).await?;

    session.remove("user_id");

    Ok(Json("Delete success".to_string()))
}

