use sea_orm::prelude::Uuid;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
pub struct FileListQuery {
    pub folder_id: Option<Uuid>,
    pub page: Option<u64>,
    pub limit: Option<u64>,
    pub is_favorite: Option<bool>,
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
pub struct FileSearchQuery {
    pub q: String,
    /// 検索タイプ: 省略または "hybrid" でハイブリッド検索（キーワード+ベクトル RRF 統合）、
    /// "keyword" / "vector" で単経路検索
    #[serde(rename = "type")]
    pub search_type: Option<String>,
    pub page: Option<u64>,
    pub limit: Option<u64>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct FileResponse {
    pub id: String,
    pub name: String,
    pub file_type: String,
    pub size: i64,
    pub updated_at: String,
    pub sender_id: String,
    pub is_favorite: bool,
    /// hybrid 検索時のマッチ理由: "keyword" | "vector" | "both"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_reason: Option<String>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct PaginatedFileResponse {
    pub files: Vec<FileResponse>,
    pub total: u64,
    pub page: u64,
    pub limit: u64,
    /// vector 経路障害時に true（キーワード結果のみ返却）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub degraded: Option<bool>,
    /// degraded 時の理由（例: "vector_unavailable"）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub degradation_reason: Option<String>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct FileDetailResponse {
    pub id: String,
    pub name: String,
    pub file_type: String,
    pub size: i64,
    pub updated_at: String,
    pub sender_id: String,
    pub is_favorite: bool,
    /// RustFS 署名付き URL（有効期限あり）
    pub url: String,
    /// URL の有効期限（秒）
    pub url_expires_in: u64,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct UpdateFileRequest {
    pub filename: Option<String>,
    /// null を渡すとルートへ移動。省略時は変更なし
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub folder_id: Option<Option<Uuid>>,
    pub is_favorite: Option<bool>,
}

pub fn deserialize_optional_field<'de, D>(
    deserializer: D,
) -> Result<Option<Option<Uuid>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<Uuid>::deserialize(deserializer).map(Some)
}

/// ゴミ箱空にする操作の部分失敗レスポンス（HTTP 207）
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct EmptyTrashResponse {
    pub deleted: Vec<String>,
    pub failed: Vec<String>,
}

/// multipart/form-data アップロード用リクエスト（OpenAPI スキーマ定義用）
#[derive(utoipa::ToSchema)]
#[allow(dead_code)]
pub struct UploadFileRequest {
    #[schema(format = Binary)]
    pub file: Vec<u8>,
    pub folder_id: Option<String>,
}
