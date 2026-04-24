use axum::{
    routing::{get, post},
    http::StatusCode,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use utoipa_axum::routes;
use utoipa_scalar::{Scalar, Servable};

#[utoipa::path(
    get, path = "/",
    operation_id = "index"
)]
pub async fn root() -> &'static str {
    "Hello, World!"
}

async fn create_user(
    // this argument tells axum to parse the request body
    // as JSON into a `CreateUser` type
    Json(payload): Json<CreateUser>,
) -> (StatusCode, Json<User>) {
    let user = User {
        id: 1337,
        username: payload.username,
    };

    // JSONレスポンスに変換する。`
    (StatusCode::CREATED, Json(user))
}


#[tokio::main]
async fn main() {
    // トレーサーの初期化
    tracing_subscriber::fmt::init();

    // ルートを構築する
    let (mut router, openapi) = utoipa_axum::router::OpenApiRouter::new()
        .routes(routes!(root))
        .route("/users", post(create_user))
        .split_for_parts();

    router = router.merge(
        Scalar::with_url(
            "/scalar",
            openapi.clone()
        )
    );

    println!("{}", openapi.to_json().unwrap());

    // hyperを用いてアプリを3000ポートで実行する
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Listening on http://0.0.0.0:3000");
    axum::serve(listener, router).await;
}


// the input to our `create_user` handler
#[derive(Deserialize)]
struct CreateUser {
    username: String,
}

// the output to our `create_user` handler
#[derive(Serialize)]
struct User {
    id: u64,
    username: String,
}