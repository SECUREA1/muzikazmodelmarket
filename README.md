# muzikazmodelmarket

MUZIKAZ WORLD experience served by its persistent Node.js API and static frontend.

## Render deployment

Deploy this repository from the committed `render.yaml` blueprint. It runs the Node.js service that owns the admin, account, Loadout Pass, payment, wallet, and marketplace APIs; deploying only the static files or the legacy Rust binary leaves those operational routes unavailable.

Use these Render settings:

```txt
Service type: Web Service
Runtime: Node
Branch: main
Root Directory: leave blank
Build Command: npm ci && npm run build
Start Command: node server.mjs
Health Check Path: /api/health
```

The blueprint auto-deploys commits and mounts `/var/data`. All mutable JSON databases and uploaded avatars, assets, and environments are explicitly placed below `/var/data/muzikaz`, so an API restart or a new deployment does not reset the admin totals or generated Loadout Passes. Set `MUZIKAZ_ADMIN_USERNAME`, `MUZIKAZ_ADMIN_PASSWORD`, and `MUZIKAZ_ADMIN_SESSION_SECRET` to secret production values in Render; do not add their values to this file.

The Node service serves files from `dist/` when a static build exists and falls back to the checked-in site files during local development.

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

## MZK single-player entry

The original 3D House Explorer, Vibe Crib, and RAD-TOX launchers share one
**4,000 MZK** first-entry gate. Paying it provisions a permanent starter avatar,
land item, and Builder Loadout in the player Backpack; returning play is free.
Players without the required balance are sent to the $40 / 4,000 MZK purchase
flow and returned to the game they selected after funding their wallet.

## Land location data

### Canonical live wallet and deed memory

The Node service keeps wallet state, nested game memory, MZK ledger entries, market trades, and land deeds together in the server-side `MUZIKAZ_DATA_DIR/users.json` database. Access-code activation materializes the granted loadout, land and collectible entitlements in that same record without replacing an existing save, listing, upload reference, or world-memory field. After the first Ethereum connection binds a code to an address, code-only login restores a server session that resolves wallet, game, market and upload APIs to that validated address; users do not need to reconnect their wallet on every device. Writes are serialized and atomically renamed, memory updates are deep-merged, every MZK balance change is appended to the ledger, and deed claims debit MZK and assign the deed in one transaction. Browser `localStorage` is a display cache only and is not accepted as proof of land ownership; upload gates query the canonical deed index.

Production must mount persistent storage. `render.yaml` mounts `/var/data` and points `MUZIKAZ_DATA_DIR` at `/var/data/muzikaz`, allowing every browser connected to the live service to share the same durable state across deploys and process restarts. Do not deploy the transaction service with an ephemeral `data/` directory.

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

Older Render services may still start `./target/release/muzikazmodelmarket`. That executable now replaces itself with `node server.mjs` from the repository root, so member login, sessions, inventory, and trading use the same backend. Node must be installed in that service runtime. For Render services created manually, apply the Node runtime, build command, and start command shown above; editing the blueprint alone does not change a manually configured service.

Build and run the compatibility launcher locally (requires Rust to build and Node to run):

```bash
cargo build --release
PORT=4173 ./target/release/muzikazmodelmarket
```

## In-game camera views

The permanent **Starlight Grand Casino** destination includes animated dealers,
guests, five MZK casino games, refreshments, cashier, ATM, two guards and a locked
bank vault. Its characters have individual personalities, skills, remembered
conversations, service routines and AI-to-AI interactions. Meet staff for walking
favors that earn reputation and service badges. Enter it from the world directory or open
`model-explorer.html?environment=muzikaz-casino&autoplay=1&mode=multiplayer`.
See [casino controls and settlement](docs/casino.md).

Use **View** or **V** to switch between **First person** and **Top down** in all playable worlds, hockey and Neon Junction. The browser remembers the choice across map travel; changing it keeps the current player, match and server connection. Builder test maps inherit these controls. See [in-game views](docs/game-camera.md) for controls and ride/VR behavior.

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
- `POST /api/game/spend` — atomically debit gameplay MZK from the wallet bound to an authenticated account and active game session. Every idempotent request is appended to the per-wallet gameplay ledger and included in the admin data center.
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

## RAD-TOX Flash Igniter

The Flash Igniter replaces the Flamethrower in the tools and range armory.
Click or tap to produce a brief muzzle flash and ignite the first aimed surface
within 12 metres immediately. Hold the mouse trigger while pointer-locked,
**HOLD IGNITE** on touch devices, or either VR trigger for repeated ignition.
There are no travelling flame particles; a miss produces only the flash.
Room interiors and carried gear do not intercept the shot, but walls do.
Pink spray-can pickups replenish 24 units of both paint and igniter fuel;
resetting a round restores the 100-unit igniter tank.

Each physical flame connection burns for 10 seconds, fading during its final
second, and applies 1 HP per second of continuous contact. Separate connections
stack. Ground fire hurts the local player; direct hits attach fire to moving
characters, items, or environment surfaces. Bricks, loot blocks, enemies, and
bosses use their existing damage paths. Other surfaces track local health.
Burn effects and avatar damage follow the existing client-side gameplay model;
they are not authoritative multiplayer PvP or persistent land damage. Flame
settings live in `public/js/flamethrower.js` under `FLAME_CONFIG`.


## Persistent sessions, library and hosted deeds

Account sessions persist until explicit logout/revocation. The HttpOnly account cookie is renewed with a browser-compatible 400-day lifetime, with a persistent bearer fallback for cross-origin pages. Short-lived game sessions still expire normally. Previously expired or revoked credentials are never restored. Logout revokes the server session and clears browser credentials.

`GET/POST /api/custom-items` stores signed-in custom library items in the same server inventory used by Backpack and member marketplace sales. PNG drawings are decorative shared-room items; GLB customization requires an owned model. Previews do not grant ownership or gameplay upgrades. Existing browser-only drafts are not imported as paid assets.

`POST /api/land/reveal` accepts an owned Backpack `itemId`, reveals a land entitlement once, and returns a permanent `spaceId` and `playUrl`. Existing deeds return the same destination. Each entitlement receives a unique room even when members have identical land labels. Deed sales transfer ownership while preserving the room and its saved contents. The original account is never granted the sold entitlement again on login.

## Server backup and recovery

The server snapshots its data and configured upload directories at startup and every six hours. Three snapshots are retained in `MUZIKAZ_BACKUP_DIR` (default: the private `backups` directory under `MUZIKAZ_DATA_DIR`). Backups use private file permissions, SHA-256 manifests, JSON validation and atomic snapshot completion. The shared-room queue is flushed before capture. Files are captured individually; snapshots are not a transaction across all stores while the server is active. An authenticated administrator can inspect `GET /api/admin/backups` or request `POST /api/admin/backups`; neither endpoint exposes backup contents. Incomplete captures do not replace valid snapshots. Capture errors are logged and reported in the admin status, including the 256 MB snapshot limit.

The default snapshots share the Render persistent disk. They protect against application mistakes but **are not offsite disaster recovery**. Configure an independently backed-up mounted destination using `MUZIKAZ_BACKUP_DIR` for protection against disk loss. No external backup service is provisioned by this change.

For recovery, stop the server and restore into an empty directory:

```sh
node scripts/restore-server-backup.mjs /path/to/snapshot /path/to/empty-restore
```

The restore command verifies every checksum before writing. The `data/` subtree contains the original data directory; separately configured files and upload roots use the labels recorded in `manifest.json`. Review these paths and configure the stopped server to use the restored files before restarting. Do not restore revoked account sessions to an older state without revoking them again.


## Collection purchases and Ethereum member access

Originals/Ape, Legends/Cyber Wolf, Beasts/Red Beast, Crew/Crew Penguin and Chaos/Chaos Ape resolve to the server catalog for checkout. Each purchased copy has its own inventory ID, can be equipped as an avatar or placed in a shared room, and can be listed and transferred through the member marketplace. Backpack and account inventory provide game actions; land deeds keep their stable hosted destinations.

MZK checkout debits the server balance and delivers once per request. Crypto marketplace checkout requires a member session, prices the cart on the server, and delivers only after independent payment verification. Repeated verification and subsequent login do not reissue traded assets. Browser-only receipts are not proof of ownership. Existing verified member orders are reconciled when Backpack loads. A server worker retries pending marketplace confirmations every 30 seconds, including after the buyer closes the page. Physical fulfillment remains separate from the included digital model.

Members and Bottle login accept an Ethereum address through the wallet sign-in controls. `/api/access/wallet/challenge` issues a five-minute, single-use signing message bound to the server domain and login/linking purpose. `/api/access/wallet` verifies the signature before opening the persistent member session. Linking a wallet to an existing signed-in account additionally binds the proof to that account and preserves its Backpack, deeds, MZK and transaction history. An address alone cannot authenticate or link a wallet.

Member identities and inventory are durable server records, not on-chain storage. Account sessions have no server expiry and remain revocable through logout. Browsers can clear credentials; signing again with the same linked Ethereum wallet reopens the same account. No private keys or seed phrases are collected.


## Portable gameplay files and shared market catalog

Backpack, the custom library, member inventory, Builder Backpack and owned-map listings offer gameplay JSON downloads. `/api/backpack/items/:id/export` requires current ownership and exports item configuration, model file URLs, and, for maps or deeds, the scene, saved building transforms/paint, placed-entity references and stable room ID. It excludes live player/session telemetry. Drawn custom items retain their embedded artwork; GLB binaries remain available through the included asset URLs rather than being embedded in JSON.

`POST /api/backpack/import` reopens the canonical live server record for its current owner, including the buyer after a marketplace transfer. It does not duplicate inventory or apply ownership claims or edited settings from a downloaded file. Both direct API envelopes and files saved by the UI are accepted. Another signed-in player can open a public map/deed package to visit its live room without receiving ownership; private inventory files still require ownership. These packages support reuse and sharing of asset references; the server snapshots remain the recovery mechanism for deleted server data.

Game Market and Builder Market use the same public `/api/market/catalog` to list member sales, custom items, deeds, builder listings, upgrades, care supplies, initial land purchases and repository models. Category/search controls lead to each existing authoritative purchasing flow. Private inventory is not published automatically.

The shared header stays one row, switches to labeled icons when width is constrained, and places navigation in the hamburger menu on narrow screens. Wordmark Print remains in the product catalog/designer and appears in the retail grid only when it shares a row with another product.
