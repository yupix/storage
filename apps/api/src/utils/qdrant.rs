use std::collections::HashMap;

use reqwest::{Client, header};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

/// Qdrant REST API クライアント（port 6333）
#[derive(Clone)]
pub struct QdrantRest {
    client: Client,
    base_url: String,
}

impl QdrantRest {
    pub fn new(base_url: &str, api_key: Option<&str>) -> anyhow::Result<Self> {
        let mut headers = header::HeaderMap::new();
        if let Some(key) = api_key {
            let value = header::HeaderValue::from_str(key)
                .map_err(|e| anyhow::anyhow!("invalid api key: {e}"))?;
            headers.insert("api-key", value);
        }
        let client = Client::builder().default_headers(headers).build()?;
        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
        })
    }

    pub async fn collection_exists(&self, name: &str) -> anyhow::Result<bool> {
        let resp = self
            .client
            .get(format!("{}/collections/{}", self.base_url, name))
            .send()
            .await?;
        Ok(resp.status().is_success())
    }

    pub async fn create_collection(&self, name: &str, dim: u64) -> anyhow::Result<()> {
        self.client
            .put(format!("{}/collections/{}", self.base_url, name))
            .json(&json!({
                "vectors": {
                    "size": dim,
                    "distance": "Cosine"
                }
            }))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    pub async fn upsert_point(
        &self,
        collection: &str,
        id: Uuid,
        vector: Vec<f32>,
        payload: Value,
    ) -> anyhow::Result<()> {
        self.client
            .put(format!("{}/collections/{}/points", self.base_url, collection))
            .json(&json!({
                "points": [{
                    "id": id.to_string(),
                    "vector": vector,
                    "payload": payload
                }]
            }))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    pub async fn search(
        &self,
        collection: &str,
        vector: Vec<f32>,
        limit: u64,
        filter: Option<Value>,
    ) -> anyhow::Result<Vec<ScoredPoint>> {
        let mut body = json!({
            "vector": vector,
            "limit": limit,
            "with_payload": true
        });
        if let Some(f) = filter {
            body["filter"] = f;
        }

        #[derive(Deserialize)]
        struct Response {
            result: Vec<ScoredPoint>,
        }

        let resp: Response = self
            .client
            .post(format!(
                "{}/collections/{}/points/search",
                self.base_url, collection
            ))
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        Ok(resp.result)
    }
}

#[derive(Debug, Deserialize)]
pub struct ScoredPoint {
    pub id: Value,
    pub score: f32,
    pub payload: Option<HashMap<String, Value>>,
}
