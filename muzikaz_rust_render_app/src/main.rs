use axum::{routing::get, Json, Router};
use serde::Serialize;
use std::{env, net::SocketAddr};
use tower_http::{cors::CorsLayer, services::ServeDir};

#[derive(Serialize)]
struct Status {
    app: &'static str,
    status: &'static str,
    message: &'static str,
}

async fn health() -> Json<Status> {
    Json(Status {
        app: "MUZIKAZ Rust Store",
        status: "online",
        message: "Rust backend is running on Render.",
    })
}

#[tokio::main]
async fn main() {
    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "10000".to_string())
        .parse()
        .expect("PORT must be a number");

    let app = Router::new()
        .route("/api/health", get(health))
        .nest_service("/", ServeDir::new("static").append_index_html_on_directories(true))
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("MUZIKAZ running at http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
