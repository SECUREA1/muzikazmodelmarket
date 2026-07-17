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
