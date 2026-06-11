use std::{path::Path, time::Duration};

use anyhow::Result;

#[allow(async_fn_in_trait)]
pub trait StorageDriver {
    async fn upload(&self, key: &str, path: &Path, content_type: &str) -> Result<()>;
    async fn delete(&self, key: &str) -> Result<()>;
    async fn get_download_url(&self, key: &str, content_type: &str, expires_in: Duration) -> Result<String>;
}
