use axum::extract::DefaultBodyLimit;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::AppState;

/// アップロードの上限: 1 GiB
const UPLOAD_LIMIT: usize = 1024 * 1024 * 1024;

pub fn routes() -> OpenApiRouter<AppState> {
    let upload = OpenApiRouter::new()
        .routes(routes!(crate::handlers::files::upload_file))
        .layer(DefaultBodyLimit::max(UPLOAD_LIMIT));

    OpenApiRouter::<AppState>::new()
        .merge(upload)
        .routes(routes!(crate::handlers::files::get_files))
        .routes(routes!(crate::handlers::files::get_trash))
        .routes(routes!(crate::handlers::files::empty_trash))
        .routes(routes!(crate::handlers::files::restore_file))
        .routes(routes!(crate::handlers::files::purge_file))
        .routes(routes!(crate::handlers::files::get_file))
        .routes(routes!(crate::handlers::files::view_file))
        .routes(routes!(crate::handlers::files::update_file))
        .routes(routes!(crate::handlers::files::delete_file))
}
