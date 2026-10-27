# MUZIKAZ GLB environment worlds

The 3D House Explorer treats each environment GLB as the complete walkable world. Repository worlds are listed in `public/models/environments/environments.json`; uploaded worlds are stored separately in `uploads/environments/` with metadata in `data/environments.json`.

## Metadata format

```json
{
  "id": "muzikaz-main",
  "name": "MUZIKAZ Main Floor",
  "description": "Complete walkable MUZIKAZ main-floor environment.",
  "modelUrl": "/public/models/environments/muzimakzmain.glb",
  "modelUrls": ["/public/models/environments/muzimakzmain.glb"],
  "thumbnailUrl": "",
  "spawn": { "x": 0, "y": 1, "z": 2, "rotationY": 0 },
  "scale": 1,
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "collisionMode": "auto",
  "visibility": "public",
  "source": "repository"
}
```

Use `modelUrl` for one GLB. Use `modelUrls` only for an intentionally combined environment such as the full house.

## Authored GLB markers

The loader recognizes named nodes without flattening the GLB scene hierarchy:

- Spawn: `SPAWN_PLAYER`, `SPAWN_DEFAULT`, or `SPAWN_*`.
- Collision: `COLLIDER`, `COLLIDER_*`, `COLLISION`, `COLLISION_*`, `NAVMESH`, or `NAVMESH_*`.
- Optional markers are preserved for future features: `TELEPORT_*`, `PORTAL_*`, `INTERACTION_*`, `LIGHT_PROBE_*`, and `AUDIO_*`.

Dedicated collision meshes are hidden after the Octree is built. If no dedicated collision meshes exist, the loader builds collision from suitable static world meshes and excludes obvious sky, particle, foliage, glass, helper, decorative, light, and avatar nodes.

## Adding a repository GLB

1. Commit the `.glb` under `public/models/environments/`.
2. Add a record to `public/models/environments/environments.json` with a stable `id`, `name`, `modelUrl`, spawn metadata, scale, rotation, visibility, and collision mode.
3. Prefer authored `SPAWN_*` and `COLLIDER_*` nodes in the GLB. Metadata spawn is the fallback.
4. Run `npm run build` and `npm run check`.

## Uploading through the website

1. Open `model-explorer.html`.
2. Expand **Upload Environment** in the 3D House Explorer HUD.
3. Enter name, description, `.glb`, optional thumbnail, scale, rotation, spawn values, collision mode, and visibility.
4. Keep **Load after upload** checked to switch to the uploaded world immediately.
5. Refresh the page. The uploaded environment remains in the Environment Library when server storage is persistent.

The upload endpoint validates `.glb` extension, MIME type, GLB magic bytes, glTF 2.0 version, header length, file size, safe filenames, and stores files under `uploads/environments/` so repository files cannot be overwritten.

## Environment API

- `GET /api/environments` returns repository and public uploaded environments.
- `GET /api/environments/:id` returns one environment by id or alias.
- `POST /api/environments` creates metadata for an already uploaded environment URL under `/uploads/environments/`.
- `POST /api/environments/upload` uploads and validates a GLB environment plus optional thumbnail.
- `PATCH /api/environments/:id` edits uploaded environment metadata.
- `DELETE /api/environments/:id` deletes uploaded environment metadata and the stored GLB.

## Render persistence

Render instances have ephemeral filesystems unless a persistent disk is attached. For permanent user-uploaded worlds, configure a disk and point these variables to the mounted path:

```text
MUZIKAZ_ENVIRONMENT_UPLOAD_DIR=/var/data/muzikaz/uploads/environments
MUZIKAZ_ENVIRONMENT_DATA_FILE=/var/data/muzikaz/data/environments.json
MUZIKAZ_ENVIRONMENT_MAX_BYTES=157286400
```

Keep existing model/avatar storage variables on persistent storage too if those uploads must survive restarts. For larger production libraries, replace filesystem storage with object storage while preserving the same public URL and metadata contract.

## Optimization workflow

Run:

```bash
npm run optimize:environment -- input.glb output.glb
```

The script uses glTF-Transform and meshoptimizer when the optional packages are installed. It deduplicates data, prunes unused data, welds/reorders meshes for vertex-cache efficiency, resizes oversized textures using `MUZIKAZ_ENVIRONMENT_TEXTURE_MAX` (default `2048`), and reports before/after file sizes and glTF inspection data. It always writes a separate output file and does not intentionally remove animations, marker nodes, materials, or hierarchy.

### Builder launch reliability

Builder test/publish links retain an explicitly selected solo mode through the
world directory. Multiplayer remains the default for existing shared maps;
hockey and arcade destinations use their native pages. Atlas registration does
not change these launch choices.

The explorer, collision code, enemy effects and model loaders use the bundled
Three.js r160 runtime. Draco, Basis/KTX2 and Meshopt decoders are served from
`public/vendor/three`, so importing the game engine does not require a CDN.
Run `node --test test/game-runtime-local.test.mjs test/world-directory.test.mjs`
and `python3 test/builder-launch.browser.py` after `npm run build` to check
routing and real solo/multiplayer publication, startup and walking with external
browser requests blocked.
The explorer also supplies its RAD-TOX on/off preference in the room join itself,
avoiding a second startup command after initial scene projection. Rejoins retain
the latest toggle preference. An off join does not create a background encounter.
Explicit Builder links resolve their map through `/api/environments/:id` rather
than racing the full world list against a five-second timeout. Live rooms serve
cached map metadata immediately while one background directory refresh runs;
a cold or unknown destination waits for that shared refresh.

### Island Adventure · Tropical Resort

`tropical-island` is a permanent shared destination in the same native world
engine as basketball, the funhouse and Strait of Hormuz. Its atlas building,
saved pins, world directory and legacy `tropical-island.html` entry all open
`model-explorer.html?environment=tropical-island&house=tropical-island&mode=multiplayer&autoplay=1`.
The legacy page redirects without running another renderer, controller or game.

The resort uses the standard keyboard, pointer, touch sticks, camera preference,
VR menus, Backpack, world map, safe local ports, connected destinations and
server-owned movement. Eight authored resort locations provide real native
AI residents, conversations, daily favors, discovery and service quests. Quest
acceptance, check-ins, resident progress and travel use the existing shared
room commands and persistence. The resort has no visit time limit and excludes
ambient toxic encounters, random loot machinery and unrelated road traffic.

`public/js/tropical-island-config.js` supplies the coordinates for the native
land adapter, collision, station actors, map locations and shared boat water
checks. The authored island, dock approach ramps and submerged lagoon floor
retain metre scale. Decorative guests and craft are replaced by authoritative
residents and vehicles. Paddle boats and the pontoon use ordinary boarding,
helm input, navigation assistance, anchoring, mooring, collision and exit logic.

The Resort activities panel adds only passport stamps, beach-ball/reef breaks
and beach-bar refreshments. Normal nearby interaction opens it, and its links
open the existing quests, resident and map panels. `island-action` requests
validate the live player, station availability, distance and activity type.
The server owns passport scoring, ball motion and drink timing; repeated
request IDs cannot duplicate drinks or rewards. Drinks never award score.

Each alcoholic drink absorbs gradually and fades independently within 120
seconds of intake, including time spent in menus or away from the tab. New
drinks stack without resetting earlier clocks. Water and mocktails add no
alcohol and do not instantly sober the player. The shared room saves resort
progress; old buzz time catches up on rejoin. Screen-space beer goggles are
visual only, respect reduced motion, and never alter tracked headset poses or
shared controls. These are fictional arcade effects, not real alcohol estimates.

Run `node --test test/tropical-island*.test.mjs test/authoritative-tropical-island.test.mjs`
for native map, collision, craft, shared activity and independent drink timers.
After a static build, run `python3 test/tropical-island.browser.py` for real
local-server desktop/mobile movement, AI, quest, map, boat and bar coverage.
