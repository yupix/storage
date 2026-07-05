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
use serde_json::{json, Value};
use tokio::sync::mpsc;

use crate::extractors::AuthUser;
use crate::handlers::watchword::{load_parsed_room, perform_watchword_join};
use crate::payloads::watchword::WATCHWORD_ROOM_VERSION_V2;
use crate::utils::auth::AuthError;
use crate::utils::watchword_rooms::{RegisterError, RelayResult, WatchwordRooms};
use crate::AppState;

const PROTOCOL_V2_MULTI: u8 = 2;

#[derive(Debug, Deserialize)]
struct WatchwordWsMessage {
    action: String,
    passphrase: String,
    #[serde(default)]
    data: Value,
    #[serde(default)]
    protocol: Option<u8>,
    #[serde(default)]
    peer_id: Option<String>,
    #[serde(default)]
    target_peer_id: Option<String>,
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
                        let passphrase = parsed.passphrase.clone();
                        let peer_id = parsed.peer_id.clone();
                        let is_v2 = uses_v2_protocol(&parsed);
                        match handle_create(
                            &redis,
                            &rooms,
                            &passphrase,
                            user_id,
                            peer_id,
                            outbound_tx.clone(),
                        )
                        .await
                        {
                            Ok(creator_peer_id) => {
                                active_passphrase = Some(passphrase);
                                let mut ack = json!({ "action": "create", "status": "ok" });
                                if let Some(id) = creator_peer_id {
                                    ack["peer_id"] = json!(id);
                                }
                                if is_v2 {
                                    ack["protocol"] = json!(PROTOCOL_V2_MULTI);
                                }
                                let _ = outbound_tx.send(Message::Text(ack.to_string().into()));
                            }
                            Err(err) => {
                                if send_ws_error(&outbound_tx, err).is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    "join" => {
                        let passphrase = parsed.passphrase.clone();
                        let is_v2 = uses_v2_protocol(&parsed);
                        match handle_join(
                            &redis,
                            &rooms,
                            &passphrase,
                            user_id,
                            outbound_tx.clone(),
                        )
                        .await
                        {
                            Ok(join_response) => {
                                active_passphrase = Some(passphrase);
                                let mut ack = json!({
                                    "action": "join",
                                    "status": "ok",
                                    "peer_id": join_response.peer_id,
                                    "room": join_response.room,
                                });
                                if is_v2 || join_response.protocol == WATCHWORD_ROOM_VERSION_V2 {
                                    ack["protocol"] = json!(PROTOCOL_V2_MULTI);
                                }
                                let _ = outbound_tx.send(Message::Text(ack.to_string().into()));
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

                        let relay_payload = build_relay_payload(&parsed);
                        let relay_msg = Message::Text(relay_payload.to_string().into());
                        if let Err(code) = relay_signaling(
                            &rooms,
                            &parsed.passphrase,
                            user_id,
                            &parsed,
                            relay_msg,
                        )
                        .await
                        {
                            let _ = send_ws_error(&outbound_tx, code);
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

fn uses_v2_protocol(parsed: &WatchwordWsMessage) -> bool {
    parsed.protocol == Some(PROTOCOL_V2_MULTI)
}

fn build_relay_payload(parsed: &WatchwordWsMessage) -> Value {
    let mut payload = json!({
        "action": parsed.action,
        "passphrase": parsed.passphrase,
        "data": parsed.data,
    });
    if let Some(peer_id) = &parsed.peer_id {
        payload["peer_id"] = json!(peer_id);
    }
    if let Some(target_peer_id) = &parsed.target_peer_id {
        payload["target_peer_id"] = json!(target_peer_id);
    }
    if let Some(protocol) = parsed.protocol {
        payload["protocol"] = json!(protocol);
    }
    payload
}

async fn relay_signaling(
    rooms: &WatchwordRooms,
    passphrase: &str,
    from_user: Uuid,
    parsed: &WatchwordWsMessage,
    relay_msg: Message,
) -> Result<(), &'static str> {
    if let Some(target_peer_id) = parsed.target_peer_id.as_deref() {
        match rooms
            .relay_to_peer(passphrase, from_user, target_peer_id, relay_msg)
            .await
        {
            RelayResult::Delivered => Ok(()),
            RelayResult::PeerNotFound => Err("target_peer_not_found"),
            RelayResult::RoomNotFound | RelayResult::NotInRoom => Err("not_in_room"),
            RelayResult::SendFailed => Err("peer_unavailable"),
        }
    } else if uses_v2_protocol(parsed) {
        Err("target_peer_required")
    } else if rooms.relay(passphrase, from_user, relay_msg).await {
        Ok(())
    } else {
        Err("peer_unavailable")
    }
}

fn send_ws_error(tx: &mpsc::UnboundedSender<Message>, code: &str) -> Result<(), ()> {
    tx.send(Message::Text(
        json!({ "error": code }).to_string().into(),
    ))
    .map_err(|_| ())
}

async fn handle_create(
    redis: &crate::utils::redis::RedisConnection,
    rooms: &WatchwordRooms,
    passphrase: &str,
    user_id: Uuid,
    peer_id: Option<String>,
    tx: mpsc::UnboundedSender<Message>,
) -> Result<Option<String>, &'static str> {
    let room = load_parsed_room(redis, passphrase)
        .await
        .map_err(|e| e.as_ws_code())?;

    if room.creator_id() != user_id.to_string() {
        return Err("forbidden");
    }

    if room.is_v2() {
        let creator_peer_id = peer_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        rooms
            .register_creator_with_peer_id(
                passphrase,
                user_id,
                Some(creator_peer_id.clone()),
                tx,
            )
            .await
            .map_err(|e| match e {
                RegisterError::SlotTaken => "creator_taken",
                RegisterError::AlreadyJoiner => "already_joiner",
                RegisterError::RoomFull | RegisterError::AlreadyCreator => "room_full",
            })?;
        return Ok(Some(creator_peer_id));
    }

    rooms
        .register_creator(passphrase, user_id, tx)
        .await
        .map_err(|e| match e {
            RegisterError::SlotTaken => "creator_taken",
            RegisterError::AlreadyJoiner => "already_joiner",
            RegisterError::RoomFull | RegisterError::AlreadyCreator => "room_full",
        })?;

    Ok(peer_id)
}

async fn handle_join(
    redis: &crate::utils::redis::RedisConnection,
    rooms: &WatchwordRooms,
    passphrase: &str,
    user_id: Uuid,
    tx: mpsc::UnboundedSender<Message>,
) -> Result<crate::payloads::watchword::JoinWatchwordResponse, &'static str> {
    perform_watchword_join(redis, rooms, passphrase, user_id, Some(tx))
        .await
        .map_err(|e| e.as_ws_code())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_relay_payload_includes_target_peer_id() {
        let parsed = WatchwordWsMessage {
            action: "offer".into(),
            passphrase: "abcd1234".into(),
            data: json!({ "sdp": "v=0" }),
            protocol: Some(PROTOCOL_V2_MULTI),
            peer_id: Some("peer-a".into()),
            target_peer_id: Some("peer-b".into()),
        };

        let payload = build_relay_payload(&parsed);
        assert_eq!(payload["target_peer_id"], "peer-b");
        assert_eq!(payload["peer_id"], "peer-a");
        assert_eq!(payload["protocol"], PROTOCOL_V2_MULTI);
    }

    #[test]
    fn uses_v2_protocol_only_when_explicit() {
        let v2 = WatchwordWsMessage {
            action: "offer".into(),
            passphrase: "x".into(),
            data: json!({}),
            protocol: Some(PROTOCOL_V2_MULTI),
            peer_id: None,
            target_peer_id: None,
        };
        let v1 = WatchwordWsMessage {
            action: "offer".into(),
            passphrase: "x".into(),
            data: json!({}),
            protocol: None,
            peer_id: None,
            target_peer_id: None,
        };
        assert!(uses_v2_protocol(&v2));
        assert!(!uses_v2_protocol(&v1));
    }
}
