use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::Message;
use sea_orm::prelude::Uuid;
use tokio::sync::{RwLock, mpsc};

pub type WsOutbound = mpsc::UnboundedSender<Message>;

#[derive(Clone)]
pub struct PeerSlot {
    pub user_id: Uuid,
    pub tx: WsOutbound,
}

#[derive(Default)]
pub struct RoomConnections {
    pub creator: Option<PeerSlot>,
    pub joiner: Option<PeerSlot>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Creator,
    Joiner,
}

impl RoomConnections {
    pub fn role_of(&self, user_id: Uuid) -> Option<Role> {
        if self.creator.as_ref().is_some_and(|p| p.user_id == user_id) {
            return Some(Role::Creator);
        }
        if self.joiner.as_ref().is_some_and(|p| p.user_id == user_id) {
            return Some(Role::Joiner);
        }
        None
    }

    pub fn other_tx(&self, user_id: Uuid) -> Option<&WsOutbound> {
        match self.role_of(user_id)? {
            Role::Creator => self.joiner.as_ref().map(|p| &p.tx),
            Role::Joiner => self.creator.as_ref().map(|p| &p.tx),
        }
    }

    pub fn connected_count(&self) -> usize {
        usize::from(self.creator.is_some()) + usize::from(self.joiner.is_some())
    }
}

#[derive(Debug)]
pub enum RegisterError {
    RoomFull,
    SlotTaken,
    AlreadyCreator,
    AlreadyJoiner,
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

    pub async fn register_creator(
        &self,
        passphrase: &str,
        user_id: Uuid,
        tx: WsOutbound,
    ) -> Result<(), RegisterError> {
        let mut rooms = self.rooms.write().await;
        let room = rooms.entry(passphrase.to_string()).or_default();

        if room.joiner.as_ref().is_some_and(|p| p.user_id == user_id) {
            return Err(RegisterError::AlreadyJoiner);
        }

        if let Some(existing) = &room.creator {
            if existing.user_id != user_id {
                return Err(RegisterError::SlotTaken);
            }
        }

        room.creator = Some(PeerSlot { user_id, tx });
        Ok(())
    }

    pub async fn register_joiner(
        &self,
        passphrase: &str,
        user_id: Uuid,
        tx: WsOutbound,
    ) -> Result<(), RegisterError> {
        let mut rooms = self.rooms.write().await;
        let room = rooms.entry(passphrase.to_string()).or_default();

        if room.creator.as_ref().is_some_and(|p| p.user_id == user_id) {
            return Err(RegisterError::AlreadyCreator);
        }

        if let Some(existing) = &room.joiner {
            if existing.user_id != user_id {
                return Err(RegisterError::RoomFull);
            }
        } else if room.connected_count() >= 2 {
            return Err(RegisterError::RoomFull);
        }

        room.joiner = Some(PeerSlot { user_id, tx });
        Ok(())
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
            if room.creator.is_none() && room.joiner.is_none() {
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

    pub async fn is_registered(&self, passphrase: &str, user_id: Uuid) -> bool {
        let rooms = self.rooms.read().await;
        rooms
            .get(passphrase)
            .is_some_and(|room| room.role_of(user_id).is_some())
    }
}
