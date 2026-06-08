use axum_session::Session;
use axum_session_redispool::SessionRedisPool;
use axum::{Json, extract::State};
use sea_orm::{ActiveValue::Set, EntityTrait};
use sea_orm::{ActiveModelTrait};
use sea_orm::{ColumnTrait, QueryFilter};
use chrono::{Utc};
use axum_valid::Valid;
use crate::payloads::account::{DeleteRequest};

use crate::entities::users;
use crate::utils::auth::{verify_password};
use crate::{AppState, utils::auth::AuthError};




#[utoipa::path(
    post,
    path = "/delete",
    request_body = DeleteRequest,
    responses(
        (status = 200, description = "Delete success", body = String),
    )
)]
pub async fn delete(
    session: Session<SessionRedisPool>,
    State(state):State<AppState>,
    Valid(Json(payload)): Valid<Json<DeleteRequest>>,
    
) -> Result<Json<String>, AuthError> {
    // sessionからuser_id取得
    let user_id:i64 = session
    .get::<i64>("user_id")
    .ok_or(AuthError::Forbidden)?;
    // データベースからそのaccountのidを取得 
    let user= users::Entity::find()
    .filter(users::Column::Id.eq(user_id))
    .one(&state.db)
    .await?
    .ok_or(AuthError::Forbidden)?;
    // パスワードチェック
    if !verify_password(&payload.password, &user.password_hash)?{
        return Err(AuthError::Forbidden)
    }
    let now = Utc::now().fixed_offset();
    // 削除
    let mut active: users::ActiveModel = user.into();
    active.deleted_at = Set(Some(now));
    active.update(&state.db).await?;

    Ok(Json("Delete success".to_string()))
}

