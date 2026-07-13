use serde::Deserialize;
use validator::Validate;

#[derive(Validate, Debug, Deserialize, utoipa::ToSchema)]
pub struct LoginRequest {
    /// ユーザー名またはメールアドレス（どちらでもログインできる）
    #[schema(value_type = String)]
    #[validate(length(min = 1))]
    pub email: String,
    #[schema(value_type = String, format="password")]
    #[validate(length(min = 8))]
    pub password: String,
}

#[derive(Validate, Debug, Deserialize, utoipa::ToSchema)]
pub struct RegisterRequest {
    #[schema(value_type = String, format="username")]
    #[validate(length(min = 3))]
    pub username: String,
    #[schema(value_type = String, format="email")]
    #[validate(email)]
    pub email: String,
    #[schema(value_type = String, format="password")]
    #[validate(length(min = 8))]
    pub password: String,
}
