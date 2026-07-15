use serde::Deserialize;
use validator::Validate;

/// ログイン中ユーザーのプロフィール更新リクエスト。
///
/// 各フィールドは省略可能で、`Some` のものだけ更新する（部分更新）。
#[derive(Validate, Debug, Deserialize, utoipa::ToSchema)]
pub struct UpdateUserRequest {
    /// 新しいユーザー名（省略時は変更しない）
    #[schema(value_type = Option<String>, format = "username")]
    #[validate(length(min = 3))]
    pub username: Option<String>,
    /// 新しいメールアドレス（省略時は変更しない）
    #[schema(value_type = Option<String>, format = "email")]
    #[validate(email, length(max = 255))]
    pub email: Option<String>,
}

/// パスワード変更リクエスト。現在のパスワードで本人確認してから変更する。
#[derive(Validate, Debug, Deserialize, utoipa::ToSchema)]
pub struct ChangePasswordRequest {
    /// 現在のパスワード（本人確認用）
    #[schema(value_type = String, format = "password")]
    #[validate(length(min = 8, max = 128))]
    pub current_password: String,
    /// 新しいパスワード
    #[schema(value_type = String, format = "password")]
    #[validate(length(min = 8, max = 128))]
    pub new_password: String,
}
