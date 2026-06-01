use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::AppState;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::<AppState>::new()
        .routes(routes!(crate::handlers::folders::list_folders))
        .routes(routes!(crate::handlers::folders::create_folder))
        .routes(routes!(crate::handlers::folders::get_folder))
}
