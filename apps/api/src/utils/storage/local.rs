use std::{path::{Path, PathBuf}, time::Duration};

use anyhow::{Result, bail};
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::Sha256;

use super::driver::StorageDriver;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone)]
pub struct LocalDriver {
    pub base_path: PathBuf,
    pub base_url: String,
    pub secret: String,
}

impl LocalDriver {
    pub fn new(base_path: impl Into<PathBuf>, base_url: impl Into<String>, secret: impl Into<String>) -> Self {
        Self {
            base_path: base_path.into(),
            base_url: base_url.into(),
            secret: secret.into(),
        }
    }

    fn sign(&self, key: &str, exp: u64, content_type: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(self.secret.as_bytes())
            .expect("HMAC accepts any key length");
        mac.update(format!("{key}:{exp}:{content_type}").as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }

    pub fn verify_signature(&self, key: &str, exp: u64, content_type: &str, sig: &str) -> bool {
        let mut mac = HmacSha256::new_from_slice(self.secret.as_bytes())
            .expect("HMAC accepts any key length");
        mac.update(format!("{key}:{exp}:{content_type}").as_bytes());
        mac.verify_slice(&hex::decode(sig).unwrap_or_default()).is_ok()
    }

    pub fn resolve_path(&self, key: &str) -> Result<PathBuf> {
        let p = Path::new(key);
        if p.is_absolute() || p.components().any(|c| c == std::path::Component::ParentDir) {
            bail!("invalid key: {key}");
        }
        Ok(self.base_path.join(key))
    }
}

impl StorageDriver for LocalDriver {
    async fn upload(&self, key: &str, path: &Path, _content_type: &str) -> Result<()> {
        let dest = self.resolve_path(key)?;
        if let Some(parent) = dest.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        if tokio::fs::rename(path, &dest).await.is_err() {
            // rename 失敗時（クロスデバイス等）は copy のみ行い、
            // 一時ファイルの削除は呼び出し元の NamedTempFile ドロップに委ねる。
            tokio::fs::copy(path, &dest).await?;
        }
        Ok(())
    }

    async fn delete(&self, key: &str) -> Result<()> {
        let target = self.resolve_path(key)?;
        match tokio::fs::remove_file(&target).await {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => {
                tracing::warn!("ローカルストレージの削除失敗 key={key}: {e}");
                Err(e.into())
            }
        }
    }

    async fn get_download_url(&self, key: &str, content_type: &str, expires_in: Duration) -> Result<String> {
        let exp = (Utc::now() + expires_in).timestamp() as u64;
        let sig = self.sign(key, exp, content_type);
        let encoded_key = urlencoding::encode(key);
        let encoded_ct = urlencoding::encode(content_type);
        Ok(format!(
            "{}/v1/internal/download?key={encoded_key}&exp={exp}&ct={encoded_ct}&sig={sig}",
            self.base_url
        ))
    }
}
