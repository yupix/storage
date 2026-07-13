use config::{Config, Environment};
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub struct Settings {
    pub database_url: String,
    pub redis_url: String,
    #[serde(default = "default_allow_origin")]
    pub allow_origin: String,

    #[serde(default = "default_qdrant_url")]
    pub qdrant_url: String,
    pub qdrant_api_key: Option<String>,

    /// キャプションドライバー: "gemini" / "local_http" / 未設定(無効)
    pub caption_driver: Option<String>,
    pub gemini_api_key: Option<String>,
    /// ローカル HTTP キャプションサービスの URL（既定: http://localhost:8500）
    pub caption_local_url: Option<String>,

    #[serde(default)]
    pub storage_driver: Option<String>,

    pub s3_endpoint: Option<String>,
    /// 署名付き URL に使う公開エンドポイント。未設定時は s3_endpoint と同じ。
    /// Docker 等で内部エンドポイントがブラウザから到達できない場合に設定する
    pub s3_public_endpoint: Option<String>,
    pub s3_access_key: Option<String>,
    pub s3_secret_key: Option<String>,
    pub s3_bucket: Option<String>,
    #[serde(default = "default_true")]
    pub s3_force_path_style: bool,

    #[serde(default = "default_local_storage_path")]
    pub local_storage_path: String,
    pub local_base_url: Option<String>,
    pub local_signed_url_secret: Option<String>,

    /// カンマ区切り STUN URL（既定: stun:stun.l.google.com:19302）
    #[serde(default = "default_stun_urls")]
    pub stun_urls: Option<String>,
    /// カンマ区切り TURN URL
    pub turn_urls: Option<String>,
    pub turn_username: Option<String>,
    pub turn_credential: Option<String>,
}

fn default_qdrant_url() -> String {
    "http://qdrant.catarks.org:6333".to_string()
}

fn default_true() -> bool {
    true
}

fn default_allow_origin() -> String {
    "http://localhost:3000".to_string()
}

fn default_local_storage_path() -> String {
    "./data/uploads".to_string()
}

fn default_stun_urls() -> Option<String> {
    Some("stun:stun.l.google.com:19302".to_string())
}

pub fn load_settings() -> Result<Settings, anyhow::Error> {
    dotenvy::dotenv().ok();
    let settings = Config::builder()
        .add_source(Environment::default())
        .build()?;

    settings
        .try_deserialize()
        .map_err(|e| anyhow::anyhow!("failed to deserialize settings: {e}"))
}
