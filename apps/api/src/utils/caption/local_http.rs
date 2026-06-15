use std::path::Path;

use anyhow::{Context, Result};
use reqwest::Client;
use serde::Deserialize;

/// ローカル HTTP キャプションサービスクライアント。
///
/// 対応 API:
///   POST {url}/caption
///   Content-Type: multipart/form-data; field name = "file"
///   Response: { "caption": "..." }
#[derive(Clone)]
pub struct LocalHttpCaptioner {
    client: Client,
    url: String,
}

impl LocalHttpCaptioner {
    pub fn new(url: &str) -> Self {
        Self {
            client: Client::new(),
            url: url.trim_end_matches('/').to_string(),
        }
    }

    pub async fn caption(&self, path: &Path, _mime: &str) -> Result<Option<String>> {
        let bytes = tokio::fs::read(path).await.context("image read")?;
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("image")
            .to_string();

        let part = reqwest::multipart::Part::bytes(bytes).file_name(filename);
        let form = reqwest::multipart::Form::new().part("file", part);

        #[derive(Deserialize)]
        struct Response {
            caption: Option<String>,
        }

        let resp: Response = self
            .client
            .post(format!("{}/caption", self.url))
            .multipart(form)
            .send()
            .await
            .context("local_http request")?
            .error_for_status()
            .context("local_http status")?
            .json()
            .await
            .context("local_http parse")?;

        Ok(resp.caption.filter(|t| !t.trim().is_empty()))
    }
}
