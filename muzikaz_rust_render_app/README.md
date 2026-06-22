# MUZIKAZ Rust Render Store

A complete Rust + Axum static ecommerce-style app for Render.

## Run locally
```bash
cargo run
```
Open http://localhost:10000

## Deploy on Render
1. Upload this folder to GitHub.
2. Create a new Render Web Service.
3. Use:
   - Build Command: `cargo build --release`
   - Start Command: `./target/release/muzikaz_store`
4. Render will detect `render.yaml` automatically if deploying from GitHub.

## Interchangeable Graphics
Replace images in:
```text
static/assets/
```
Then update product/character data inside:
```text
static/app.js
```
