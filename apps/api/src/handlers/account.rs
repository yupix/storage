use axum_session::Session;
use axum_session_redispool::SessionRedisPool;
use axum::{Json, extract::State};
use sea_orm::{ActiveValue::Set, EntityTrait};
use sea_orm::ActiveModelTrait;
use sea_orm::{ColumnTrait, QueryFilter};
use chrono::{Utc, FixedOffset};
use crate::entities::users;
use crate::{AppState, models::user, utils::auth::AuthError};

#[utoipa::path(
    post,
    path = "/delete",
    responses(
        (status = 200, description = "Delete success", body = String),
    )
)]

pub async fn delete(
    session: Session<SessionRedisPool>,
    State(state):State<AppState>,
    
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
    let now = Utc::now().with_timezone(&FixedOffset::east_opt(0).unwrap());
    // 削除
    let mut active: users::ActiveModel = user.into();
    active.deleted_at = Set(Some(now));
    active.update(&state.db).await?;

    Ok(Json("Delete success".to_string()))
}