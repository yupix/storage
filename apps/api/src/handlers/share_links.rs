use argon2::password_hash::rand_core::{OsRng, RngCore};
use axum::{
    Json,
    extract::{Path, State},
    http::{StatusCode, Uri, header},
    response::IntoResponse,
};
use chrono::Utc;
use sea_orm::prelude::Uuid;
use sea_orm::{ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};
use std::time::Duration;

use crate::AppState;
use crate::entities::{files, share_links, users};
use crate::extractors::CurrentUser;
use crate::openapi::SessionAuthErrors;
use crate::payloads::share_links::{
    CreateShareLinkRequest, PublicShareResponse, ShareLinkResponse,
};
use crate::utils::auth::AuthError;
use crate::utils::storage::StorageDriver;

/// 署名付き URL の有効期限（秒）。認証済みの view と揃える。
const SIGNED_URL_TTL_SECS: u64 = 3600;

/// 推測不可能な 256bit のトークンを生成する（hex 64 文字）。
fn generate_token() -> String {
    let mut rng = OsRng;
    let mut bytes = [0u8; 32];
    rng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// token から有効な共有リンクと対象ファイルを引く公開アクセスの認可の要。
///
/// セッションを一切見ず token のみで認可する。以下を満たさない場合は
/// すべて 404 として扱い、リンクの存在有無を漏らさない。
/// - token に一致するリンクが存在する
/// - `expires_at` が未来（無期限は許可）
/// - 対象ファイルが未削除
/// - ファイル所有者が凍結されていない
///
/// 返すファイルは token に紐づく 1 件のみ。呼び出し元がファイルを指定する経路は無い。
async fn resolve_active_share(
    state: &AppState,
    token: &str,
) -> Result<(share_links::Model, files::Model), AuthError> {
    let link = share_links::Entity::find()
        .filter(share_links::Column::Token.eq(token))
        .one(&state.db)
        .await?
        .ok_or(AuthError::NotFound)?;

    if let Some(expires_at) = link.expires_at {
        if expires_at <= Utc::now().fixed_offset() {
            return Err(AuthError::NotFound);
        }
    }

    let file = files::Entity::find_by_id(link.file_id)
        .filter(files::Column::IsDeleted.eq(false))
        .one(&state.db)
        .await?
        .ok_or(AuthError::NotFound)?;

    // 所有者が凍結されている場合は共有を無効化する（認証済みアクセスと同じ扱い）。
    let owner = users::Entity::find_by_id(file.author_id)
        .one(&state.db)
        .await?
        .ok_or(AuthError::NotFound)?;
    if owner.is_suspended {
        return Err(AuthError::NotFound);
    }

    Ok((link, file))
}

#[utoipa::path(
    post,
    path = "/",
    request_body = CreateShareLinkRequest,
    responses(
        (status = 201, description = "共有リンクを発行", body = ShareLinkResponse),
        SessionAuthErrors,
        (status = 400, description = "不正なリクエスト"),
        (status = 404, description = "ファイルが見つかりません"),
    )
)]
pub async fn create_share_link(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Json(payload): Json<CreateShareLinkRequest>,
) -> Result<(StatusCode, Json<ShareLinkResponse>), AuthError> {
    // 発行はファイルの所有者のみ。共有されただけのユーザーによる再共有は許可しない。
    let file = files::Entity::find_by_id(payload.file_id)
        .filter(files::Column::IsDeleted.eq(false))
        .one(&state.db)
        .await?
        .ok_or(AuthError::NotFound)?;
    if file.author_id != current_user.id {
        return Err(AuthError::Forbidden);
    }

    let expires_at = match payload.expires_in_seconds {
        None => None,
        Some(0) => {
            return Err(AuthError::InvalidInput(
                "expires_in_seconds は 1 以上にしてください".into(),
            ));
        }
        Some(seconds) => {
            let seconds = i64::try_from(seconds).map_err(|_| {
                AuthError::InvalidInput("expires_in_seconds が大きすぎます".into())
            })?;
            // Duration::seconds は内部のミリ秒表現の範囲を超えるとパニックするため、
            // try_seconds でオーバーフローを検知して 400 として返す。
            let duration = chrono::Duration::try_seconds(seconds).ok_or_else(|| {
                AuthError::InvalidInput("expires_in_seconds が大きすぎます".into())
            })?;
            let expires_at = Utc::now()
                .checked_add_signed(duration)
                .ok_or_else(|| {
                    AuthError::InvalidInput("expires_in_seconds が大きすぎます".into())
                })?;
            Some(expires_at.fixed_offset())
        }
    };

    let download_allowed = payload.download_allowed.unwrap_or(true);
    let now = Utc::now().fixed_offset();
    let token = generate_token();

    let model = share_links::ActiveModel {
        id: Set(Uuid::new_v4()),
        file_id: Set(file.id),
        token: Set(token.clone()),
        expires_at: Set(expires_at),
        // パスワード保護は v1 では未対応。
        password_hash: Set(None),
        download_allowed: Set(download_allowed),
        created_at: Set(now),
    };
    share_links::Entity::insert(model).exec(&state.db).await?;

    Ok((
        StatusCode::CREATED,
        Json(ShareLinkResponse {
            token,
            expires_at: expires_at.map(|dt| dt.to_rfc3339()),
            download_allowed,
            created_at: now.to_rfc3339(),
        }),
    ))
}

#[utoipa::path(
    get,
    path = "/{token}",
    params(("token" = String, Path, description = "共有トークン")),
    responses(
        (status = 200, description = "共有ファイルのメタデータ", body = PublicShareResponse),
        (status = 404, description = "リンクが存在しないか期限切れ"),
        (status = 500, description = "内部エラー"),
    )
)]
pub async fn get_public_share(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Json<PublicShareResponse>, AuthError> {
    let (link, file) = resolve_active_share(&state, &token).await?;
    Ok(Json(PublicShareResponse {
        file_name: file.filename,
        file_type: file.file_type,
        size: file.filesize,
        download_allowed: link.download_allowed,
        expires_at: link.expires_at.map(|dt| dt.to_rfc3339()),
    }))
}

#[utoipa::path(
    get,
    path = "/{token}/view",
    params(("token" = String, Path, description = "共有トークン")),
    responses(
        (status = 302, description = "署名付きURLへリダイレクト"),
        (status = 404, description = "リンクが存在しないか期限切れ"),
        (status = 500, description = "内部エラー"),
    )
)]
pub async fn view_public_share(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse, AuthError> {
    let (_link, file) = resolve_active_share(&state, &token).await?;

    // 対象ファイルのストレージキーに限定した署名付き URL を発行する。
    let url = state
        .storage
        .get_download_url(&file.url, &file.file_type, Duration::from_secs(SIGNED_URL_TTL_SECS))
        .await
        .map_err(|e| AuthError::Internal(e))?;

    // localhost URL はプロキシ経由にするためパス部分だけにする（認証済み view と同じ扱い）。
    let redirect_to = url
        .parse::<Uri>()
        .ok()
        .filter(|u| matches!(u.host(), Some("localhost") | Some("127.0.0.1")))
        .and_then(|u| u.path_and_query().map(|pq| pq.to_string()))
        .unwrap_or(url);

    Ok((StatusCode::FOUND, [(header::LOCATION, redirect_to)]))
}

#[utoipa::path(
    delete,
    path = "/{token}",
    params(("token" = String, Path, description = "共有トークン")),
    responses(
        (status = 204, description = "リンクを失効"),
        SessionAuthErrors,
        (status = 404, description = "リンクが見つかりません"),
    )
)]
pub async fn revoke_share_link(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(token): Path<String>,
) -> Result<StatusCode, AuthError> {
    let link = share_links::Entity::find()
        .filter(share_links::Column::Token.eq(&token))
        .one(&state.db)
        .await?
        .ok_or(AuthError::NotFound)?;

    // 失効できるのはファイル所有者のみ。
    let file = files::Entity::find_by_id(link.file_id)
        .one(&state.db)
        .await?
        .ok_or(AuthError::NotFound)?;
    if file.author_id != current_user.id {
        return Err(AuthError::Forbidden);
    }

    share_links::Entity::delete_by_id(link.id).exec(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}
