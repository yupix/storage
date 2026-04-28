use utoipa;

pub mod users;

#[utoipa::path(
    get, path = "/",
    operation_id = "index"
)]
pub async fn root() -> &'static str {
    "Hello, World!"
}

pub use users::create_user;
