mod config;
mod error;
mod handlers;
mod middleware;
mod models;
mod utils;

use axum::routing::{get, post};
use axum::extract::State;
use utoipa_scalar::{Scalar, Servable};
use sea_orm::DbConn;

use config::Config;
use crate::handlers::{create_user, root};

#[derive(Clone)]
pub struct AppState {
    pub db: DbConn,
}

#[tokio::main]
async fn main() {
    // トレーサーの初期化
    tracing_subscriber::fmt::init();

    let config = Config::default();
    
    // データベース接続を初期化
    let db = config.init_db().await.expect("Failed to initialize database");
    let app_state = AppState { db };

    // ルートを構築する
    let (mut router, openapi) = utoipa_axum::router::OpenApiRouter::new()
        .route("/", get(root))
        .route("/users", get(handlers::users::list_users))
        .route("/users", post(create_user))
        .with_state(app_state)
        .split_for_parts();

    router = router.merge(
        Scalar::with_url(
            "/scalar",
            openapi.clone()
        )
    );

    println!("{}", openapi.to_json().unwrap());

    // hyperを用いてアプリをポートで実行する
    let listener = tokio::net::TcpListener::bind(&config.addr()).await.unwrap();
    println!("Listening on http://{}", config.addr());
    axum::serve(listener, router).await.unwrap();
}