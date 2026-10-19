# Walking and collision ownership

Ordinary walking clips the requested move against physical surfaces. Contact
does not eject the player, lift them onto an overlapping object's edge, or
teleport them to a cached position. A blocked normal component stops; the
remaining component slides along the wall.

## Solo worlds

`house-explorer-glb.js` submits controls and gravity to `moveWalkingCapsule`.
Map triangles come from the loader's Octree. Placed bricks and solid drawing
strokes supply cached, transformed triangle groups to that same query. There
is no separate placed-object push pass.

`walking-sweep.js` clips horizontal movement continuously, including thin
walls. `walking-triangles.js` distinguishes body-height wall surfaces from
walkable floors. `walking-capsule.js` handles support, jumps and ceilings.
Its work is limited to nearby triangles; distant dynamic groups are culled.

Steps up to 0.26 metres require horizontal input, support beneath the destination
centre, and headroom. Standing near a step does not move the player. Supported
step heights are smoothed for the view while the capsule remains on the physical
surface. Unsupported ledges retain gravity.

## Shared worlds

`AuthoritativeRooms.step` passes controls, gravity, authored map geometry and
placed solids through `ServerBuilderCollision.resolve` once. The resolver uses
the same horizontal sweep and triangle rules. Cached spatial bins avoid scanning
the entire map for every player on every tick. Walking never calls the spawn
search to repair a contact.

The browser displays only accepted server positions through `ServerMotion`, with
a 125 ms interpolation buffer that adapts to recent delivery gaps, and no extrapolation. Playback speed adjusts gently without rewinding or jumping beyond accepted positions. A second local movement
predictor must not run alongside it: that would move the view through walls and
require a later correction. Ordinary snapshots do not reset the view based on
distance. Deliberate relocations use `movementRevision`/explicit resets.

## Geometry and updates

Collider clones receive the authored world matrix exactly once. Overlapping
supplemental roots do not register the same mesh twice. Ordinary invisible
scenery is excluded; explicitly authored hidden colliders remain physical.
Pickup, door and collision-disabled state still control whether an object is
solid. Dynamic geometry is cached by its transform; map content revisions
invalidate the authoritative map cache.

## Regression checks

Run `node --test test/*walking*.test.mjs test/server-motion.test.mjs
test/environment-collision-geometry.test.mjs` for wall pressure, tangent sliding,
initial overlaps, rotated objects, openings, steps, thin floors, ceilings,
platform descent and stationary snapshots. The room tests exercise real
authoritative commands; browser smoke also uses the native Three Octree/Capsule
and the game page.

## RAD-TOX readiness

The explorer joins with `deferRadTox` while its map and enemy resources load. The
server keeps that player outside enemy targeting and team defeat until
`start-rad-tox` confirms readiness. Loading players cannot fire. Existing
participants continue their encounter. Start is idempotent; all three regular
waves and the boss must finish before victory can advance to the next level,
with the results countdown enforced by the server.
