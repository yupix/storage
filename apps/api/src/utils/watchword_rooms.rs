use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::Message;
use sea_orm::prelude::Uuid;
use serde::{Deserialize, Serialize};
use serde::de::Error as DeError;
use serde_json::json;
use tokio::sync::{RwLock, mpsc};

pub type WsOutbound = mpsc::UnboundedSender<Message>;

pub const LEGACY_V1_PEER_ID: &str = "__v1_legacy__";
pub const DEFAULT_MAX_JOINERS: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RoomStatus {
    Open,
    Closed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoomFile {
    pub file_id: String,
    pub filename: String,
    pub file_type: String,
    pub filesize: i64,
    pub mime_type: String,
    pub filehash: String,
    pub chunk_size: i64,
    pub downloadable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoomStateV1 {
    pub passphrase: String,
    pub creator_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub joiner_id: Option<String>,
    pub metadata: serde_json::Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoomStateV2 {
    pub version: u8,
    pub passphrase: String,
    pub creator_id: String,
    pub status: RoomStatus,
    pub max_joiners: usize,
    pub files: Vec<RoomFile>,
    pub joiner_ids: Vec<String>,
    pub created_at: String,
    pub expire_at: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RoomState {
    V1(RoomStateV1),
    V2(RoomStateV2),
}

impl RoomState {
    pub fn version(&self) -> u8 {
        match self {
            Self::V1(_) => 1,
            Self::V2(v2) => v2.version,
        }
    }

    pub fn passphrase(&self) -> &str {
        match self {
            Self::V1(v1) => &v1.passphrase,
            Self::V2(v2) => &v2.passphrase,
        }
    }

    pub fn creator_id(&self) -> &str {
        match self {
            Self::V1(v1) => &v1.creator_id,
            Self::V2(v2) => &v2.creator_id,
        }
    }

    pub fn max_joiners(&self) -> usize {
        match self {
            Self::V1(_) => 1,
            Self::V2(v2) => v2.max_joiners,
        }
    }
}

impl RoomStateV2 {
    pub fn new_open(
        passphrase: String,
        creator_id: String,
        files: Vec<RoomFile>,
        max_joiners: usize,
        created_at: String,
        expire_at: String,
    ) -> Self {
        Self {
            version: 2,
            passphrase,
            creator_id,
            status: RoomStatus::Open,
            max_joiners,
            files,
            joiner_ids: Vec::new(),
            created_at,
            expire_at,
        }
    }
}

pub fn deserialize_room_state(raw: &str) -> Result<RoomState, serde_json::Error> {
    let value: serde_json::Value = serde_json::from_str(raw)?;
    let version = value.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
    match version {
        1 => Ok(RoomState::V1(serde_json::from_value(value)?)),
        2 => Ok(RoomState::V2(serde_json::from_value(value)?)),
        other => Err(serde_json::Error::custom(format!(
            "unsupported watchword room version: {other}"
        ))),
    }
}

#[derive(Clone)]
pub struct PeerSlot {
    pub peer_id: Option<String>,
    pub user_id: Uuid,
    pub tx: WsOutbound,
}

pub struct RoomConnections {
    pub creator: Option<PeerSlot>,
    /// v1 single-joiner slot (legacy in-process path).
    pub joiner: Option<PeerSlot>,
    pub joiners: HashMap<String, PeerSlot>,
    pub max_joiners: usize,
}

impl Default for RoomConnections {
    fn default() -> Self {
        Self {
            creator: None,
            joiner: None,
            joiners: HashMap::new(),
            max_joiners: 1,
        }
    }
}

impl RoomConnections {
    pub fn from_room_state(state: &RoomState) -> Self {
        Self {
            creator: None,
            joiner: None,
            joiners: HashMap::new(),
            max_joiners: state.max_joiners(),
        }
    }

    pub fn role_of(&self, user_id: Uuid) -> Option<Role> {
        if self.creator.as_ref().is_some_and(|p| p.user_id == user_id) {
            return Some(Role::Creator);
        }
        if self.joiner.as_ref().is_some_and(|p| p.user_id == user_id) {
            return Some(Role::Joiner);
        }
        if self.joiners.values().any(|p| p.user_id == user_id) {
            return Some(Role::Joiner);
        }
        None
    }

    pub fn peer_id_of(&self, user_id: Uuid) -> Option<&str> {
        if let Some(peer_id) = self
            .joiners
            .iter()
            .find(|(_, slot)| slot.user_id == user_id)
            .map(|(peer_id, _)| peer_id.as_str())
        {
            return Some(peer_id);
        }
        if self.joiner.as_ref().is_some_and(|p| p.user_id == user_id) {
            return Some(LEGACY_V1_PEER_ID);
        }
        None
    }

    pub fn other_tx(&self, user_id: Uuid) -> Option<&WsOutbound> {
        match self.role_of(user_id)? {
            Role::Creator => {
                if let Some(joiner) = &self.joiner {
                    return Some(&joiner.tx);
                }
                self.joiners.values().next().map(|p| &p.tx)
            }
            Role::Joiner => self.creator.as_ref().map(|p| &p.tx),
        }
    }

    pub fn joiner_tx(&self, peer_id: &str) -> Option<&WsOutbound> {
        if peer_id == LEGACY_V1_PEER_ID {
            return self.joiner.as_ref().map(|p| &p.tx);
        }
        self.joiners.get(peer_id).map(|p| &p.tx)
    }

    pub fn creator_tx(&self) -> Option<&WsOutbound> {
        self.creator.as_ref().map(|p| &p.tx)
    }

    pub fn connected_count(&self) -> usize {
        usize::from(self.creator.is_some()) + self.active_joiner_count()
    }

    pub fn active_joiner_count(&self) -> usize {
        if self.joiners.is_empty() {
            usize::from(self.joiner.is_some())
        } else {
            self.joiners.len()
        }
    }

    pub fn has_capacity(&self) -> bool {
        self.active_joiner_count() < self.max_joiners
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Creator,
    Joiner,
}

#[derive(Debug)]
pub enum RegisterError {
    RoomFull,
    SlotTaken,
    AlreadyCreator,
    AlreadyJoiner,
}

#[derive(Debug, PartialEq, Eq)]
pub enum JoinPeerError {
    RoomFull,
    AlreadyCreator,
    RoomClosed,
    V1RoomFull,
}

#[derive(Debug, PartialEq, Eq)]
pub enum RelayResult {
    Delivered,
    PeerNotFound,
    RoomNotFound,
    NotInRoom,
    SendFailed,
}

#[derive(Clone)]
pub struct WatchwordRooms {
    rooms: Arc<RwLock<HashMap<String, RoomConnections>>>,
}

impl WatchwordRooms {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn ensure_room(&self, passphrase: &str, state: &RoomState) {
        let mut rooms = self.rooms.write().await;
        rooms
            .entry(passphrase.to_string())
            .or_insert_with(|| RoomConnections::from_room_state(state));
    }

    pub async fn register_creator(
        &self,
        passphrase: &str,
        user_id: Uuid,
        tx: WsOutbound,
    ) -> Result<(), RegisterError> {
        self.register_creator_with_peer_id(passphrase, user_id, None, tx)
            .await
    }

    pub async fn register_creator_with_peer_id(
        &self,
        passphrase: &str,
        user_id: Uuid,
        peer_id: Option<String>,
        tx: WsOutbound,
    ) -> Result<(), RegisterError> {
        let mut rooms = self.rooms.write().await;
        let room = rooms.entry(passphrase.to_string()).or_default();

        if self.joiner_contains_user(room, user_id) {
            return Err(RegisterError::AlreadyJoiner);
        }

        if let Some(existing) = &room.creator {
            if existing.user_id != user_id {
                return Err(RegisterError::SlotTaken);
            }
        }

        room.creator = Some(PeerSlot {
            peer_id,
            user_id,
            tx,
        });
        Ok(())
    }

    pub async fn register_joiner(
        &self,
        passphrase: &str,
        user_id: Uuid,
        tx: WsOutbound,
    ) -> Result<(), RegisterError> {
        self.register_joiner_with_peer_id(passphrase, user_id, None, tx)
            .await
    }

    pub async fn register_joiner_with_peer_id(
        &self,
        passphrase: &str,
        user_id: Uuid,
        peer_id: Option<String>,
        tx: WsOutbound,
    ) -> Result<(), RegisterError> {
        if let Some(peer_id) = peer_id {
            self.join_peer(passphrase, peer_id, user_id, tx, DEFAULT_MAX_JOINERS)
                .await
                .map(|_| ())
                .map_err(|e| match e {
                    JoinPeerError::RoomFull | JoinPeerError::V1RoomFull => RegisterError::RoomFull,
                    JoinPeerError::AlreadyCreator => RegisterError::AlreadyCreator,
                    JoinPeerError::RoomClosed => RegisterError::RoomFull,
                })
        } else {
            let mut rooms = self.rooms.write().await;
            let room = rooms.entry(passphrase.to_string()).or_default();

            if room.creator.as_ref().is_some_and(|p| p.user_id == user_id) {
                return Err(RegisterError::AlreadyCreator);
            }

            if self.joiner_contains_user(room, user_id) {
                if let Some(existing) = &room.joiner {
                    if existing.user_id == user_id {
                        room.joiner = Some(PeerSlot {
                            peer_id: None,
                            user_id,
                            tx,
                        });
                        return Ok(());
                    }
                }
                return Err(RegisterError::AlreadyJoiner);
            }

            if !room.has_capacity() {
                return Err(RegisterError::RoomFull);
            }

            room.joiner = Some(PeerSlot {
                peer_id: None,
                user_id,
                tx,
            });
            Ok(())
        }
    }

    pub async fn join_peer(
        &self,
        passphrase: &str,
        peer_id: String,
        user_id: Uuid,
        tx: WsOutbound,
        max_joiners: usize,
    ) -> Result<String, JoinPeerError> {
        let mut rooms = self.rooms.write().await;
        let room = rooms.entry(passphrase.to_string()).or_default();
        room.max_joiners = max_joiners;

        if room.creator.as_ref().is_some_and(|p| p.user_id == user_id) {
            return Err(JoinPeerError::AlreadyCreator);
        }

        if let Some((existing_peer_id, slot)) = room
            .joiners
            .iter_mut()
            .find(|(_, slot)| slot.user_id == user_id)
        {
            slot.tx = tx;
            return Ok(existing_peer_id.clone());
        }

        if room.joiners.len() >= max_joiners {
            return Err(JoinPeerError::RoomFull);
        }

        room.joiners.insert(
            peer_id.clone(),
            PeerSlot {
                peer_id: Some(peer_id.clone()),
                user_id,
                tx,
            },
        );
        Ok(peer_id)
    }

    pub async fn notify_peer_joined(&self, passphrase: &str, peer_id: &str) -> bool {
        let rooms = self.rooms.read().await;
        let Some(room) = rooms.get(passphrase) else {
            return false;
        };
        let Some(creator) = &room.creator else {
            return false;
        };
        let payload = json!({
            "action": "peer_joined",
            "passphrase": passphrase,
            "peer_id": peer_id,
            "data": {}
        });
        creator
            .tx
            .send(Message::Text(payload.to_string().into()))
            .is_ok()
    }

    pub async fn unregister(&self, passphrase: &str, user_id: Uuid) {
        let mut rooms = self.rooms.write().await;
        if let Some(room) = rooms.get_mut(passphrase) {
            if room.creator.as_ref().is_some_and(|p| p.user_id == user_id) {
                room.creator = None;
            }
            if room.joiner.as_ref().is_some_and(|p| p.user_id == user_id) {
                room.joiner = None;
            }
            room.joiners.retain(|_, slot| slot.user_id != user_id);
            if room.creator.is_none() && room.joiner.is_none() && room.joiners.is_empty() {
                rooms.remove(passphrase);
            }
        }
    }

    pub async fn relay(&self, passphrase: &str, from_user: Uuid, payload: Message) -> bool {
        let rooms = self.rooms.read().await;
        if let Some(room) = rooms.get(passphrase) {
            if let Some(tx) = room.other_tx(from_user) {
                return tx.send(payload).is_ok();
            }
        }
        false
    }

    pub async fn relay_to_peer(
        &self,
        passphrase: &str,
        from_user: Uuid,
        target_peer_id: &str,
        payload: Message,
    ) -> RelayResult {
        let rooms = self.rooms.read().await;
        let Some(room) = rooms.get(passphrase) else {
            return RelayResult::RoomNotFound;
        };
        if room.role_of(from_user).is_none() {
            return RelayResult::NotInRoom;
        }

        let delivered = if target_peer_id == LEGACY_V1_PEER_ID {
            room.joiner_tx(target_peer_id)
                .or_else(|| room.creator_tx())
                .is_some_and(|tx| tx.send(payload).is_ok())
        } else if let Some(tx) = room.joiner_tx(target_peer_id) {
            tx.send(payload).is_ok()
        } else if room
            .creator
            .as_ref()
            .is_some_and(|c| {
                c.peer_id.as_deref() == Some(target_peer_id)
                    || c.user_id.to_string() == target_peer_id
            })
        {
            room.creator_tx().is_some_and(|tx| tx.send(payload).is_ok())
        } else {
            return RelayResult::PeerNotFound;
        };

        if delivered {
            RelayResult::Delivered
        } else {
            RelayResult::SendFailed
        }
    }

    pub async fn relay_to_creator(&self, passphrase: &str, payload: Message) -> bool {
        let rooms = self.rooms.read().await;
        if let Some(room) = rooms.get(passphrase) {
            if let Some(tx) = room.creator_tx() {
                return tx.send(payload).is_ok();
            }
        }
        false
    }

    pub async fn is_registered(&self, passphrase: &str, user_id: Uuid) -> bool {
        let rooms = self.rooms.read().await;
        rooms
            .get(passphrase)
            .is_some_and(|room| room.role_of(user_id).is_some())
    }

    pub async fn in_memory_active_joiners(&self, passphrase: &str) -> usize {
        let rooms = self.rooms.read().await;
        rooms
            .get(passphrase)
            .map(|room| room.active_joiner_count())
            .unwrap_or(0)
    }

    fn joiner_contains_user(&self, room: &RoomConnections, user_id: Uuid) -> bool {
        room.joiner.as_ref().is_some_and(|p| p.user_id == user_id)
            || room.joiners.values().any(|p| p.user_id == user_id)
    }
}

impl Default for WatchwordRooms {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tokio::sync::mpsc;

    fn make_tx() -> (WsOutbound, mpsc::UnboundedReceiver<Message>) {
        mpsc::unbounded_channel()
    }

    fn sample_v1_json() -> String {
        json!({
            "passphrase": "x7k9m2pq",
            "creator_id": "550e8400-e29b-41d4-a716-446655440000",
            "joiner_id": null,
            "metadata": {
                "filename": "doc.pdf",
                "file_type": "pdf",
                "filesize": 1024,
                "mime_type": "application/pdf",
                "filehash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "chunk_size": 16384,
                "downloadable": true,
                "receiver_id": "660e8400-e29b-41d4-a716-446655440001",
                "sender_id": "550e8400-e29b-41d4-a716-446655440000"
            },
            "created_at": "2026-07-05T06:00:00Z"
        })
        .to_string()
    }

    fn sample_v2_json() -> String {
        json!({
            "version": 2,
            "passphrase": "x7k9m2pq",
            "creator_id": "550e8400-e29b-41d4-a716-446655440000",
            "status": "open",
            "max_joiners": 5,
            "files": [{
                "file_id": "f1",
                "filename": "doc.pdf",
                "file_type": "pdf",
                "filesize": 1048576,
                "mime_type": "application/pdf",
                "filehash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "chunk_size": 16384,
                "downloadable": true
            }],
            "joiner_ids": [],
            "created_at": "2026-07-05T06:00:00Z",
            "expire_at": "2026-07-05T06:10:00Z"
        })
        .to_string()
    }

    #[test]
    fn deserialize_v1_without_version_field() {
        let state = deserialize_room_state(&sample_v1_json()).unwrap();
        assert_eq!(state.version(), 1);
        match state {
            RoomState::V1(v1) => {
                assert_eq!(v1.passphrase, "x7k9m2pq");
                assert!(v1.joiner_id.is_none());
            }
            RoomState::V2(_) => panic!("expected v1"),
        }
    }

    #[test]
    fn deserialize_v1_with_explicit_version_one() {
        let mut value: serde_json::Value = serde_json::from_str(&sample_v1_json()).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .insert("version".to_string(), json!(1));
        let state = deserialize_room_state(&value.to_string()).unwrap();
        assert_eq!(state.version(), 1);
    }

    #[test]
    fn deserialize_v2_room() {
        let state = deserialize_room_state(&sample_v2_json()).unwrap();
        assert_eq!(state.version(), 2);
        match state {
            RoomState::V2(v2) => {
                assert_eq!(v2.status, RoomStatus::Open);
                assert_eq!(v2.max_joiners, 5);
                assert_eq!(v2.files.len(), 1);
                assert!(v2.joiner_ids.is_empty());
            }
            RoomState::V1(_) => panic!("expected v2"),
        }
    }

    #[test]
    fn v2_room_creation_roundtrip() {
        let room = RoomStateV2::new_open(
            "abcd1234".to_string(),
            "550e8400-e29b-41d4-a716-446655440000".to_string(),
            vec![RoomFile {
                file_id: "f1".to_string(),
                filename: "doc.pdf".to_string(),
                file_type: "pdf".to_string(),
                filesize: 1024,
                mime_type: "application/pdf".to_string(),
                filehash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                    .to_string(),
                chunk_size: 16384,
                downloadable: true,
            }],
            DEFAULT_MAX_JOINERS,
            "2026-07-05T06:00:00Z".to_string(),
            "2026-07-05T06:10:00Z".to_string(),
        );

        let encoded = serde_json::to_string(&room).unwrap();
        let decoded = deserialize_room_state(&encoded).unwrap();
        assert_eq!(decoded.version(), 2);
        if let RoomState::V2(v2) = decoded {
            assert_eq!(v2.passphrase, room.passphrase);
            assert_eq!(v2.max_joiners, DEFAULT_MAX_JOINERS);
            assert_eq!(v2.files, room.files);
        } else {
            panic!("expected v2");
        }
    }

    #[test]
    fn room_connections_respects_v2_max_joiners() {
        let state = deserialize_room_state(&sample_v2_json()).unwrap();
        let conn = RoomConnections::from_room_state(&state);
        assert_eq!(conn.max_joiners, 5);
        assert!(conn.has_capacity());
    }

    #[tokio::test]
    async fn join_peer_returns_room_full_when_max_reached() {
        let rooms = WatchwordRooms::new();
        let passphrase = "testpass";
        let max = 2usize;
        let (tx1, _) = make_tx();
        let (tx2, _) = make_tx();
        let (tx3, _) = make_tx();

        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();
        let id3 = Uuid::new_v4();

        let peer1 = Uuid::new_v4().to_string();
        let peer2 = Uuid::new_v4().to_string();

        rooms
            .join_peer(passphrase, peer1, id1, tx1, max)
            .await
            .unwrap();
        rooms
            .join_peer(passphrase, peer2, id2, tx2, max)
            .await
            .unwrap();

        let err = rooms
            .join_peer(passphrase, Uuid::new_v4().to_string(), id3, tx3, max)
            .await
            .unwrap_err();
        assert_eq!(err, JoinPeerError::RoomFull);
    }

    #[tokio::test]
    async fn join_peer_issues_unique_peer_ids() {
        let rooms = WatchwordRooms::new();
        let passphrase = "unique";
        let (tx1, _) = make_tx();
        let (tx2, _) = make_tx();

        let peer1 = Uuid::new_v4().to_string();
        let peer2 = Uuid::new_v4().to_string();

        let returned1 = rooms
            .join_peer(passphrase, peer1.clone(), Uuid::new_v4(), tx1, 5)
            .await
            .unwrap();
        let returned2 = rooms
            .join_peer(passphrase, peer2.clone(), Uuid::new_v4(), tx2, 5)
            .await
            .unwrap();

        assert_ne!(returned1, returned2);
        assert_eq!(rooms.in_memory_active_joiners(passphrase).await, 2);
    }

    #[tokio::test]
    async fn notify_peer_joined_delivers_to_creator() {
        let rooms = WatchwordRooms::new();
        let passphrase = "notify";
        let creator_id = Uuid::new_v4();
        let joiner_id = Uuid::new_v4();
        let (creator_tx, mut creator_rx) = make_tx();
        let (joiner_tx, _) = make_tx();

        rooms
            .register_creator(passphrase, creator_id, creator_tx)
            .await
            .unwrap();

        let peer_id = Uuid::new_v4().to_string();
        rooms
            .join_peer(passphrase, peer_id.clone(), joiner_id, joiner_tx, 5)
            .await
            .unwrap();

        assert!(rooms.notify_peer_joined(passphrase, &peer_id).await);

        let msg = creator_rx.recv().await.expect("peer_joined notification");
        let Message::Text(text) = msg else {
            panic!("expected text message");
        };
        let parsed: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed["action"], "peer_joined");
        assert_eq!(parsed["peer_id"], peer_id);
    }

    #[tokio::test]
    async fn reconnect_reuses_existing_peer_id() {
        let rooms = WatchwordRooms::new();
        let passphrase = "reconnect";
        let user_id = Uuid::new_v4();
        let peer_id = Uuid::new_v4().to_string();
        let (tx1, _) = make_tx();
        let (tx2, _) = make_tx();

        let first = rooms
            .join_peer(passphrase, peer_id.clone(), user_id, tx1, 5)
            .await
            .unwrap();
        let second = rooms
            .join_peer(passphrase, Uuid::new_v4().to_string(), user_id, tx2, 5)
            .await
            .unwrap();

        assert_eq!(first, second);
        assert_eq!(rooms.in_memory_active_joiners(passphrase).await, 1);
    }

    #[tokio::test]
    async fn relay_to_peer_creator_to_joiner2() {
        let rooms = WatchwordRooms::new();
        let passphrase = "relay-c2j2";
        let creator_id = Uuid::new_v4();
        let joiner1_id = Uuid::new_v4();
        let joiner2_id = Uuid::new_v4();
        let creator_peer = Uuid::new_v4().to_string();
        let joiner1_peer = Uuid::new_v4().to_string();
        let joiner2_peer = Uuid::new_v4().to_string();

        let (creator_tx, _) = make_tx();
        let (joiner1_tx, _) = make_tx();
        let (joiner2_tx, mut joiner2_rx) = make_tx();

        rooms
            .register_creator_with_peer_id(
                passphrase,
                creator_id,
                Some(creator_peer),
                creator_tx,
            )
            .await
            .unwrap();
        rooms
            .join_peer(passphrase, joiner1_peer, joiner1_id, joiner1_tx, 5)
            .await
            .unwrap();
        rooms
            .join_peer(passphrase, joiner2_peer.clone(), joiner2_id, joiner2_tx, 5)
            .await
            .unwrap();

        let payload = Message::Text(json!({ "action": "offer" }).to_string().into());
        let result = rooms
            .relay_to_peer(passphrase, creator_id, &joiner2_peer, payload)
            .await;
        assert_eq!(result, RelayResult::Delivered);
        assert!(joiner2_rx.recv().await.is_some());
    }

    #[tokio::test]
    async fn relay_to_peer_joiner1_to_joiner2() {
        let rooms = WatchwordRooms::new();
        let passphrase = "relay-j1j2";
        let creator_id = Uuid::new_v4();
        let joiner1_id = Uuid::new_v4();
        let joiner2_id = Uuid::new_v4();
        let joiner1_peer = Uuid::new_v4().to_string();
        let joiner2_peer = Uuid::new_v4().to_string();

        let (creator_tx, _) = make_tx();
        let (joiner1_tx, _) = make_tx();
        let (joiner2_tx, mut joiner2_rx) = make_tx();

        rooms
            .register_creator(passphrase, creator_id, creator_tx)
            .await
            .unwrap();
        rooms
            .join_peer(passphrase, joiner1_peer, joiner1_id, joiner1_tx, 5)
            .await
            .unwrap();
        rooms
            .join_peer(passphrase, joiner2_peer.clone(), joiner2_id, joiner2_tx, 5)
            .await
            .unwrap();

        let payload = Message::Text(json!({ "action": "ice" }).to_string().into());
        let result = rooms
            .relay_to_peer(passphrase, joiner1_id, &joiner2_peer, payload)
            .await;
        assert_eq!(result, RelayResult::Delivered);
        assert!(joiner2_rx.recv().await.is_some());
    }

    #[tokio::test]
    async fn relay_to_peer_unknown_target_returns_not_found() {
        let rooms = WatchwordRooms::new();
        let passphrase = "relay-miss";
        let creator_id = Uuid::new_v4();
        let (creator_tx, _) = make_tx();
        rooms
            .register_creator(passphrase, creator_id, creator_tx)
            .await
            .unwrap();

        let payload = Message::Text(json!({ "action": "offer" }).to_string().into());
        let result = rooms
            .relay_to_peer(passphrase, creator_id, "missing-peer", payload)
            .await;
        assert_eq!(result, RelayResult::PeerNotFound);
    }
}
