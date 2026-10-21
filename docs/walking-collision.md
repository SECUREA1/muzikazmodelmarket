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

The local walking view responds on every render frame using current controls,
without a snapshot playback buffer or a wait for the next HTTP response. Every
predicted step and visible correction passes through the same swept capsule
collision query against map and placed geometry. Server snapshots reconcile
movement history; they do not replay an old walking position into the camera.
Local jumps use the server's gravity and jump speed. Seats, aircraft, boats,
respawns, and map travel reset local walking; deliberate relocations apply
immediately. Other hosted rides use that same capsule at the server's ride speed.
A stale connection stops prediction instead of letting a disconnected player
keep walking. Keyboard, touch and release edges request server input immediately.

Aircraft and boats run the shared flight/helm simulation for local presentation
on every render frame. Timestamped controls replay from accepted snapshots;
the local model, camera and aircraft aim use the same predicted pose. The camera
adds no further attitude interpolation to that pose. Server snapshots retain
authority over health, ownership, boarding, runway access and match outcomes.
Map octrees and cached placed triangles constrain the view, including wing/bow
sweeps, boat traffic, shoreline boundaries and actual ground support. Shared
worlds build a local map collision cache; movable Builder objects remain dynamic
triangle groups rather than being baked into that map cache.

Walking and sports movement consume elapsed time up to 250 ms in bounded
substeps. Aircraft and boats retain actual sample-to-sample elapsed time within
the 1200 ms prediction horizon, including acknowledgments between slow frames.
Visual animation timing is separate. Flight and helm axes remain independent
of walking direction remapping and diagonal normalization.

Input changes can send beside a pending heartbeat, with at most three automatic
requests and one newest pending state. Sequence numbers and join epochs prevent
old presses from replacing a later release. No event backlog is replayed. Live
hockey and arcade sports also predict only the locally controlled skater or
mallet; pucks, balls, opponents, scores and clocks remain server owned.

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
recalibrated once on their next join using floor version 4. Walking itself does
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
`95d98547`; local walking no longer uses the snapshot-only camera introduced by
`95d98547` or the fixed-buffer override from `bd44fd5e`. The existing swept
collision fixes remain in use for immediate local presentation and shared physics.

Spawn recalibration version 4 retries verified mesh footprints and a bounded map
grid when the saved entry, centre and nearby ring are obstructed. Procedural
Builder arrivals also search clear perimeter ground when central buildings block
the local search. No floor or platform is invented when geometry has no support.
Legacy player floor state resets once on join; scores and inventory are retained.
Failed game launches stop the old room client and clear camera interpolation,
control input and readiness before retrying. Room startup allows 30 seconds for
confirmation. Invalid saved API schemes and malformed authentication header
values are reset before requests are constructed; map drafts are retained.
