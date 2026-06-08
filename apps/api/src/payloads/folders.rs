use sea_orm::prelude::Uuid;
use serde::Deserialize;
use validator::Validate;

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct ListFoldersQuery {
    pub folder_id: Option<Uuid>,
    pub page: Option<u64>,
    pub limit: Option<u64>,
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct DeleteFolderQuery {
    pub to_home: Option<bool>,
}

#[derive(Validate, Debug, Deserialize, utoipa::ToSchema)]
pub struct CreateFolderRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    pub folder_id: Option<Uuid>,
}

#[derive(Validate, Debug, Deserialize, utoipa::ToSchema)]
pub struct UpdateFolderRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub folder_id: Option<Option<Uuid>>,
}

pub fn deserialize_optional_field<'de, D>(
    deserializer: D,
) -> Result<Option<Option<Uuid>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<Uuid>::deserialize(deserializer).map(Some)
}