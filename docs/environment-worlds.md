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

`tropical-island` is a permanent solo resort destination in the same native
world directory as basketball and the Strait of Hormuz. Its district building,
atlas entry, saved pins and explorer map picker open
`tropical-island.html?environment=tropical-island&mode=solo&autoplay=1`.
The entry carries the dedicated tropical island illustration and remains listed
when uploaded map lists are empty. Return through `index.html#world-map`.

This map runs its complete resort scene locally in the browser, with unlimited
exploration of cabanas, beach bars, beach balls, paddle boats and pontoon rides.
The two-minute duration applies only to each optional fictional drink’s buzz,
not the visit. End the visit explicitly to see its summary. It does not advertise
a live multiplayer round or server rewards. Destination selection lives in
`public/js/tropical-island-destination.js`; the directory and atlas share that
routing so an ordinary explorer fallback cannot replace the authored resort.

Run `node --test test/tropical-island-destination.test.mjs test/world-directory.test.mjs`
to verify registration, atlas reachability, native launch URLs, solo metadata,
search/filter discovery and saved pin routing.

Open `tropical-island.html` through the app or a local HTTP server. The scene
uses the same bundled Three.js runtime, saved first-person/top-down camera
preference and RAD-TOX twin-stick controller as the other native games. WASD or
arrow keys walk/paddle, E/Space interacts, dragging looks around, and V changes
view. M opens the complete island overview; the map button offers the same view.
A live minimap and eight passport waypoints guide exploration. Bar visits
stamp the passport without requiring alcohol; each unique experience gives 100
local points. Collecting all eight stamps completes the passport goal. The pontoon
circles the coast automatically; E returns boat riders to their original pier.

The visit clock shows unbounded elapsed time, including menus and hidden tabs.
Each alcoholic drink independently rises through digestion, adds to camera sway,
soft focus and double vision, and fully fades 120 seconds after it was consumed.
New drinks stack their own effects without resetting or extending earlier
drinks. Waiting 120 seconds after the last alcoholic drink fully clears the buzz
while exploration continues. Water and mocktails add no alcohol and do not
instantly sober the player. Ending or restarting the visit clears effects;
reduced visuals respect the system motion preference and can also be selected
in settings. This is an accelerated fictional arcade simulation, with
no real blood-alcohol estimate or persistent economy rewards.

Run `node --test test/tropical-island*.test.mjs` for the map and rules contracts,
`python3 test/tropical-island.browser.py` for offline desktop/mobile play, and
`npm run build && npm run check` for the packaged static site.
