use sea_orm::entity::prelude::*;
use chrono::{FixedOffset};
use serde::Serialize;
use utoipa::ToSchema;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "users")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: uuid::Uuid,
    pub username: String,
    pub email: String,
    pub avatar_url: Option<String>,
    pub is_suspended: bool,
    #[schema(value_type = String, format = DateTime)]
    pub created_at: DateTimeWithTimeZone,
    #[schema(value_type = String, format = DateTime)]
    pub updated_at: DateTimeWithTimeZone,
    #[schema(value_type = String, format = DateTime)]
    pub deleted_at: Option<chrono::DateTime<FixedOffset>>,
    #[schema(ignore)]
    #[serde(skip_serializing)]
    pub password_hash: String,
}

impl ActiveModelBehavior for ActiveModel {}
