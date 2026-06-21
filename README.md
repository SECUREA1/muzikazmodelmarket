# muzikazmodelmarket

Static MUZIKAZ Model Market landing page served by a small Rust HTTP server.

## Render deployment

This repository is intentionally configured as a **Rust Web Service** on Render so it can stay on the Rust runtime for future backend work.

Use these Render settings:

```txt
Service type: Web Service
Runtime: Rust
Branch: main
Root Directory: leave blank
Build Command: cargo build --release
Start Command: ./target/release/muzikazmodelmarket
```

Do not use `npm start` or `cargo run --release` as the Render start command. Render should start the compiled release binary directly.

The Rust server serves files from `dist/` when a static build exists. If `dist/index.html` is not present, it serves the checked-in site files from the repository root, which keeps the Render Rust deployment independent of Node.

## Local checks

Build the static copy used for verification:

```bash
npm run build
npm run check
```

Build and run the Rust server locally:

```bash
cargo build --release
PORT=4173 ./target/release/muzikazmodelmarket
```
