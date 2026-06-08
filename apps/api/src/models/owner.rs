use sea_orm::prelude::Uuid;
use serde::Serialize;
use utoipa::ToSchema;

use crate::entities::users;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct OwnerInfo {
    pub id: Uuid,
    pub username: String,
    pub avatar_url: Option<String>,
}

impl From<&users::Model> for OwnerInfo {
    fn from(user: &users::Model) -> Self {
        Self {
            id: user.id,
            username: user.username.clone(),
            avatar_url: user.avatar_url.clone(),
        }
    }
}
