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
    /// 署名付き URL 生成専用クライアント。公開エンドポイント
    /// (S3_PUBLIC_ENDPOINT) で署名することで、Docker 内部ホスト名などの
    /// ブラウザから到達できない URL が返るのを防ぐ
    presigner: Client,
    pub bucket: String,
}

impl S3Driver {
    pub fn new(
        endpoint: &str,
        public_endpoint: Option<&str>,
        access_key: &str,
        secret_key: &str,
        bucket: &str,
        force_path_style: bool,
    ) -> Self {
        let credentials = Credentials::new(access_key, secret_key, None, None, "s3");
        let build_client = |endpoint: &str| {
            let config = Builder::new()
                .endpoint_url(endpoint)
                .credentials_provider(credentials.clone())
                .region(Region::new("us-east-1"))
                .force_path_style(force_path_style)
                .build();
            Client::from_conf(config)
        };
        let inner = build_client(endpoint);
        let presigner = match public_endpoint {
            Some(public) if public != endpoint => build_client(public),
            _ => inner.clone(),
        };
        Self {
            inner,
            presigner,
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
        let mut reader = resp.body.into_async_read();
        let mut file = tokio::fs::File::create(dest).await?;
        tokio::io::copy(&mut reader, &mut file).await?;
        Ok(())
    }

    async fn get_download_url(&self, key: &str, _content_type: &str, expires_in: Duration) -> Result<String> {
        let config = PresigningConfig::expires_in(expires_in)
            .map_err(|e| anyhow::anyhow!("presigning config: {e}"))?;
        let presigned = self.presigner
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .presigned(config)
            .await
            .map_err(|e| anyhow::anyhow!("presign failed: {e}"))?;
        Ok(presigned.uri().to_string())
    }
}
