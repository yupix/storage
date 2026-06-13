use std::path::Path;

use anyhow::{Context, Result};
use base64::{Engine, engine::general_purpose::STANDARD};
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

const PROMPT: &str = "この画像に写っているものを日本語で簡潔に説明してください。人物・物体・場所・テキスト・状況など重要な要素を含めてください。";

#[derive(Clone)]
pub struct GeminiCaptioner {
    client: Client,
    api_key: String,
    model: String,
}

impl GeminiCaptioner {
    pub fn new(api_key: &str) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.to_string(),
            model: "gemini-2.0-flash-lite".to_string(),
        }
    }

    pub async fn caption(&self, path: &Path, mime: &str) -> Result<Option<String>> {
        let bytes = tokio::fs::read(path).await.context("image read")?;
        let b64 = STANDARD.encode(&bytes);

        let body = json!({
            "contents": [{
                "parts": [
                    { "inline_data": { "mime_type": mime, "data": b64 } },
                    { "text": PROMPT }
                ]
            }],
            "generationConfig": { "maxOutputTokens": 256 }
        });

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            self.model, self.api_key
        );

        #[derive(Deserialize)]
        struct Response {
            candidates: Option<Vec<Candidate>>,
        }
        #[derive(Deserialize)]
        struct Candidate {
            content: Content,
        }
        #[derive(Deserialize)]
        struct Content {
            parts: Vec<Part>,
        }
        #[derive(Deserialize)]
        struct Part {
            text: Option<String>,
        }

        let resp: Response = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .context("gemini request")?
            .error_for_status()
            .context("gemini status")?
            .json()
            .await
            .context("gemini parse")?;

        let text = resp
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content.parts.into_iter().next())
            .and_then(|p| p.text)
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty());

        Ok(text)
    }
}
