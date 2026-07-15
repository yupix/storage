use serde::Serialize;

use crate::settings::Settings;

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct IceServer {
    pub urls: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential: Option<String>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct IceServersResponse {
    pub ice_servers: Vec<IceServer>,
}

impl IceServersResponse {
    pub fn from_settings(settings: &Settings) -> Self {
        let mut ice_servers = Vec::new();

        let stun = settings
            .stun_urls
            .as_deref()
            .unwrap_or("stun:stun.l.google.com:19302");
        for url in split_urls(stun) {
            ice_servers.push(IceServer {
                urls: url,
                username: None,
                credential: None,
            });
        }

        if let (Some(turn_urls), Some(username), Some(credential)) = (
            settings.turn_urls.as_deref(),
            settings.turn_username.as_deref(),
            settings.turn_credential.as_deref(),
        ) {
            for url in split_urls(turn_urls) {
                ice_servers.push(IceServer {
                    urls: url,
                    username: Some(username.to_string()),
                    credential: Some(credential.to_string()),
                });
            }
        }

        Self { ice_servers }
    }
}

fn split_urls(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Settings;

    fn base_settings() -> Settings {
        Settings {
            database_url: "postgres://localhost/test".to_string(),
            redis_url: "redis://localhost".to_string(),
            allow_origin: "http://localhost:3000".to_string(),
            qdrant_url: "http://localhost:6333".to_string(),
            qdrant_api_key: None,
            search_score_threshold: Some(0.8),
            caption_driver: None,
            gemini_api_key: None,
            caption_local_url: None,
            storage_driver: None,
            s3_endpoint: None,
            s3_access_key: None,
            s3_secret_key: None,
            s3_bucket: None,
            s3_force_path_style: true,
            s3_public_endpoint: None,
            local_storage_path: "./data/uploads".to_string(),
            local_base_url: None,
            local_signed_url_secret: None,
            stun_urls: default_stun_urls(),
            turn_urls: None,
            turn_username: None,
            turn_credential: None,
        }
    }

    fn default_stun_urls() -> Option<String> {
        Some("stun:stun.l.google.com:19302".to_string())
    }

    #[test]
    fn stun_only_when_turn_unset() {
        let response = IceServersResponse::from_settings(&base_settings());
        assert_eq!(response.ice_servers.len(), 1);
        assert_eq!(response.ice_servers[0].urls, "stun:stun.l.google.com:19302");
        assert!(response.ice_servers[0].username.is_none());
        assert!(response.ice_servers[0].credential.is_none());
    }

    #[test]
    fn includes_turn_when_configured() {
        let mut settings = base_settings();
        settings.turn_urls = Some("turn:turn.example.com:3478".to_string());
        settings.turn_username = Some("user".to_string());
        settings.turn_credential = Some("pass".to_string());

        let response = IceServersResponse::from_settings(&settings);
        assert_eq!(response.ice_servers.len(), 2);
        assert_eq!(response.ice_servers[1].urls, "turn:turn.example.com:3478");
        assert_eq!(response.ice_servers[1].username.as_deref(), Some("user"));
        assert_eq!(response.ice_servers[1].credential.as_deref(), Some("pass"));
    }

    #[test]
    fn turn_omitted_when_credentials_incomplete() {
        let mut settings = base_settings();
        settings.turn_urls = Some("turn:turn.example.com:3478".to_string());
        settings.turn_username = Some("user".to_string());

        let response = IceServersResponse::from_settings(&settings);
        assert_eq!(response.ice_servers.len(), 1);
    }
}
