use config::{Config, Environment};
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub struct Settings {
    pub database_url: String,
    pub redis_url: String,
    #[serde(default = "default_allow_origin")]
    pub allow_origin: String,

    #[serde(default)]
    pub storage_driver: Option<String>,

    pub rustfs_endpoint: Option<String>,
    pub rustfs_access_key: Option<String>,
    pub rustfs_secret_key: Option<String>,
    pub rustfs_bucket: Option<String>,
    #[serde(default = "default_true")]
    pub rustfs_force_path_style: bool,

    #[serde(default = "default_local_storage_path")]
    pub local_storage_path: String,
    pub local_base_url: Option<String>,
    pub local_signed_url_secret: Option<String>,
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

pub fn load_settings() -> Result<Settings, anyhow::Error> {
    dotenvy::dotenv().ok();
    let settings = Config::builder()
        .add_source(Environment::default())
        .build()?;

    settings
        .try_deserialize()
        .map_err(|e| anyhow::anyhow!("failed to deserialize settings: {e}"))
}
