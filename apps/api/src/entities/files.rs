use sea_orm::entity::prelude::*;
use sea_orm::ActiveModelBehavior;
use serde::Serialize;
use utoipa::ToSchema;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, ToSchema)]
#[sea_orm(table_name = "files")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: uuid::Uuid,
    
    pub filename: String,
    pub file_type: String,
    pub filesize: i64,
    pub filehash: String,
    pub url: String,
    
    pub folder_id: Option<uuid::Uuid>,
    pub author_id: uuid::Uuid,

    #[schema(value_type = String, format = DateTime)]
    pub created_at: DateTimeWithTimeZone,
    
    #[schema(value_type = String, format = DateTime)]
    pub updated_at: DateTimeWithTimeZone,
}


impl ActiveModelBehavior for ActiveModel {}



