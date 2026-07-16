use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::AppState;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::<AppState>::new()
        .routes(routes!(crate::handlers::share_links::create_share_link))
        .routes(routes!(crate::handlers::share_links::get_public_share))
        .routes(routes!(crate::handlers::share_links::view_public_share))
        .routes(routes!(crate::handlers::share_links::revoke_share_link))
}
