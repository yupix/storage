use utoipa_axum::router::OpenApiRouter;

use crate::AppState;

pub mod auth;
pub mod files;
pub fn create_routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().nest(
        "/v1",
        OpenApiRouter::new()
        .nest("/auth", crate::routes::auth::routes())
        .nest("/files", crate::routes::files::routes()),
    )
}
