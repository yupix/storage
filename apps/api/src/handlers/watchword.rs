use argon2::password_hash::rand_core::{OsRng, RngCore};
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use axum_valid::Valid;
use chrono::Utc;
use sea_orm::prelude::Uuid;
use serde_json;
use tokio::sync::mpsc;
use tracing::warn;

use crate::extractors::AuthUser;
use crate::openapi::UnauthorizedErrors;
use crate::payloads::watchword::{
    CreateWatchwordRequest, CreateWatchwordResponse, JoinWatchwordResponse, MAX_PASSPHRASE_RETRIES,
    PASSPHRASE_LEN, ParsedWatchwordRoom, WATCHWORD_ROOM_VERSION_V2, WatchwordFileEntry,
    WatchwordRoom, WatchwordRoomMetadata, WatchwordRoomV2, DEFAULT_MAX_JOINERS, compute_ttl_secs,
    parse_stored_room, room_key, validate_filehash,
};
use crate::utils::auth::AuthError;
use crate::utils::watchword_rooms::{JoinPeerError, RegisterError, WatchwordRooms};
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

#[derive(Debug)]
pub enum JoinError {
    RoomNotFound,
    RoomClosed,
    RoomFull,
    AlreadyCreator,
    Internal(&'static str),
}

impl JoinError {
    pub fn as_ws_code(&self) -> &'static str {
        match self {
            Self::RoomNotFound => "room_not_found",
            Self::RoomClosed => "room_closed",
            Self::RoomFull => "room_full",
            Self::AlreadyCreator => "already_creator",
            Self::Internal(_) => "internal_error",
        }
    }
}

impl From<JoinError> for AuthError {
    fn from(err: JoinError) -> Self {
        match err {
            JoinError::RoomNotFound => AuthError::NotFound,
            JoinError::RoomClosed => AuthError::Conflict("room-closed".into()),
            JoinError::RoomFull => AuthError::Conflict("room-full".into()),
            JoinError::AlreadyCreator => AuthError::Forbidden,
            JoinError::Internal(msg) => AuthError::Internal(anyhow::anyhow!(msg)),
        }
    }
}

pub async fn load_parsed_room(
    redis: &crate::utils::redis::RedisConnection,
    passphrase: &str,
) -> Result<ParsedWatchwordRoom, JoinError> {
    let key = room_key(passphrase);
    let raw = redis.get(&key).await.map_err(|e| {
        warn!("watchword room redis get failed: {e}");
        JoinError::Internal("redis get failed")
    })?;
    let Some(raw) = raw else {
        return Err(JoinError::RoomNotFound);
    };
    parse_stored_room(&raw).map_err(|e| {
        warn!("watchword room json parse failed: {e}");
        JoinError::Internal("room json parse failed")
    })
}

async fn persist_room(
    redis: &crate::utils::redis::RedisConnection,
    passphrase: &str,
    room: &ParsedWatchwordRoom,
) -> Result<(), JoinError> {
    let key = room_key(passphrase);
    let ttl = redis.ttl(&key).await.map_err(|e| {
        warn!("watchword room redis ttl failed: {e}");
        JoinError::Internal("redis ttl failed")
    })?;
    if ttl <= 0 {
        return Err(JoinError::RoomNotFound);
    }

    let payload = match room {
        ParsedWatchwordRoom::V1(v1) => serde_json::to_string(v1),
        ParsedWatchwordRoom::V2(v2) => serde_json::to_string(v2),
    }
    .map_err(|e| {
        warn!("watchword room json encode failed: {e}");
        JoinError::Internal("room json encode failed")
    })?;

    redis
        .set_ex(&key, &payload, ttl as u64)
        .await
        .map_err(|e| {
            warn!("watchword room redis set failed: {e}");
            JoinError::Internal("redis set failed")
        })
}

pub async fn perform_watchword_join(
    redis: &crate::utils::redis::RedisConnection,
    rooms: &WatchwordRooms,
    passphrase: &str,
    user_id: Uuid,
    ws_tx: Option<mpsc::UnboundedSender<axum::extract::ws::Message>>,
) -> Result<JoinWatchwordResponse, JoinError> {
    let mut room = load_parsed_room(redis, passphrase).await?;

    if room.creator_id() == user_id.to_string() {
        return Err(JoinError::AlreadyCreator);
    }

    if room.status() != "open" {
        return Err(JoinError::RoomClosed);
    }

    match &mut room {
        ParsedWatchwordRoom::V1(v1) => {
            if v1.joiner_id.is_some() {
                return Err(JoinError::RoomFull);
            }

            if let Some(tx) = ws_tx {
                rooms
                    .register_joiner(passphrase, user_id, tx)
                    .await
                    .map_err(|e| match e {
                        RegisterError::RoomFull => JoinError::RoomFull,
                        RegisterError::AlreadyCreator => JoinError::AlreadyCreator,
                        RegisterError::SlotTaken | RegisterError::AlreadyJoiner => {
                            JoinError::RoomFull
                        }
                    })?;
            }

            let peer_id = Uuid::new_v4().to_string();
            v1.joiner_id = Some(user_id.to_string());
            persist_room(redis, passphrase, &room).await?;

            let mut meta = room.room_meta_for_join();
            meta.active_joiners = 1;

            Ok(JoinWatchwordResponse {
                peer_id,
                protocol: 1,
                room: meta,
            })
        }
        ParsedWatchwordRoom::V2(v2) => {
            if v2.joiner_ids.len() >= v2.max_joiners as usize {
                return Err(JoinError::RoomFull);
            }

            let peer_id = Uuid::new_v4().to_string();
            let max_joiners = v2.max_joiners as usize;
            let mut actual_peer_id = peer_id.clone();

            if let Some(tx) = ws_tx {
                actual_peer_id = rooms
                    .join_peer(passphrase, peer_id.clone(), user_id, tx, max_joiners)
                    .await
                    .map_err(|e| match e {
                        JoinPeerError::RoomFull | JoinPeerError::V1RoomFull => {
                            JoinError::RoomFull
                        }
                        JoinPeerError::AlreadyCreator => JoinError::AlreadyCreator,
                        JoinPeerError::RoomClosed => JoinError::RoomClosed,
                    })?;

                rooms.notify_peer_joined(passphrase, &actual_peer_id).await;

                if actual_peer_id != peer_id && v2.joiner_ids.contains(&actual_peer_id) {
                    let active = v2.joiner_ids.len() as u32;
                    let mut meta = ParsedWatchwordRoom::V2((*v2).clone()).room_meta_for_join();
                    meta.active_joiners = active;
                    return Ok(JoinWatchwordResponse {
                        peer_id: actual_peer_id,
                        protocol: WATCHWORD_ROOM_VERSION_V2,
                        room: meta,
                    });
                }
            }

            v2.joiner_ids.push(actual_peer_id.clone());
            let active = v2.joiner_ids.len() as u32;
            let response = JoinWatchwordResponse {
                peer_id: actual_peer_id.clone(),
                protocol: WATCHWORD_ROOM_VERSION_V2,
                room: {
                    let mut meta = ParsedWatchwordRoom::V2((*v2).clone()).room_meta_for_join();
                    meta.active_joiners = active;
                    meta
                },
            };
            persist_room(redis, passphrase, &ParsedWatchwordRoom::V2((*v2).clone())).await?;
            Ok(response)
        }
    }
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
    let expire_at = body.expire_at.map(|dt| dt.to_rfc3339());
    let use_v2 = body.protocol == Some(WATCHWORD_ROOM_VERSION_V2);
    let metadata = WatchwordRoomMetadata {
        filename: body.filename.clone(),
        file_type: body.file_type.clone(),
        filesize: body.filesize,
        mime_type: body.mime_type.clone(),
        filehash: body.filehash.clone(),
        chunk_size: body.chunk_size,
        downloadable: body.downloadable,
        receiver_id: body.receiver_id.to_string(),
        sender_id: body.sender_id.to_string(),
    };

    for _ in 0..MAX_PASSPHRASE_RETRIES {
        let passphrase = generate_passphrase();
        let payload = if use_v2 {
            let max_joiners = body
                .max_joiners
                .unwrap_or(DEFAULT_MAX_JOINERS)
                .min(DEFAULT_MAX_JOINERS);
            let room = WatchwordRoomV2 {
                version: WATCHWORD_ROOM_VERSION_V2,
                passphrase: passphrase.clone(),
                creator_id: auth.user_id.to_string(),
                status: "open".into(),
                max_joiners,
                files: vec![WatchwordFileEntry {
                    file_id: "f1".into(),
                    filename: body.filename.clone(),
                    file_type: body.file_type.clone(),
                    filesize: body.filesize,
                    mime_type: body.mime_type.clone(),
                    filehash: body.filehash.clone(),
                    chunk_size: body.chunk_size,
                    downloadable: body.downloadable,
                }],
                joiner_ids: vec![],
                created_at: created_at.clone(),
                expire_at: expire_at.clone(),
            };
            serde_json::to_string(&room)
        } else {
            let room = WatchwordRoom {
                passphrase: passphrase.clone(),
                creator_id: auth.user_id.to_string(),
                joiner_id: None,
                metadata: metadata.clone(),
                created_at: created_at.clone(),
            };
            serde_json::to_string(&room)
        }
        .map_err(|e| AuthError::Internal(anyhow::anyhow!("room json: {e}")))?;

        let inserted = state
            .redis_client
            .set_nx_ex(&room_key(&passphrase), &payload, ttl_secs)
            .await
            .map_err(AuthError::Internal)?;

        if inserted {
            return Ok((
                StatusCode::CREATED,
                Json(CreateWatchwordResponse {
                    passphrase,
                    protocol: use_v2.then_some(WATCHWORD_ROOM_VERSION_V2),
                    file_count: use_v2.then_some(1),
                }),
            ));
        }
    }

    Err(AuthError::Internal(anyhow::anyhow!(
        "failed to allocate unique watchword passphrase"
    )))
}

#[axum::debug_handler]
#[utoipa::path(
    post,
    path = "/watchword/{passphrase}/join",
    params(
        ("passphrase" = String, Path, description = "Watchword passphrase")
    ),
    responses(
        (status = 200, description = "Joined watchword room", body = JoinWatchwordResponse),
        UnauthorizedErrors,
        (status = 404, description = "Room not found"),
        (status = 409, description = "Room full or closed"),
    )
)]
pub async fn join_watchword(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(passphrase): Path<String>,
) -> Result<(StatusCode, Json<JoinWatchwordResponse>), AuthError> {
    let response = perform_watchword_join(
        &state.redis_client,
        &state.watchword_rooms,
        &passphrase,
        auth.user_id,
        None,
    )
    .await?;

    Ok((StatusCode::OK, Json(response)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::payloads::watchword::{WatchwordFileEntry, WatchwordRoomV2, DEFAULT_MAX_JOINERS};

    #[test]
    fn v2_room_full_when_joiner_ids_at_max() {
        let room = WatchwordRoomV2 {
            version: 2,
            passphrase: "abcd1234".into(),
            creator_id: Uuid::new_v4().to_string(),
            status: "open".into(),
            max_joiners: 2,
            files: vec![WatchwordFileEntry {
                file_id: "f1".into(),
                filename: "a.pdf".into(),
                file_type: "pdf".into(),
                filesize: 1,
                mime_type: "application/pdf".into(),
                filehash: format!("sha256:{}", "a".repeat(64)),
                chunk_size: 16384,
                downloadable: true,
            }],
            joiner_ids: vec![Uuid::new_v4().to_string(), Uuid::new_v4().to_string()],
            created_at: Utc::now().to_rfc3339(),
            expire_at: None,
        };
        assert!(room.joiner_ids.len() >= room.max_joiners as usize);
        let _ = DEFAULT_MAX_JOINERS;
    }
}
