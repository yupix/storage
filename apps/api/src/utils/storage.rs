use std::time::Duration;

use anyhow::Result;
use aws_sdk_s3::{
    Client,
    config::{Builder, Credentials, Region},
    presigning::PresigningConfig,
    primitives::ByteStream,
};

#[derive(Clone)]
pub struct StorageClient {
    inner: Client,
    pub bucket: String,
}

impl StorageClient {
    pub fn new(endpoint: &str, access_key: &str, secret_key: &str, bucket: &str, force_path_style: bool) -> Self {
        let credentials = Credentials::new(access_key, secret_key, None, None, "rustfs");
        let config = Builder::new()
            .endpoint_url(endpoint)
            .credentials_provider(credentials)
            .region(Region::new("us-east-1"))
            .force_path_style(force_path_style)
            .build();
        Self {
            inner: Client::from_conf(config),
            bucket: bucket.to_string(),
        }
    }

    pub async fn upload(&self, key: &str, stream: ByteStream, content_type: &str) -> Result<()> {
        self.inner
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .content_type(content_type)
            .body(stream)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("upload failed: {e}"))?;
        Ok(())
    }

    pub async fn delete(&self, key: &str) -> Result<()> {
        self.inner
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("delete failed: {e}"))?;
        Ok(())
    }

    pub async fn presigned_get_url(&self, key: &str, expires_in: Duration) -> Result<String> {
        let config = PresigningConfig::expires_in(expires_in)
            .map_err(|e| anyhow::anyhow!("presigning config: {e}"))?;
        let presigned = self.inner
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .presigned(config)
            .await
            .map_err(|e| anyhow::anyhow!("presign failed: {e}"))?;
        Ok(presigned.uri().to_string())
    }
}
