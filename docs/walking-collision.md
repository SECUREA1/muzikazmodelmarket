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
a fixed 50 ms interpolation buffer and no extrapolation. The local camera does not adapt playback speed or apply movement prediction. A second local movement
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

## Clear startup entries and encounter placement

Entries require overhead clearance and 0.8 metres of space beside walls when
available, with a capsule-width fallback for narrow maps. Existing players are
recalibrated once on their next join using floor version 3. Walking itself does
not run spawn searches or reposition players at wall contact.

Encounter placement version 2 requires verified floor, side clearance, the same
storey, line of sight and four metres from present players when space permits, with a 2.5 metre minimum in compact rooms. Failed
placements remain pending and retry once per second rather than spawning on the
player. Pending enemies are neither rendered nor combat targets; their wave
remains active. Spawn protection also prevents enemy pursuit and firing, giving
players time to leave the entry before combat begins.

## Fast RAD-TOX combat flow

The server confirms one-hit kills for RAD-TOX enemies and bosses, including
encounters saved before this rule changed. Player health and authored Builder
objects retain their existing damage rules. RAD-TOX combat tools accept shots
every 100 ms; an in-flight shot can retain one subsequent trigger press. Local
shot feedback appears immediately, with server events deduplicated on arrival.

Waves transition after one second and level results after three seconds. Results
remain available from the dashboard without opening a modal at wave or level
completion. Living players can keep walking during the results countdown. All three regular waves and the boss still run on the server.

Solo RAD-TOX uses the same one-second wave pause and three-second level pause.
Each level runs three regular waves at a stable target count before its configured
boss, without doubling targets at every refill. Wave transitions are scheduled
once, and pending wave or level timers cannot act after a map change or reset.
The solo house keeps the swept capsule walking and stair view smoothing from
`95d98547`; the fast shared baseline is `bd44fd5e` (October 19, 2026).
