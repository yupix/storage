use axum::{Json, extract::State};
use axum_session::Session;
use axum_session_redispool::SessionRedisPool;
use axum_valid::Valid;
use chrono::Utc;
use sea_orm::prelude::Uuid;
use sea_orm::{ActiveValue::Set, EntityTrait};
use sea_orm::{ColumnTrait, Condition, QueryFilter};

use crate::extractors::{AuthUser, CurrentUser};
use crate::models::UserResponse;
use crate::openapi::{CredentialErrors, InternalOnlyError, SessionAuthErrors, UnauthorizedErrors};
use crate::payloads::auth::{LoginRequest, RegisterRequest};
use crate::utils::auth::{AuthError, create_password_hash, verify_password};
use crate::{AppState, entities::users};

#[axum::debug_handler]
#[utoipa::path(
    post,
    path = "/login",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Login successful", body = String),
        CredentialErrors,
    )
)]
pub async fn login(
    session: Session<SessionRedisPool>,
    State(state): State<AppState>,
    Valid(Json(payload)): Valid<Json<LoginRequest>>,
) -> Result<Json<String>, AuthError> {
    let LoginRequest { email, password } = payload;

    // email フィールドはユーザー名／メールアドレスのどちらでも受け付ける
    let user = users::Entity::find()
        .filter(
            Condition::any()
                .add(users::Column::Email.eq(email.clone()))
                .add(users::Column::Username.eq(email)),
        )
        .one(&state.db)
        .await?
        .ok_or(AuthError::Forbidden)?;
    if verify_password(&password, &user.password_hash)? {
        session.set("user_id", user.id);
        Ok(Json("Login successful".to_string()))
    } else {
        Err(AuthError::Forbidden)
    }
}

#[axum::debug_handler]
#[utoipa::path(
    post,
    path = "/register",
    request_body = RegisterRequest,
    responses(
        (status = 200, description = "Register successful", body = String),
        InternalOnlyError,
    )
)]
pub async fn register(
    session: Session<SessionRedisPool>,
    State(state): State<AppState>,
    Valid(Json(payload)): Valid<Json<RegisterRequest>>,
) -> Result<Json<String>, AuthError> {
    let RegisterRequest {
        username,
        email,
        password,
    } = payload;

    let password_hash = create_password_hash(&password)?;
    let user_id = Uuid::new_v4();

    let now = Utc::now().fixed_offset();
    let user = users::ActiveModel {
        id: Set(user_id),
        username: Set(username),
        avatar_url: Set(None),
        email: Set(email),
        password_hash: Set(password_hash),
        is_suspended: Set(false),
        deleted_at: Set(None),
        freeze_reason: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    };

    users::Entity::insert(user.clone())
        .exec(&state.db)
        .await
        .map_err(|e| AuthError::Internal(anyhow::anyhow!("insert user: {e}")))?;

    session.set("user_id", user_id);
    Ok(Json("Register successful".to_string()))
}

#[axum::debug_handler]
#[utoipa::path(
    get,
    path = "/me",
    responses(
        (status = 200, description = "Current user info", body = UserResponse),
        SessionAuthErrors,
    )
)]
pub async fn me(
    State(_): State<AppState>,
    user: CurrentUser,
) -> Result<Json<UserResponse>, AuthError> {
    Ok(Json(user.0.into()))
}

#[axum::debug_handler]
#[utoipa::path(
    post,
    path = "/logout",
    responses(
        (status = 200, description = "Logout successful", body = String),
        UnauthorizedErrors,
    )
)]
pub async fn logout(
    session: Session<SessionRedisPool>,
    State(_): State<AppState>,
    _auth: AuthUser,
) -> Result<Json<String>, AuthError> {
    session.remove("user_id");
    Ok(Json("Logout successful".to_string()))
}
