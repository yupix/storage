use config::{Config, Environment};
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub struct Settings {
    pub database_url: String,
    pub redis_url: String,
    #[serde(default = "default_allow_origin")]
    pub allow_origin: String,
    pub rustfs_endpoint: String,
    pub rustfs_access_key: String,
    pub rustfs_secret_key: String,
    pub rustfs_bucket: String,
    #[serde(default = "default_rustfs_force_path_style")]
    pub rustfs_force_path_style: bool,
}

fn default_rustfs_force_path_style() -> bool {
    true
}

fn default_allow_origin() -> String {
    "http://localhost:3000".to_string()
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
