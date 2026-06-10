pub mod driver;
pub mod local;
pub mod s3;

pub use driver::StorageDriver;
pub use local::LocalDriver;
pub use s3::S3Driver;

use std::{path::Path, time::Duration};

use anyhow::Result;

use crate::settings::Settings;

#[derive(Clone)]
pub enum Storage {
    S3(S3Driver),
    Local(LocalDriver),
}

impl StorageDriver for Storage {
    async fn upload(&self, key: &str, path: &Path, content_type: &str) -> Result<()> {
        match self {
            Self::S3(d) => d.upload(key, path, content_type).await,
            Self::Local(d) => d.upload(key, path, content_type).await,
        }
    }

    async fn delete(&self, key: &str) -> Result<()> {
        match self {
            Self::S3(d) => d.delete(key).await,
            Self::Local(d) => d.delete(key).await,
        }
    }

    async fn get_download_url(&self, key: &str, expires_in: Duration) -> Result<String> {
        match self {
            Self::S3(d) => d.get_download_url(key, expires_in).await,
            Self::Local(d) => d.get_download_url(key, expires_in).await,
        }
    }
}

pub fn build_storage(settings: &Settings) -> Result<Storage> {
    match settings.storage_driver.as_deref() {
        Some("s3") => build_s3(settings),
        Some("local") => build_local(settings),
        Some(other) => Err(anyhow::anyhow!("不明なストレージドライバー: {other}")),
        None => {
            let has_s3 = settings.rustfs_endpoint.is_some()
                && settings.rustfs_access_key.is_some()
                && settings.rustfs_secret_key.is_some()
                && settings.rustfs_bucket.is_some();
            if has_s3 {
                build_s3(settings)
            } else {
                tracing::warn!(
                    "S3 接続情報が未設定のためローカルストレージを使用します。\
                     複数インスタンス環境では共有ストレージを設定してください。"
                );
                build_local(settings)
            }
        }
    }
}

fn build_s3(settings: &Settings) -> Result<Storage> {
    let endpoint = settings
        .rustfs_endpoint
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("RUSTFS_ENDPOINT が未設定です"))?;
    let access_key = settings
        .rustfs_access_key
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("RUSTFS_ACCESS_KEY が未設定です"))?;
    let secret_key = settings
        .rustfs_secret_key
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("RUSTFS_SECRET_KEY が未設定です"))?;
    let bucket = settings
        .rustfs_bucket
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("RUSTFS_BUCKET が未設定です"))?;
    Ok(Storage::S3(S3Driver::new(
        endpoint,
        access_key,
        secret_key,
        bucket,
        settings.rustfs_force_path_style,
    )))
}

fn build_local(settings: &Settings) -> Result<Storage> {
    let secret = settings
        .local_signed_url_secret
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!(
            "LOCAL_SIGNED_URL_SECRET が未設定です。ローカルストレージには必須です。"
        ))?;
    if secret.len() < 32 {
        return Err(anyhow::anyhow!(
            "LOCAL_SIGNED_URL_SECRET は 32 文字以上にしてください"
        ));
    }
    let base_url = settings
        .local_base_url
        .as_deref()
        .unwrap_or("http://localhost:3400");
    Ok(Storage::Local(LocalDriver::new(
        &settings.local_storage_path,
        base_url,
        secret,
    )))
}
