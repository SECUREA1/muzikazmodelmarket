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

## VR headset play

The RAD-TOX House Explorer supports WebXR immersive VR in browsers that expose
`immersive-vr`, including Meta Quest/Oculus Browser. Serve the site over HTTPS
(or localhost while developing), select **BEGIN NOW!**, and then use the
in-game **ENTER VR** button. In a headset, use the left thumbstick to walk and strafe, and the
right thumbstick to snap-turn. Aim with either controller and press either
trigger to use the selected RAD-TOX tool (Laser, Paint Gun, or Bat). Squeeze
the left grip to switch tools; squeeze the right grip while aiming at a
walkable floor to teleport. The WebXR control is intentionally omitted
when a browser or device does not support immersive VR, while the normal 3D and
compatibility modes remain available.

## Server-backed live model publishing

The Rust service serves the static MUZIKAZ site, `/uploads/*` model and avatar image assets, and JSON API routes for the public live model space plus the shared 3D House Explorer. Model metadata is persisted in `MUZIKAZ_DATA_DIR/published-models.json`; house avatar placements are persisted in `MUZIKAZ_DATA_DIR/house-avatars.json` so both survive process restarts when Render persistent disk is mounted. The storage layer is isolated in `src/main.rs` and can be swapped for PostgreSQL/S3 later; `migrations/001_published_models.sql` documents the production PostgreSQL table and indexes for a future `DATABASE_URL` repository.

### API routes

All JSON responses use `{ "success": boolean, "data": ..., "message": string }`.

- `GET /api/health` — service, storage, and model-count health.
- `GET /api/models` — published public models, newest first.
- `GET /api/models/:id` — one published model.
- `POST /api/models/upload` — multipart upload. Fields: `model` (`.glb`/`.gltf`, required), `iosModel` (`.usdz`, optional), `thumbnail` (`.png`/`.jpg`/`.jpeg`/`.webp`, optional).
- `POST /api/models` — publish metadata for previously uploaded files.
- `PATCH /api/models/:id` — update existing metadata.
- `DELETE /api/models/:id` — admin-only deletion with `x-admin-token`; requires `ADMIN_PUBLISH_TOKEN`.
- `POST /api/uploads/avatar` — multipart upload for shared house avatar images. Field: `avatar` (`.png`/`.jpg`/`.jpeg`/`.webp`, max 3 MB).
- `GET /api/houses/:houseId/avatars` — load public shared avatar placements for a house.
- `POST /api/houses/:houseId/avatars` — publish an uploaded or bundled image avatar into the 3D House Explorer.
- `DELETE /api/houses/:houseId/avatars/:id` — remove a shared avatar owned by the current `X-MUZIKAZ-Session`.
- `POST /api/houses/:houseId/presence` and `GET /api/houses/:houseId/events` — keep the house available with presence and event-stream hooks for live clients.

### Required Render environment variables

- `PUBLIC_BASE_URL=https://muzikazmodelmarket.onrender.com`
- `MUZIKAZ_DATA_DIR=/var/data`
- `UPLOAD_STORAGE_PATH=/var/data/uploads/models`
- `MAX_MODEL_UPLOAD_MB=50`
- `ADMIN_PUBLISH_TOKEN` for protected deletion only.
- `DATABASE_URL` is reserved for the PostgreSQL repository described by `migrations/001_published_models.sql`.
- `ALLOWED_ORIGINS` is reserved for a future cross-origin deployment; current browser calls are same-origin.

### Render storage setup

Attach a Render persistent disk at `/var/data`. Uploaded `.glb`, `.gltf`, `.usdz`, thumbnail files, and shared avatar images are written below `/var/data/uploads/models` and served publicly from `/uploads/*`. Without a persistent disk (or future object storage), uploads on Render's ephemeral filesystem will not survive instance replacement.

### Database migration instructions

For a PostgreSQL-backed deployment, create a Render PostgreSQL database, set `DATABASE_URL`, and run the SQL in `migrations/001_published_models.sql` before enabling a PostgreSQL repository implementation. The current committed implementation uses durable JSON metadata on the Render disk.
