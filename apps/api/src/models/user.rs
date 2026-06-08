use sea_orm::prelude::{DateTimeWithTimeZone, Uuid};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::entities::users;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: u64,
    pub username: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUser {
    pub username: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct UserResponse {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub avatar_url: Option<String>,
    pub is_suspended: bool,
    pub freeze_reason: Option<String>,
    #[schema(value_type = Option<String>, format = DateTime)]
    pub deleted_at: Option<DateTimeWithTimeZone>,
    #[schema(value_type = String, format = DateTime)]
    pub created_at: DateTimeWithTimeZone,
    #[schema(value_type = String, format = DateTime)]
    pub updated_at: DateTimeWithTimeZone,
}

impl From<users::Model> for UserResponse {
    fn from(m: users::Model) -> Self {
        Self {
            id: m.id,
            username: m.username,
            email: m.email,
            avatar_url: m.avatar_url,
            is_suspended: m.is_suspended,
            freeze_reason: m.freeze_reason,
            deleted_at: m.deleted_at,
            created_at: m.created_at,
            updated_at: m.updated_at,
        }
    }
}
