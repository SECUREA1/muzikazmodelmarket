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
Build Command: ONNXRUNTIME_NODE_INSTALL=skip npm ci && npm run build
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

## Residents and local favors

The permanent **Midnight Laughs Funhouse** adds a 120-metre scary clown carnival,
a horror house and mirror maze, clown car, dizzy spinner, propeller hats,
oversized shoes, surprise box, ball pit and water-gun gallery. Open it from
Explorer options or the world directory. Its Game Market and Builder Market
listing includes an editable template and 28 individual props, attractions,
costumes, tools and playable clown characters with canonical MZK purchases and
Backpack delivery. First-person play includes aimed water shots and ball tosses,
seated car and spinner timing games, a catch challenge and a checkpoint maze;
WebXR controllers use physical targets and floating action controls. See
[funhouse controls and market items](docs/clown-funhouse.md).

The optional Lost Laugh Trail adds six discoveries across the detailed midway
and haunted house, with story hints, theatrical surprises and a timed score.
Compact controls keep the scenery visible, and seated rides retain free look
with calibrated headset height and safe standing-view restoration.
Original clown voices, captioned jokes, attraction sound effects and the
**Midnight Motor Waltz** car soundtrack add carnival audio, with separate
voice, music and effects controls in first person and VR.

The house also hosts **Night Watch**, a three-minute haunted-lantern challenge
with four ordered seals, shadow and clown reveals, a completion score and a
time bonus. Physical lantern controls and compact hints work in first person
and VR; reduced motion and the existing audio settings apply to the scares.

Neon Harbor includes Angler fishing boats, side casting, freshwater and coastal
fishing grounds, tackle in the existing tools and markets, saved catches, MZK
sales and shared fishing tournaments with AI rivals. See [fishing controls,
equipment and competitions](docs/fishing.md).

Contextual residents now work throughout the walkable world, including published
Builder maps and restored saves. They have local roles, appearances, needs,
practice routines, memories and relationships. Conversations remember interests
across maps, and local favors earn saved reputation, skills and badges. Arcade,
hockey and solo play include a **People & favors** link to their shared map
walkthrough. See [residents and saved progress](docs/world-residents.md).

The permanent **Starlight Grand Casino** destination includes seven MZK games,
an Aurelia high-limit baccarat salon, Royal three-card poker room, furnished
guest lounges, a working staff service room, refreshments, cashier, ATM,
two guards and a locked bank vault. Characters have individual personalities,
skills, remembered conversations, rotating dealer duties, restocking and break
routines, and AI-to-AI interactions. Meet staff for walking
favors that earn reputation and service badges. Enter it from the world directory or open
`model-explorer.html?environment=muzikaz-casino&autoplay=1&mode=multiplayer`.
See [casino controls and settlement](docs/casino.md).

The airport includes **Alpine Ridge Mountain Airfield** in an expanded 2 km world.
Board a public aircraft, open the local map and choose **Fly to** Alpine Ridge to
take off, land on the paved runway and park at the mountain apron. Exit once
stopped to explore the lodge, ranger station, supply hut, campground, lake and
lantern trails. Accept the Alpine Ridge supply flight or camper evacuation in
**Quests**; the campground and ranger boards offer separate walking collection
quests. These activities award room score. See [mountain fly-in](docs/mountain-fly-in.md).

Every explorer map offers local discovery routes and timed checkpoint challenges
through the **Quests** popup. Facility jobs require using the actual marked
objects; fitness and casino work contracts count newly completed sets and staff
favors. Shared quests award room score once and record completion counts and best
times. Solo routes award local practice score. Hockey and arcade offer their own
challenges based on live match progress, completed rounds and full ride laps.
**Crew Dispatch** also carries recurring AI job calls on every explorer map.
Its **World radio calls** board lists public multiplayer jobs and player help
requests across destinations. Choose **Travel to call**, then accept the job or
**Join & help** once you arrive and have the required vehicle. Accepting and
joining remain explicit; finish or cancel a current assignment before responding.
Quest leaders can use **Call for help** to open their team and broadcast a
90-second request, with a 30-second interval between calls. Full teams, expired
calls and disconnected players disappear from the board; private and solo maps
never broadcast there. Shared helpers earn score through participation.

Quest cards leave movement available; explicit opening or closing clears held
controls. WASD resumes movement directly from a quest selector; arrows and Enter
still select challenges, and conversation fields keep their typing controls.
Routine toolbar updates preserve open conversation focus. Map travel ends an
active walking route.

Airport arrivals start clear of terminal scenery. Local map loading checks the
player body against actual wall faces and repairs obstructed saved entry points
on nearby floor; shared rooms also recover fully trapped returning players.
Hockey and arcade accept fresh movement keys after toolbar and menu use, without
requiring another click on the canvas. Fresh ordered controls also resume the
current player after a slow load or suspended tab outlasts the presence window;
old requests cannot restart movement or revive a previous destination. Current
keyboard and stick input stays responsive during snapshot gaps in walking,
arcade, hockey and vehicles. Local collision checks remain active; large walking
corrections converge gradually after reconnecting. Range operations open only
when requested, so arriving at either training range leaves movement available.
Gameplay avatar refreshes resolve models directly without rebuilding the world
directory or processing purchases on the movement request path.

Dense GLB houses keep local walking collision in solo and shared play. A bounded
triangle hierarchy retains every physical surface without the overlapping octree
subdivision that could stall startup; delayed snapshots no longer leave those
maps dependent on server replies for each visible step. Focused People links
also pass movement keys through. RAD-TOX resets reactivate solo play, and defeated
players can respawn or return to exploration without a stale defeat dialog
continuing to block controls. Late inventory refreshes preserve an open world
picker instead of replacing its map controls with Backpack content.

Run the movement checks against a fresh build (the Node server serves `dist/`
when present):

```bash
npm run build && npm run check
npm run check:environments
node --test test/spawn-clearance.test.mjs test/movement-presence-recovery.test.mjs test/world-traversal-matrix.test.mjs
python3 test/all-world-input.browser.py --mode multiplayer
python3 test/all-world-input.browser.py --mode solo
python3 test/game-toolbar-movement.browser.py
python3 test/glb-free-movement.browser.py
```

The public-world browser matrix tests untouched startup, rendered touch and
keyboard displacement, map use, and sustained input. It discovers maps from the
live directory and writes a JSON result for each map; it never dismisses startup
dialogs to make movement pass.

Facility menus release held walking and machine controls when opened or closed.
Changing maps or machines also clears obsolete button locks and ignores replies
from the previous site. Factory and gym panels close before a replacement player
joins; ski menus share movement while keeping text and selection keys local.

The top toolbar’s SVG **Quests** button opens local objectives and AI contacts.
Ask a contact a question or request a live demonstration: construction operators
use the real hydraulics and finite site materials, and factory specialists run
timed fabrication, assembly and inspection cycles. Local helpers can walk to and
use nearby doors, switches, signs and recovery points. Their status is shared by
the server; players keep priority over equipment and can stop their own requests.
Demonstrations do not spend MZK or grant player items or quest completion.

## Fitness Centre

The permanent **MUZIKAZ Fitness Centre** includes a championship boxing ring,
three-round AI sparring, basketball shootouts, table-tennis rallies and hurdle
races alongside the seven original skill stations. Eighteen AI characters include
two trainers, nine selectable rivals and a referee. Qualifying sessions earn
server-validated MZK in the existing wallet, with the same daily reward cap.
Enter from **Fitness** or open
`model-explorer.html?environment=muzikaz-fitness-centre&house=muzikaz-fitness-centre&mode=multiplayer&autoplay=1`.
See [gym controls and rewards](docs/fitness-centre.md). The map entry is gold.
Builder includes the expanded **Gold Fitness Centre** template with 65 editable
assemblies; all 31 gym item types are available in **ITEMS → Fitness & gym** and
**Marketplace → All game items → Fitness & gym upgrades**.

## Ironwood Prison

The permanent **Ironwood Prison** is a large walkable secure facility with two
cell blocks, a cafeteria and kitchen, recreation room, exercise yard, guard
control and work areas. Meals, lockable cells, guards and prisoners, non-lethal
fights, theft, entertainment and escape challenges connect through the prison
activities menu. Enter from the world menu’s **Prison & escape** category or open
`model-explorer.html?environment=ironwood-prison&house=ironwood-prison&mode=multiplayer&autoplay=1`.
See [prison controls and challenges](docs/prison-world.md). Six role-specific daily contracts add saved ranks and token rewards. Four supply packets stock a portable prison pouch, and milestone rewards can be collected into the account Backpack and placed in other worlds. Versioned room messages and durable earned-item receipts protect purchases, ownership and reconnects.

## Map travel and vehicle loading

The permanent **MUZIKAZ Missile & Rocket Factory** shares the existing server,
MZK wallet, Backpack, resident AI and construction vehicles. Buy a parts kit,
operate fabrication/assembly/test cells, haul the finished model by dump truck,
and collect a detailed training missile or cargo rocket. Production and factory
skills survive travel and restarts. Enter from the **Factory** world category.
All nine factory item types are available in Marketplace and Builder's
**Factory & engineering** category. The editable factory template keeps station
roles, crew, vehicle jobs and local maps connected after moving or removing items.
See [factory controls and production](docs/missile-factory.md).

The factory's east gate now connects to **Atlas Proving Grounds**, where players
can set up, deploy and launch their owned training missiles and cargo rockets
with shared animations and SVG telemetry.
Three walkable control bays add headset dashboards for preparation, launch
supervision and live telemetry, with controller-ray buttons and shared test state.
Passing both test profiles unlocks
the **Mountain Nuclear Research Compound**; its symbolic containment puzzle opens the deeper
bunker. Seven reusable testing assets and two editable templates are available
in markets and Map Builder. See [testing and compound access](docs/factory-proving-grounds.md).

The connected [factory supply chain](docs/factory-supply-chain.md) adds transferable
test certificates, MZK listings for finished production, sealed deliveries to
the range and compound, and an Atlas Export voyage from Jebel Ali to Fujairah.
Delivered shipping parts exchange for 20 MZK credits toward new production.
Export terminals, certification kiosks and freight crates are sold through the
same MZK markets and remain editable in Builder.

Public maps keep travel and vehicle selection available during connection
recovery. Selecting a vehicle immediately shows a nonblocking loading display,
waits for its model and exposes its controls. Map travel automatically releases
seats, lifts and the previous vehicle, cancels abandoned jobs without rewards,
and offers all public destinations. A short guide explains each map on entry, including return visits, after the first player gesture.
Only new jobs, objective changes and game interactions are then voiced.
Settings provides independent audio mutes and distance-based spatial sound. NPC and AI speech now uses local neural male/female voices across browsers; choose and preview them in Audio settings. The build prepares the speech model automatically, with no API key. See [map travel and spoken objectives](docs/open-map-travel.md).

## In-game camera views

Use **View** or **V** to switch between **First person** and **Top down** in all playable worlds, hockey and Neon Junction. The browser remembers the choice across map travel; changing it keeps the current player, match and server connection. Builder test maps inherit these controls. See [in-game views](docs/game-camera.md) for controls and ride/VR behavior.

Double-tap (or double-click) a clear ground spot to move directly there in either view, including hockey and the Neon Junction park. Held movement is released on arrival; dragging and control-button taps retain their usual actions.

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

Native map templates now include component quantities linked to purchasable items. Native item searches also match their functions and source maps. The editor, markets and placement runtimes share native behavior, vehicle, AI, quest, dialogue and animation settings, including restored defaults for previously owned items. See [native market integration](docs/native-market-integration.md) for the item/function breakdown and extension workflow.

The shared header stays one row, switches to labeled icons when width is constrained, and places navigation in the hamburger menu on narrow screens. Wordmark Print remains in the product catalog/designer and appears in the retail grid only when it shares a row with another product.


## World item factory and shipping supply

Visit **World Item Factory** in **Maps → Factories** (`model-explorer.html?environment=world-item-factory&autoplay=1`), or open **World item factory** in the explorer, arcade, hockey or island controls to build native and GLB catalog stock with bulk discounts. Each item begins with 1,000 global units once; purchases and physical deployments deplete stock. Dispatch completed batches through Hormuz or copied shipping maps, then finish the server-verified cargo voyage to restock a destination map warehouse or central world stores. Map stores share their warehouse inventory. See [world supply](docs/world-supply.md) for production, restocking, cancellation, and simulated onward transfers.
