use axum::routing::get;
use utoipa_axum::router::OpenApiRouter;

use crate::AppState;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().route("/jobs/stats", get(crate::handlers::jobs::get_jobs_stats))
}
