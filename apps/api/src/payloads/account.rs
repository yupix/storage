use validator::Validate;
use serde::Deserialize;

#[derive(Validate, Debug, Deserialize, utoipa::ToSchema)]
pub struct DeleteRequest{
    #[schema(value_type = String, format="password")]
    #[validate(length(min = 8))]
    pub password : String
}