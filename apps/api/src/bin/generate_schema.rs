use api::{AppState, openapi, routes};
use utoipa_axum::router::OpenApiRouter;

fn main() {
    let (_, mut spec) = OpenApiRouter::<AppState>::new()
        .merge(routes::create_routes())
        .split_for_parts();

    openapi::register_schemas(&mut spec);

    println!("{}", serde_json::to_string_pretty(&spec).expect("failed to serialize OpenAPI spec"));
}
