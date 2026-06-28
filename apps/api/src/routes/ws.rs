use axum::routing::get;
use utoipa_axum::router::OpenApiRouter;

use crate::AppState;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().route(
        "/watchword",
        get(crate::handlers::watchword_ws::watchword_ws_upgrade),
    )
}
