use axum::routing::get;
use utoipa_axum::router::OpenApiRouter;

use crate::AppState;

pub mod auth;
pub mod files;
pub mod folders;
pub mod search;

pub fn create_routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().nest(
        "/v1",
        OpenApiRouter::new()
            .nest("/auth", crate::routes::auth::routes())
            .nest("/files", crate::routes::files::routes())
            .nest("/folders", crate::routes::folders::routes())
            .nest("/search", crate::routes::search::routes())
            .route(
                "/internal/download",
                get(crate::handlers::internal::download_file),
            ),
    )
}
