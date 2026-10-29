# Articulated people and vector equipment

The weapon illustrations now use clean, static vectors with metal panels and luminous inlays. Native people bend at their elbows, knees, ankles and hips instead of swinging an entire rigid sleeve or trouser leg. The changes preserve the existing weapon damage, ownership, character identities, AI decisions, movement physics, collision and server protocol.

## Artwork

All nine ranged weapons, the bat, igniter, taser, toxin thrower, dynamite, four native melee weapons and carnival water blaster have distinct vector artwork. The other handheld utility equipment shares the same collection: 29 files in total. These are genuine vector paths and gradients, with intrinsic 320×320 dimensions and accessible titles. They contain no raster images, scripts, animation, external dependencies or blur filters.

The collection decreases from 1,457,446 bytes to approximately 121 KB, a 91.7% reduction. `scripts/build-equipment-vector-art.mjs --check` verifies the generated files and coverage. The native raster exporter preserves these authored vector sources. Public artwork URLs carry a version fingerprint so an older browser image cache cannot conceal the upgrade.

Weapon and utility dialogs, catalog cards, product details and equipment illustrations use the same allowlisted artwork. Hidden weapon-dialog images load lazily. Selecting a weapon still follows the existing equip and firing handlers.

## People and avatars

The shared `articulated-character-rig.js` implements continuous elbow/knee deformation with standard Three.js skinning. Already segmented armor, stone limbs, construction crew and seated pilots use ordinary pivots. Hands, shoes, cuffs, watches, boxing gloves, dumbbells and paddles follow the appropriate wrist or ankle. Knee and elbow directions account for each model's forward axis.

The production routes include world residents and their saved forms/uniforms, fitness residents, Hero/Scout/RAD-TOX/Rogue Bot, ranger/merchant/knight/golem, all five carnival avatars and map performers, basketball athletes, prison residents, construction crew and seated transport crew. The player fallback is a single human-shaped skinned draw instead of a capsule. Floating spirits and nonhumanoid creatures keep their existing anatomy.

Selected native avatars receive presentation movement from actual rendered displacement. Seated/hidden players and teleports do not trigger a walking gait. Existing authored GLB avatars use their own idle, walk and run clips when available, with one active mixer action. Models without suitable bones or authored clips retain their own geometry; this change does not manufacture a human skeleton for arbitrary uploads.

Character animation caches joint references after initialization. It does not repeatedly traverse the complete model hierarchy, regenerate geometry, load character textures, run inverse kinematics, add lights or submit new server messages. Copies receive independent skeletons and animation state. Teardown releases skeleton palettes and stale/removed live-avatar resources.

## Performance limits and evidence

The reference is commit `f33ea7a0`. The independent audit covers 20 character production families and 24 held-tool factories. The browser audit renders every character using one reused real WebGL context and compares draw calls, triangles, graphics allocations, texture uploads and pose-update diagnostics against the same source revision.

Across the 20 matched browser scenes, draws decrease from 536 to 518 and triangles from 109,787 to 97,036 (11.6% fewer). Combined sampled geometry, map and bone-palette allocations decrease from 7,306,681 to 6,653,374 bytes (8.94%). These are sums of matched test scenes, including repeated shared maps, not a claim about the absolute memory of a complete game world. All 19 animated cases produce changing finite joint poses; the seated pilot keeps its fixed operating pose.

Representative geometry budgets:

| Character | Before triangles | After triangles | Draws |
| --- | ---: | ---: | --- |
| Scout / RAD-TOX / Rogue Bot | 4,620 | 2,496 | 23 → 21 |
| Hero | 5,068 | 2,944 | 24 → 22 |
| Basketball athlete | 1,352 | 648 | 9 → 9 |
| Prison guard | 552 | 474 | 14 → 14 |
| Construction worker | 964 | 964 | 24 → 24 |
| Seated pilot | 1,392 | 1,392 | 21 → 21 |

Articulation has a small client-side cost. A skinned character shares one bounded bone palette across its limbs, usually a 1 KiB texture upload per rendered animation frame. Rigid segmented people need no bone palette. Some individual simple figures use more transform/palette memory than before; the whole audited collection uses less combined graphics data and no additional draw calls. This is a bounded performance improvement, not a claim that extra motion executes without any computation or that all hardware will have identical frame rates.

Diagnostic CPU timings come from headless Chromium and are unsuitable as a device FPS guarantee. Server AI cadence, actor counts, room snapshots and action requests are unchanged by this visual upgrade.

## Verification

New regressions cover articulation direction, actual deformed vertices, neutral/reduced-motion poses, model bounds, clone isolation, attachment placement, palette disposal, real authored clip selection, live-player teleport handling and complete vector-art coverage. Existing weapon effects, avatar selection, resident forms, fitness poses, carnival appearance, basketball gear, construction operator seats and native graphics caching remain checked.

Reproduce the audits with:

```sh
node scripts/build-equipment-vector-art.mjs --check
node scripts/audit-character-graphics.mjs
python3 test/character-graphics.browser.py
python3 test/world-people-articulation.browser.py
python3 test/equipment-vector-art.browser.py
```

Build and static dependency checks must also pass before release. Real map startup and equipment-menu checks exercise the production explorer rather than only isolated model factories.
