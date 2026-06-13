use sea_orm::prelude::Uuid;
use serde::Deserialize;
use validator::Validate;

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
pub struct ListFoldersQuery {
    pub folder_id: Option<Uuid>,
    pub page: Option<u64>,
    pub limit: Option<u64>,
    pub is_favorite: Option<bool>,
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
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
