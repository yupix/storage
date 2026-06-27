use axum::{
    Json,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use sea_orm::prelude::Uuid;
use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;
use tracing::warn;

use crate::extractors::AuthUser;
use crate::payloads::watchword::{WatchwordRoom, room_key};
use crate::utils::auth::AuthError;
use crate::utils::watchword_rooms::{RegisterError, WatchwordRooms};
use crate::AppState;

#[derive(Debug, Deserialize)]
struct WatchwordWsMessage {
    action: String,
    passphrase: String,
    #[serde(default)]
    data: serde_json::Value,
}

pub async fn watchword_ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    auth: Result<AuthUser, AuthError>,
) -> Response {
    match auth {
        Ok(auth_user) => ws.on_upgrade(move |socket| handle_watchword_socket(socket, state, auth_user)),
        Err(_) => (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "unauthorized" })),
        )
            .into_response(),
    }
}

async fn handle_watchword_socket(socket: WebSocket, state: AppState, auth: AuthUser) {
    let (mut sender, mut receiver) = socket.split();
    let (outbound_tx, mut outbound_rx) = mpsc::unbounded_channel::<Message>();

    let send_task = tokio::spawn(async move {
        while let Some(msg) = outbound_rx.recv().await {
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    let user_id = auth.user_id;
    let rooms = state.watchword_rooms.clone();
    let redis = state.redis_client.clone();
    let mut active_passphrase: Option<String> = None;

    while let Some(result) = receiver.next().await {
        let Ok(msg) = result else {
            break;
        };

        match msg {
            Message::Text(text) => {
        let parsed: WatchwordWsMessage = match serde_json::from_str(&text) {
            Ok(parsed) => parsed,
            Err(_) => {
                let _ = send_ws_error(&outbound_tx, "invalid_message");
                continue;
            }
        };

        match parsed.action.as_str() {
            "create" => {
                match handle_create(&redis, &rooms, &parsed.passphrase, user_id, outbound_tx.clone())
                    .await
                {
                    Ok(()) => {
                        active_passphrase = Some(parsed.passphrase.clone());
                        let _ = outbound_tx.send(Message::Text(
                            json!({ "action": "create", "status": "ok" }).to_string().into(),
                        ));
                    }
                    Err(err) => {
                        if send_ws_error(&outbound_tx, err).is_err() {
                            break;
                        }
                    }
                }
            }
            "join" => {
                match handle_join(&redis, &rooms, &parsed.passphrase, user_id, outbound_tx.clone())
                    .await
                {
                    Ok(()) => {
                        active_passphrase = Some(parsed.passphrase.clone());
                        let _ = outbound_tx.send(Message::Text(
                            json!({ "action": "join", "status": "ok" }).to_string().into(),
                        ));
                    }
                    Err(err) => {
                        if send_ws_error(&outbound_tx, err).is_err() {
                            break;
                        }
                        if err == "room_full" {
                            break;
                        }
                    }
                }
            }
            "offer" | "answer" | "ice" => {
                if !rooms
                    .is_registered(&parsed.passphrase, user_id)
                    .await
                {
                    if send_ws_error(&outbound_tx, "not_in_room").is_err() {
                        break;
                    }
                    continue;
                }

                let relay_payload = json!({
                    "action": parsed.action,
                    "passphrase": parsed.passphrase,
                    "data": parsed.data,
                });
                let relay_msg = Message::Text(relay_payload.to_string().into());
                if !rooms
                    .relay(&parsed.passphrase, user_id, relay_msg)
                    .await
                {
                    let _ = send_ws_error(&outbound_tx, "peer_unavailable");
                }
            }
            _ => {
                if send_ws_error(&outbound_tx, "invalid_action").is_err() {
                    break;
                }
            }
        }
            }
            Message::Ping(p) => {
                if outbound_tx.send(Message::Pong(p)).is_err() {
                    break;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    send_task.abort();
    if let Some(passphrase) = active_passphrase {
        rooms.unregister(&passphrase, user_id).await;
    }
}

fn send_ws_error(tx: &mpsc::UnboundedSender<Message>, code: &str) -> Result<(), ()> {
    tx.send(Message::Text(
        json!({ "error": code }).to_string().into(),
    ))
    .map_err(|_| ())
}

async fn load_room(
    redis: &crate::utils::redis::RedisConnection,
    passphrase: &str,
) -> Result<WatchwordRoom, &'static str> {
    let key = room_key(passphrase);
    let raw = redis
        .get(&key)
        .await
        .map_err(|e| {
            warn!("watchword room redis get failed: {e}");
            "internal_error"
        })?
        .ok_or("room_not_found")?;

    serde_json::from_str(&raw).map_err(|e| {
        warn!("watchword room json parse failed: {e}");
        "internal_error"
    })
}

async fn persist_joiner(
    redis: &crate::utils::redis::RedisConnection,
    passphrase: &str,
    joiner_id: Uuid,
    mut room: WatchwordRoom,
) -> Result<(), &'static str> {
    let key = room_key(passphrase);
    let ttl = redis.ttl(&key).await.map_err(|e| {
        warn!("watchword room redis ttl failed: {e}");
        "internal_error"
    })?;
    if ttl <= 0 {
        return Err("room_not_found");
    }

    room.joiner_id = Some(joiner_id.to_string());
    let payload = serde_json::to_string(&room).map_err(|e| {
        warn!("watchword room json encode failed: {e}");
        "internal_error"
    })?;

    redis
        .set_ex(&key, &payload, ttl as u64)
        .await
        .map_err(|e| {
            warn!("watchword room redis set failed: {e}");
            "internal_error"
        })
}

async fn handle_create(
    redis: &crate::utils::redis::RedisConnection,
    rooms: &WatchwordRooms,
    passphrase: &str,
    user_id: Uuid,
    tx: mpsc::UnboundedSender<Message>,
) -> Result<(), &'static str> {
    let room = load_room(redis, passphrase).await?;
    if room.creator_id != user_id.to_string() {
        return Err("forbidden");
    }

    rooms
        .register_creator(passphrase, user_id, tx)
        .await
        .map_err(|e| match e {
            RegisterError::SlotTaken => "creator_taken",
            RegisterError::AlreadyJoiner => "already_joiner",
            RegisterError::RoomFull | RegisterError::AlreadyCreator => "room_full",
        })
}

async fn handle_join(
    redis: &crate::utils::redis::RedisConnection,
    rooms: &WatchwordRooms,
    passphrase: &str,
    user_id: Uuid,
    tx: mpsc::UnboundedSender<Message>,
) -> Result<(), &'static str> {
    let room = load_room(redis, passphrase).await?;

    rooms
        .register_joiner(passphrase, user_id, tx)
        .await
        .map_err(|e| match e {
            RegisterError::RoomFull => "room_full",
            RegisterError::AlreadyCreator => "already_creator",
            RegisterError::SlotTaken | RegisterError::AlreadyJoiner => "joiner_taken",
        })?;

    persist_joiner(redis, passphrase, user_id, room).await
}
