use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::AppState;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::<AppState>::new()
        .routes(routes!(crate::handlers::folders::list_folders))
        .routes(routes!(crate::handlers::folders::create_folder))
        .routes(routes!(crate::handlers::folders::get_folder))
        .routes(routes!(crate::handlers::folders::update_folder))
        .routes(routes!(crate::handlers::folders::delete_folder))
        .routes(routes!(crate::handlers::folders::get_trash_folders))
        .routes(routes!(crate::handlers::folders::empty_trash_folders))
        .routes(routes!(crate::handlers::folders::restore_folder))
        .routes(routes!(crate::handlers::folders::purge_folder))
}
