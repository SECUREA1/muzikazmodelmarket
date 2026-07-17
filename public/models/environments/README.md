# Walk-Around GLB Environments

Place repository-hosted house, room, building, landscape, and environment assets in `public/models/environments/`. Put thumbnails in `public/models/environments/thumbnails/` and register each environment in `manifest.json`. This folder is the canonical source for house/environment GLB content used by the 3D House Explorer. Add or replace `.glb`/`.gltf` files here and set the matching manifest entry to `"enabled": true` to activate it.

## Add an environment

1. Export a `.glb` from Blender and copy it into this folder.
2. Add a WebP, PNG, JPG, or SVG thumbnail under `thumbnails/`.
3. Add or update a manifest entry with a unique `id`, display copy, model URL, thumbnail URL, scale, rotation, spawn point, camera height, movement speed, collision flag, and avatar flag.
4. Set `"enabled": true` only after the referenced model file is present in the repository.
5. Open `model-explorer.html?house=your-id` or select it from the Walk-Around Environments selector.

## Manifest schema

- `defaultEnvironment`: ID loaded when no URL query is present.
- `environments[]`: list of entries.
- `id`: stable house ID used for `/api/houses/:houseId/*` shared avatars and presence.
- `name`, `description`: interface text.
- `model`: root-relative URL to the `.glb`/`.gltf` asset; do not embed model data in JavaScript.
- `thumbnail`: root-relative WebP/PNG/JPG preview.
- `enabled`: only `true` entries appear in the selector.
- `scale`, `rotationY`: transform applied after loading.
- `spawn`: `{ "x": number, "y": number, "z": number }` starting floor position.
- `cameraHeight`, `movementSpeed`, `collisionEnabled`, `allowAvatars`: navigation and live-avatar settings.

## Blender/export assumptions

Use meters, +Y up, and keep the main building near the origin. Apply transforms before export, include embedded textures, use PBR materials, and prefer GLB binary export. Add named helper meshes or empties when useful: `COLLISION`, `NAVMESH`, `FLOOR`, `SPAWN`, and `NO_COLLISION`. Hidden `COLLISION` meshes may simplify walls; `NAVMESH`/`FLOOR` should represent walkable surfaces; `NO_COLLISION` decoration is ignored.

Keep mobile files as small as practical, ideally under 25 MB and below ~100k triangles for default mobile loads. Use 1K-2K texture atlases, WebP/PNG/JPG textures, and Draco compression only when the page can load the matching decoder. Test stairs, slopes, spawn placement, wall collisions, shared avatars, and presence locally with `npm run build`, `npm run check`, and the Rust server.
