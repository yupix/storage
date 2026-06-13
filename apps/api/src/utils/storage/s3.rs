use std::{path::Path, time::Duration};

use anyhow::Result;
use aws_sdk_s3::{
    Client,
    config::{Builder, Credentials, Region},
    presigning::PresigningConfig,
    primitives::ByteStream,
};
use tokio::io::AsyncWriteExt;

use super::driver::StorageDriver;

#[derive(Clone)]
pub struct S3Driver {
    inner: Client,
    pub bucket: String,
}

impl S3Driver {
    pub fn new(
        endpoint: &str,
        access_key: &str,
        secret_key: &str,
        bucket: &str,
        force_path_style: bool,
    ) -> Self {
        let credentials = Credentials::new(access_key, secret_key, None, None, "s3");
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
}

impl StorageDriver for S3Driver {
    async fn upload(&self, key: &str, path: &Path, content_type: &str) -> Result<()> {
        let stream = ByteStream::from_path(path)
            .await
            .map_err(|e| anyhow::anyhow!("bytestream: {e}"))?;
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

    async fn delete(&self, key: &str) -> Result<()> {
        self.inner
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("delete failed: {e}"))?;
        Ok(())
    }

    async fn download_to(&self, key: &str, dest: &Path) -> Result<()> {
        let resp = self.inner
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("download failed: {e}"))?;
        let bytes = resp.body.collect().await
            .map_err(|e| anyhow::anyhow!("read body failed: {e}"))?.into_bytes();
        let mut file = tokio::fs::File::create(dest).await?;
        file.write_all(&bytes).await?;
        Ok(())
    }

    async fn get_download_url(&self, key: &str, _content_type: &str, expires_in: Duration) -> Result<String> {
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
