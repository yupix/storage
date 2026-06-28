use argon2::password_hash::rand_core::{OsRng, RngCore};
use axum::{
    Json,
    extract::State,
    http::StatusCode,
};
use axum_valid::Valid;
use chrono::Utc;
use serde_json;

use crate::extractors::AuthUser;
use crate::openapi::UnauthorizedErrors;
use crate::payloads::watchword::{
    CreateWatchwordRequest, CreateWatchwordResponse, MAX_PASSPHRASE_RETRIES, PASSPHRASE_LEN,
    WatchwordRoom, WatchwordRoomMetadata, compute_ttl_secs, room_key, validate_filehash,
};
use crate::utils::auth::AuthError;
use crate::AppState;

const PASSPHRASE_CHARSET: &[u8] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

fn generate_passphrase() -> String {
    let mut rng = OsRng;
    (0..PASSPHRASE_LEN)
        .map(|_| {
            let idx = (rng.next_u32() as usize) % PASSPHRASE_CHARSET.len();
            PASSPHRASE_CHARSET[idx] as char
        })
        .collect()
}

#[axum::debug_handler]
#[utoipa::path(
    post,
    path = "/watchword",
    request_body = CreateWatchwordRequest,
    responses(
        (status = 201, description = "Watchword room created", body = CreateWatchwordResponse),
        UnauthorizedErrors,
        (status = 400, description = "Invalid request"),
        (status = 403, description = "sender_id mismatch"),
    )
)]
pub async fn create_watchword(
    State(state): State<AppState>,
    auth: AuthUser,
    Valid(Json(body)): Valid<Json<CreateWatchwordRequest>>,
) -> Result<(StatusCode, Json<CreateWatchwordResponse>), AuthError> {
    if body.sender_id != auth.user_id {
        return Err(AuthError::Forbidden);
    }

    validate_filehash(&body.filehash).map_err(AuthError::InvalidInput)?;
    let ttl_secs = compute_ttl_secs(body.expire_at).map_err(AuthError::InvalidInput)?;

    let created_at = Utc::now().to_rfc3339();
    let metadata = WatchwordRoomMetadata {
        filename: body.filename,
        file_type: body.file_type,
        filesize: body.filesize,
        mime_type: body.mime_type,
        filehash: body.filehash,
        chunk_size: body.chunk_size,
        downloadable: body.downloadable,
        receiver_id: body.receiver_id.to_string(),
        sender_id: body.sender_id.to_string(),
    };

    for _ in 0..MAX_PASSPHRASE_RETRIES {
        let passphrase = generate_passphrase();
        let room = WatchwordRoom {
            passphrase: passphrase.clone(),
            creator_id: auth.user_id.to_string(),
            joiner_id: None,
            metadata: metadata.clone(),
            created_at: created_at.clone(),
        };
        let payload = serde_json::to_string(&room)
            .map_err(|e| AuthError::Internal(anyhow::anyhow!("room json: {e}")))?;

        let inserted = state
            .redis_client
            .set_nx_ex(&room_key(&passphrase), &payload, ttl_secs)
            .await
            .map_err(AuthError::Internal)?;

        if inserted {
            return Ok((
                StatusCode::CREATED,
                Json(CreateWatchwordResponse { passphrase }),
            ));
        }
    }

    Err(AuthError::Internal(anyhow::anyhow!(
        "failed to allocate unique watchword passphrase"
    )))
}
