use axum::{Json, extract::State};
use axum_valid::Valid;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter,
};

use crate::extractors::CurrentUser;
use crate::models::UserResponse;
use crate::openapi::{ServerError, SessionAuthErrors};
use crate::payloads::users::{ChangePasswordRequest, UpdateUserRequest};
use crate::utils::auth::{AuthError, create_password_hash, verify_password};
use crate::{AppState, entities::users};

#[axum::debug_handler]
#[utoipa::path(
    patch,
    path = "/me",
    request_body = UpdateUserRequest,
    responses(
        (status = 200, description = "更新後のユーザー情報", body = UserResponse),
        (status = 400, description = "バリデーションエラー", body = ServerError),
        (status = 409, description = "ユーザー名またはメールアドレスが既に使用されている", body = ServerError),
        SessionAuthErrors,
    )
)]
pub async fn update_me(
    State(state): State<AppState>,
    user: CurrentUser,
    Valid(Json(payload)): Valid<Json<UpdateUserRequest>>,
) -> Result<Json<UserResponse>, AuthError> {
    let UpdateUserRequest { username, email } = payload;

    let mut active = user.0.clone().into_active_model();
    let mut changed = false;

    // ユーザー名: 実際に値が変わるときだけ、重複を事前チェックして更新対象にする
    if let Some(new_username) = username {
        if new_username != user.username {
            let taken = users::Entity::find()
                .filter(users::Column::Username.eq(new_username.clone()))
                .filter(users::Column::Id.ne(user.id))
                .one(&state.db)
                .await?
                .is_some();
            if taken {
                return Err(AuthError::Conflict(
                    "このユーザー名は既に使用されています".into(),
                ));
            }
            active.username = Set(new_username);
            changed = true;
        }
    }
    // メールアドレス: 同上
    if let Some(new_email) = email {
        if new_email != user.email {
            let taken = users::Entity::find()
                .filter(users::Column::Email.eq(new_email.clone()))
                .filter(users::Column::Id.ne(user.id))
                .one(&state.db)
                .await?
                .is_some();
            if taken {
                return Err(AuthError::Conflict(
                    "このメールアドレスは既に使用されています".into(),
                ));
            }
            active.email = Set(new_email);
            changed = true;
        }
    }

    // 実際の変更が無ければ書き込みしない（updated_at も動かさない）
    if !changed {
        return Ok(Json(user.0.into()));
    }

    active.updated_at = Set(Utc::now().fixed_offset());

    // 事前チェックと更新の間の競合（TOCTOU）で UNIQUE 制約に触れた場合は 409 に落とす
    let updated = active
        .update(&state.db)
        .await
        .map_err(|e| match e.sql_err() {
            Some(sea_orm::SqlErr::UniqueConstraintViolation(_)) => AuthError::Conflict(
                "ユーザー名またはメールアドレスが既に使用されています".into(),
            ),
            _ => AuthError::Internal(anyhow::anyhow!("update user: {e}")),
        })?;

    Ok(Json(updated.into()))
}

#[axum::debug_handler]
#[utoipa::path(
    put,
    path = "/me/password",
    request_body = ChangePasswordRequest,
    responses(
        (status = 200, description = "パスワード変更成功", body = String),
        (status = 400, description = "現在のパスワードが正しくない", body = ServerError),
        SessionAuthErrors,
    )
)]
pub async fn change_password(
    State(state): State<AppState>,
    user: CurrentUser,
    Valid(Json(payload)): Valid<Json<ChangePasswordRequest>>,
) -> Result<Json<String>, AuthError> {
    let ChangePasswordRequest {
        current_password,
        new_password,
    } = payload;

    if !verify_password(&current_password, &user.password_hash)? {
        return Err(AuthError::InvalidInput(
            "現在のパスワードが正しくありません".into(),
        ));
    }

    let new_hash = create_password_hash(&new_password)?;
    let mut active = user.0.clone().into_active_model();
    active.password_hash = Set(new_hash);
    active.updated_at = Set(Utc::now().fixed_offset());
    active
        .update(&state.db)
        .await
        .map_err(|e| AuthError::Internal(anyhow::anyhow!("update password: {e}")))?;

    Ok(Json("Password changed".to_string()))
}
