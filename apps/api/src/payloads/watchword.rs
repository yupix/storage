use chrono::{DateTime, Utc};
use sea_orm::prelude::Uuid;
use serde::{Deserialize, Serialize};
use validator::Validate;

pub const DEFAULT_CHUNK_SIZE: i64 = 16384;
pub const MAX_CHUNK_SIZE: i64 = 65536;
pub const MAX_ROOM_TTL_SECS: u64 = 600;
pub const PASSPHRASE_LEN: usize = 8;
pub const MAX_PASSPHRASE_RETRIES: u32 = 16;

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

#[derive(Debug, Serialize, Deserialize)]
pub struct WatchwordRoom {
    pub passphrase: String,
    pub creator_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub joiner_id: Option<String>,
    pub metadata: WatchwordRoomMetadata,
    pub created_at: String,
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
}
