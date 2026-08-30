# muzikazmodelmarket

Static MUZIKAZ WORLD experience served by a small Rust HTTP server.

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
Health Check Path: /api/health
```

Do not use `npm start` or `cargo run --release` as the Render start command. Render should start the compiled release binary directly.

The Rust server serves files from `dist/` when a static build exists. If `dist/index.html` is not present, it serves the checked-in site files from the repository root, which keeps the Render Rust deployment independent of Node.

## Local checks

Build the static copy used for verification:

```bash
npm run build
npm run check
```

## Ethereum Bottle member gate

`members.html` stays locked until an injected EIP-1193 wallet proves ownership
against the configured MUZIKAZ Bottle ERC-721/ERC-1155 contract. Set the
`muzikaz-bottle-contract` and `muzikaz-bottle-chain-id` meta values in
`members.html` for deployment, or inject `window.MUZIKAZ_BOTTLE_CONTRACT_ADDRESS`
and `window.MUZIKAZ_BOTTLE_CHAIN_ID` before `script.js` loads. The chain ID must
use hexadecimal EIP-1193 form (for example, `0x1` for Ethereum mainnet).
Additional access-token contracts can be approved with repeated
`muzikaz-bottle-approved-contract` meta tags or a comma-separated
`window.MUZIKAZ_BOTTLE_APPROVED_CONTRACTS` value. Ownership of a token from any
approved contract unlocks the Bottle member area; minting continues to use the
primary `muzikaz-bottle-contract` address.

The default mint transaction calls `mint()` (`0x1249c58b`). Contracts with a
different public mint signature must inject the complete encoded calldata as
`window.MUZIKAZ_BOTTLE_MINT_DATA`. For a payable mint, also inject the price in
hexadecimal wei as `window.MUZIKAZ_BOTTLE_MINT_VALUE`. Access is granted only
after the receipt confirms and a fresh `balanceOf(address)` call returns at
least one Bottle token.

## Land location data

The calculated world-atlas inventory is committed as
`data/land-worlds.json`. It records eight fixed system pins, five public-area
plots, seven route connections, and an empty list for owner-created wild-land
claims. Each public-area plot record documents its owner (or an explicit
unclaimed `null` owner), and the calculated totals report both how many plots
exist and how many are owned. A claim is a plot/deed **within** that public area
and includes one free community spot; it is not a separate parcel of deeded
land. Wild land has no fixed global limit; each eligible owner can pin one
claim. Generate the equivalent, intentionally untracked
`data/land-worlds.sqlite` database and validate it with:

```bash
npm run build:land-data
npm run check:land-data
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
trigger to use the selected RAD-TOX tool (Laser, Paint Gun, Bat, Taser, or the illuminated Toxins Thrower). The Toxins Thrower launches close-range green goo and spends 5 MZK per burst. Squeeze
the left grip to switch tools; squeeze the right grip while aiming at a
walkable floor to teleport. The WebXR control is intentionally omitted
when a browser or device does not support immersive VR, while the normal 3D
game remains available.

## Server-backed live model publishing

The Rust service serves the static MUZIKAZ site, `/uploads/*` model and avatar image assets, and JSON API routes for the public live model space plus the shared 3D House Explorer. Model metadata is persisted in `MUZIKAZ_DATA_DIR/published-models.json`; house avatar placements are persisted in `MUZIKAZ_DATA_DIR/house-avatars.json` so both survive process restarts when Render persistent disk is mounted. The storage layer is isolated in `src/main.rs` and can be swapped for PostgreSQL/S3 later; `migrations/001_published_models.sql` documents the production PostgreSQL table and indexes for a future `DATABASE_URL` repository.

### API routes

All JSON responses use `{ "success": boolean, "data": ..., "message": string }`.

- `GET /api/health` — service, storage, and model-count health.
- `GET /api/wallet/state` — load the requesting wallet's durable items, token balances, and application memory using `X-Wallet-Address`.
- `POST /api/loadout-codes/redeem` — atomically burn an admin-issued $30 Loadout pass and bind its creator-tool, land, and Violet Wish Bottle claim to one Ethereum wallet.
- `GET/POST /api/admin/loadout-codes` — list or generate hashed, expiring one-time Loadout passes; requires `x-admin-token`.
- `PUT /api/wallet/state` — atomically replace that wallet's `items`, `tokens`, and `memory` in `MUZIKAZ_DATA_DIR/users.json`.
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
- `POST /api/houses/:houseId/presence`, `POST /api/houses/:houseId/presence/leave`, and `GET /api/houses/:houseId/events` — maintain the live player roster and event-stream connection.
- `GET /api/houses/:houseId/chat` and `POST /api/houses/:houseId/chat` — load and send subscriber chat messages after joining the house presence roster.

### Render environment variables

- `PUBLIC_BASE_URL=https://muzikazmodelmarket.onrender.com`
- `MUZIKAZ_DATA_DIR=data` on the free instance, or `/var/data` after attaching a persistent disk.
- `UPLOAD_STORAGE_PATH=data/uploads/models` on the free instance, or `/var/data/uploads/models` with the disk.
- `MAX_MODEL_UPLOAD_MB=50`
- `ADMIN_PUBLISH_TOKEN` for protected deletion only.
- `DATABASE_URL` is reserved for the PostgreSQL repository described by `migrations/001_published_models.sql`.
- `ALLOWED_ORIGINS` is reserved for a future cross-origin deployment; current browser calls are same-origin.

The service does not require `DATABASE_URL` or `ALLOWED_ORIGINS` to start. `PORT` is supplied by Render automatically. Set the service health-check path to `/api/health`; `/health` and `/healthz` are also supported for external monitors. A successful health response reports whether the public base URL, durable-storage setting, and admin authorization are configured without exposing their values.

### Render storage setup

Free Render web services cannot attach a persistent disk. With the committed free-service defaults, uploaded `.glb`, `.gltf`, `.usdz`, thumbnail files, and shared avatar images are written below `data/uploads/models` and served publicly from `/uploads/*`, but they will not survive an instance replacement or redeploy. To make uploads durable, upgrade the instance, attach a disk at `/var/data`, and change the two storage variables to the `/var/data` values above (or implement object storage). Do not set `/var/data` on the free instance without a mounted disk.

Wallet records use the same storage rule: configure `MUZIKAZ_DATA_DIR=/var/data` on a mounted persistent disk to retain `users.json` across deploys and instance replacements. Writes are serialized in-process and use an atomic temporary-file rename so concurrent requests cannot leave a partially written database.

### Database migration instructions

For a PostgreSQL-backed deployment, create a Render PostgreSQL database, set `DATABASE_URL`, and run the SQL in `migrations/001_published_models.sql` before enabling a PostgreSQL repository implementation. The current committed implementation uses durable JSON metadata on the Render disk.
