use chrono::{DateTime, Utc};
use sea_orm::prelude::Uuid;
use serde::{Deserialize, Serialize};
use validator::Validate;

pub const DEFAULT_CHUNK_SIZE: i64 = 16384;
pub const MAX_CHUNK_SIZE: i64 = 65536;
pub const MAX_ROOM_TTL_SECS: u64 = 600;
pub const PASSPHRASE_LEN: usize = 8;
pub const MAX_PASSPHRASE_RETRIES: u32 = 16;
pub const DEFAULT_MAX_JOINERS: u32 = 5;
pub const WATCHWORD_ROOM_VERSION_V2: u32 = 2;

#[derive(Validate, Debug, Deserialize, utoipa::ToSchema)]
pub struct CreateWatchwordRequest {
    #[validate(length(min = 1, max = 255))]
    pub filename: String,
    #[validate(length(min = 1, max = 255))]
    pub file_type: String,
    #[validate(range(min = 1))]
    pub filesize: i64,
    #[validate(length(min = 1, max = 255))]
    pub mime_type: String,
    pub sender_id: Uuid,
    pub receiver_id: Uuid,
    pub filehash: String,
    #[serde(default = "default_chunk_size")]
    #[validate(range(min = 1, max = 65536))]
    pub chunk_size: i64,
    pub downloadable: bool,
    #[schema(value_type = Option<String>, format = DateTime, example = "2026-06-27T14:00:00Z")]
    pub expire_at: Option<DateTime<Utc>>,
}

fn default_chunk_size() -> i64 {
    DEFAULT_CHUNK_SIZE
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct CreateWatchwordResponse {
    pub passphrase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchwordRoomMetadata {
    pub filename: String,
    pub file_type: String,
    pub filesize: i64,
    pub mime_type: String,
    pub filehash: String,
    pub chunk_size: i64,
    pub downloadable: bool,
    pub receiver_id: String,
    pub sender_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchwordRoom {
    pub passphrase: String,
    pub creator_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub joiner_id: Option<String>,
    pub metadata: WatchwordRoomMetadata,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct WatchwordFileEntry {
    pub file_id: String,
    pub filename: String,
    pub file_type: String,
    pub filesize: i64,
    pub mime_type: String,
    pub filehash: String,
    #[serde(default = "default_chunk_size")]
    pub chunk_size: i64,
    #[serde(default)]
    pub downloadable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchwordRoomV2 {
    pub version: u32,
    pub passphrase: String,
    pub creator_id: String,
    pub status: String,
    pub max_joiners: u32,
    pub files: Vec<WatchwordFileEntry>,
    pub joiner_ids: Vec<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expire_at: Option<String>,
}

#[derive(Debug, Clone)]
pub enum ParsedWatchwordRoom {
    V1(WatchwordRoom),
    V2(WatchwordRoomV2),
}

impl ParsedWatchwordRoom {
    pub fn creator_id(&self) -> &str {
        match self {
            Self::V1(room) => &room.creator_id,
            Self::V2(room) => &room.creator_id,
        }
    }

    pub fn passphrase(&self) -> &str {
        match self {
            Self::V1(room) => &room.passphrase,
            Self::V2(room) => &room.passphrase,
        }
    }

    pub fn is_v2(&self) -> bool {
        matches!(self, Self::V2(_))
    }

    pub fn active_joiner_count(&self) -> usize {
        match self {
            Self::V1(room) => usize::from(room.joiner_id.is_some()),
            Self::V2(room) => room.joiner_ids.len(),
        }
    }

    pub fn max_joiners(&self) -> u32 {
        match self {
            Self::V1(_) => 1,
            Self::V2(room) => room.max_joiners,
        }
    }

    pub fn status(&self) -> &str {
        match self {
            Self::V1(_) => "open",
            Self::V2(room) => &room.status,
        }
    }

    pub fn room_meta_for_join(&self) -> JoinWatchwordRoomMeta {
        match self {
            Self::V1(room) => JoinWatchwordRoomMeta {
                status: "open".into(),
                files: vec![WatchwordFileEntry {
                    file_id: "f1".into(),
                    filename: room.metadata.filename.clone(),
                    file_type: room.metadata.file_type.clone(),
                    filesize: room.metadata.filesize,
                    mime_type: room.metadata.mime_type.clone(),
                    filehash: room.metadata.filehash.clone(),
                    chunk_size: room.metadata.chunk_size,
                    downloadable: room.metadata.downloadable,
                }],
                max_joiners: 1,
                active_joiners: self.active_joiner_count() as u32,
            },
            Self::V2(room) => JoinWatchwordRoomMeta {
                status: room.status.clone(),
                files: room.files.clone(),
                max_joiners: room.max_joiners,
                active_joiners: room.joiner_ids.len() as u32,
            },
        }
    }
}

pub fn parse_stored_room(raw: &str) -> Result<ParsedWatchwordRoom, serde_json::Error> {
    let value: serde_json::Value = serde_json::from_str(raw)?;
    let version = value.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
    if version >= WATCHWORD_ROOM_VERSION_V2 as u64 {
        Ok(ParsedWatchwordRoom::V2(serde_json::from_value(value)?))
    } else {
        Ok(ParsedWatchwordRoom::V1(serde_json::from_value(value)?))
    }
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct JoinWatchwordRoomMeta {
    pub status: String,
    pub files: Vec<WatchwordFileEntry>,
    pub max_joiners: u32,
    pub active_joiners: u32,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct JoinWatchwordResponse {
    pub peer_id: String,
    pub protocol: u32,
    pub room: JoinWatchwordRoomMeta,
}

pub fn room_key(passphrase: &str) -> String {
    format!("watchword:room:{passphrase}")
}

pub fn validate_filehash(filehash: &str) -> Result<(), String> {
    let Some(hex) = filehash.strip_prefix("sha256:") else {
        return Err("filehash must use sha256:<hex> format".into());
    };
    if hex.len() != 64 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("filehash must be sha256 followed by 64 hex digits".into());
    }
    Ok(())
}

pub fn compute_ttl_secs(expire_at: Option<DateTime<Utc>>) -> Result<u64, String> {
    match expire_at {
        None => Ok(MAX_ROOM_TTL_SECS),
        Some(exp) => {
            let secs = (exp - Utc::now()).num_seconds();
            if secs <= 0 {
                return Err("expire_at must be in the future".into());
            }
            Ok((secs as u64).min(MAX_ROOM_TTL_SECS))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    #[test]
    fn accepts_valid_filehash() {
        let hex = "a".repeat(64);
        assert!(validate_filehash(&format!("sha256:{hex}")).is_ok());
    }

    #[test]
    fn rejects_invalid_filehash() {
        assert!(validate_filehash("deadbeef").is_err());
        assert!(validate_filehash("sha256:abc").is_err());
    }

    #[test]
    fn ttl_defaults_to_ten_minutes() {
        assert_eq!(compute_ttl_secs(None).unwrap(), 600);
    }

    #[test]
    fn ttl_caps_at_ten_minutes() {
        let future = Utc::now() + Duration::hours(1);
        assert_eq!(compute_ttl_secs(Some(future)).unwrap(), 600);
    }

    #[test]
    fn ttl_uses_sooner_expire_at() {
        let future = Utc::now() + Duration::seconds(120);
        let ttl = compute_ttl_secs(Some(future)).unwrap();
        assert!(ttl <= 120);
        assert!(ttl >= 118);
    }

    #[test]
    fn ttl_rejects_past_expire_at() {
        let past = Utc::now() - Duration::seconds(1);
        assert!(compute_ttl_secs(Some(past)).is_err());
    }

    #[test]
    fn parses_v1_room_without_version_field() {
        let raw = r#"{
            "passphrase": "abcd1234",
            "creator_id": "550e8400-e29b-41d4-a716-446655440000",
            "joiner_id": null,
            "metadata": {
                "filename": "a.pdf",
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
        }"#;
        let room = parse_stored_room(raw).unwrap();
        assert!(!room.is_v2());
        assert_eq!(room.max_joiners(), 1);
    }

    #[test]
    fn parses_v2_room_with_multi_joiner_fields() {
        let raw = r#"{
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
            "created_at": "2026-07-05T06:00:00Z"
        }"#;
        let room = parse_stored_room(raw).unwrap();
        assert!(room.is_v2());
        assert_eq!(room.max_joiners(), 5);
        assert_eq!(room.active_joiner_count(), 0);
    }
}
