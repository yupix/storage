use axum::{
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::IntoResponse,
};
use serde::Deserialize;
use tokio::fs::File;
use tokio_util::io::ReaderStream;

use crate::{
    AppState,
    utils::storage::Storage,
};

#[derive(Deserialize)]
pub struct DownloadParams {
    pub key: String,
    pub exp: u64,
    pub ct: String,
    pub sig: String,
}

pub async fn download_file(
    State(state): State<AppState>,
    Query(params): Query<DownloadParams>,
) -> impl IntoResponse {
    let local = match &state.storage {
        Storage::Local(d) => d,
        _ => return (StatusCode::NOT_FOUND, HeaderMap::new(), axum::body::Body::empty()),
    };

    let now = chrono::Utc::now().timestamp() as u64;
    if params.exp <= now {
        return (StatusCode::GONE, HeaderMap::new(), axum::body::Body::empty());
    }

    if !local.verify_signature(&params.key, params.exp, &params.ct, &params.sig) {
        return (StatusCode::FORBIDDEN, HeaderMap::new(), axum::body::Body::empty());
    }

    let target = match local.resolve_path(&params.key) {
        Ok(p) => p,
        Err(_) => return (StatusCode::BAD_REQUEST, HeaderMap::new(), axum::body::Body::empty()),
    };

    let canonical_base = match tokio::fs::canonicalize(&local.base_path).await {
        Ok(p) => p,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, HeaderMap::new(), axum::body::Body::empty()),
    };
    let canonical_target = match tokio::fs::canonicalize(&target).await {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, HeaderMap::new(), axum::body::Body::empty()),
    };
    if !canonical_target.starts_with(&canonical_base) {
        return (StatusCode::FORBIDDEN, HeaderMap::new(), axum::body::Body::empty());
    }

    let file = match File::open(&canonical_target).await {
        Ok(f) => f,
        Err(_) => return (StatusCode::NOT_FOUND, HeaderMap::new(), axum::body::Body::empty()),
    };

    let stream = ReaderStream::new(file);
    let body = axum::body::Body::from_stream(stream);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("inline"),
    );
    if let Ok(val) = HeaderValue::from_str(&params.ct) {
        headers.insert(header::CONTENT_TYPE, val);
    }

    (StatusCode::OK, headers, body)
}
