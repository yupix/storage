use utoipa_axum::router::OpenApiRouter;

use crate::{AppState, routes::auth::routes};


pub mod auth;
pub mod account;

pub fn create_routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().nest(
        "/v1",
        OpenApiRouter::new().nest("/auth", crate::routes::auth::routes())
        .nest("/account", crate::routes::account::routes()),
    )
}
