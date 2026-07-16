use sea_orm::prelude::Uuid;
use serde::{Deserialize, Serialize};

/// リンク共有の発行リクエスト。
#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct CreateShareLinkRequest {
    /// 共有するファイルの ID（発行者が所有するファイルのみ）。
    pub file_id: Uuid,
    /// リンクの有効期限（秒）。省略時は無期限。
    pub expires_in_seconds: Option<u64>,
    /// ダウンロードを許可するか（既定: true）。
    pub download_allowed: Option<bool>,
}

/// 発行したリンクの情報。共有 URL はトークンからフロント側で組み立てる。
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct ShareLinkResponse {
    /// 推測不可能な共有トークン。
    pub token: String,
    /// 有効期限（ISO8601）。無期限の場合は null。
    pub expires_at: Option<String>,
    pub download_allowed: bool,
    /// 発行日時（ISO8601）。
    pub created_at: String,
}

/// 未認証の公開アクセスで返すメタデータ。
/// 所有者情報やファイル ID など、共有に不要な情報は一切含めない。
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct PublicShareResponse {
    pub file_name: String,
    pub file_type: String,
    pub size: i64,
    pub download_allowed: bool,
    /// 有効期限（ISO8601）。無期限の場合は null。
    pub expires_at: Option<String>,
}
