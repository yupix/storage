use axum::routing::get;
use utoipa_axum::router::OpenApiRouter;

use crate::AppState;

pub mod auth;
pub mod config;
pub mod files;
pub mod folders;
pub mod search;
pub mod users;
pub mod ws;

pub fn create_routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().nest(
        "/v1",
        OpenApiRouter::new()
            .nest("/auth", crate::routes::auth::routes())
            .nest("/config", crate::routes::config::routes())
            .nest("/files", crate::routes::files::routes())
            .nest("/folders", crate::routes::folders::routes())
            .nest("/users", crate::routes::users::routes())
            .nest("/ws", crate::routes::ws::routes())
            .merge(crate::routes::search::routes())
            .route(
                "/internal/download",
                get(crate::handlers::internal::download_file),
            ),
    )
}
