use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::AppState;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::<AppState>::new()
        .routes(routes!(crate::handlers::files::upload_file))
        .routes(routes!(crate::handlers::files::get_files))
        .routes(routes!(crate::handlers::files::get_trash))
        .routes(routes!(crate::handlers::files::empty_trash))
        .routes(routes!(crate::handlers::files::restore_file))
        .routes(routes!(crate::handlers::files::get_file))
        .routes(routes!(crate::handlers::files::update_file))
        .routes(routes!(crate::handlers::files::delete_file))
}
