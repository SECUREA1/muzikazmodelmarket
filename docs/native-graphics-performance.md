# Native graphics and loading cleanup

The graphics expansion after `6853f5a1` introduced unnecessary work alongside the upgraded designs. This cleanup retains the crafted appearance, collision geometry, item identities, controls and media. It also preserves the intervening updates on `main` through `78debe17`, including day/night lighting, software-renderer detection, travel and audio fixes.

## Changes

- Small instanced tire treads, rotor slots and other cosmetic boxes retain their original 12-triangle primitive. The finish had expanded every instance to a 44-triangle bevel. Main bodywork keeps its bevels; multi-material bevels now use six draw groups instead of 26.
- Static opaque trim sharing a material and immediate parent is combined. Authored meshes, media, referenced rig parts, animated leaves and individually inspected vehicle details retain their identities. Parent movement still moves its own details.
- Surface finishing visits each root once per pass and processes unfinished materials once. Immutable surface maps are shared across models and survive individual world/preview disposal. Upstream missing-UV repair remains in place.
- Vehicle fittings update their ancestor chain rather than the whole vehicle for each detail. Small trim curves use fewer segments. Cosmetic shadow exclusions survive world placement and quality preparation.
- Alpine ridge geometry is generated once and copied into independently editable/disposable placements. Repeated safe native scenery uses world-local templates with isolated nodes, paint materials and instance transforms. Closure-driven models, characters, vehicles, imported resources and live media bypass template reuse.
- Model chunks load with two concurrent workers, ordered results, monotonic progress and cancellation cleanup. Authorization failures are not retried as transport errors.
- Shader preparation runs once at the resolved entry camera. It compiles visible renderables against the real scene's lighting and fog without cloning or reparenting the scene. The first draw still completes before room heartbeat deadlines begin.
- Fresh, explicitly public binary assets may reuse the service-worker cache. Modules, map JSON and navigation still revalidate; account requests, uploads, authorization, ranges and no-store requests bypass this cache path.

## Recorded comparison

Frozen-source browser measurements compare graphics commit `6dca4f98` with the coordinated fixes, before the final upstream merge. Both use identical cameras and placements, Chromium/SwiftShader, pixel ratio 1, and no shadows/antialiasing. Counts describe those views, not the entire catalog.

| Measurement | Graphics commit | Cleanup |
| --- | ---: | ---: |
| Grand tourer visible triangles | 30,988 | 17,900 |
| Mountain scene draw calls, 399 objects | 4,115 | 3,571 |
| Mountain scene JavaScript texture objects | 1,588 | 28 |
| Mountain scene GPU textures | 28 | 28 |
| Airport startup shader programs | 43 | 26 |
| Airport startup largest main-thread task | 12.52 s | 1.15 s |
| Airport control/server readiness | 32.61 s | 12.93 s |

The texture-object reduction removes allocation and disposal work; the old clones already shared image sources, so it is not a 57-fold GPU image-memory reduction. Readiness timings are single local diagnostic runs, not hardware frame-rate or production network promises. Commons readiness remained around 12 seconds, indicating additional startup work outside graphics preparation.

A separate same-process airport template comparison preserves all 5,531 meshes and 2,150 material instances while reducing factory calls from 977 to 48 and geometry buffers from 17.51 MB to 4.64 MB. The cache retains 39 safe templates and leaves nine dynamic/media placements on their normal factory path.

Matching pickup, mountain and campground renders were visually reviewed. Pixels changing by more than four RGB levels were under 0.1% in each view. Real shader preparation was also checked with ordinary, instanced, skinned and sprite objects, including circular rig metadata and hidden/off-camera/layer exclusions.

## Verification

Focused tests cover geometry bounds and material-face assignments, instanced triangle budgets, surface UVs, rig/material isolation, template ownership and teardown, visible shader selection, texture lifecycle, streaming cancellation, private transport, service-worker freshness, adaptive quality, day/night behavior and existing vehicle/mountain gameplay.

Run the focused performance regressions with:

```sh
node --test test/game-graphics-performance.test.mjs test/native-finish-performance.test.mjs test/native-detail-batching.test.mjs test/native-model-cache.test.mjs test/environment-loading-resources.test.mjs test/service-worker-resource-cache.test.mjs
npm run build
npm run check
python3 test/all-maps-startup.browser.py --map public-commons --map muzikaz-airport --map pixel-peaks-ski-resort
```

The native, vehicle and mountain audit scripts verify catalog coverage and compatibility. Browser startup checks require confirmed gameplay/server/player readiness and real rendering, and report page/module/JSON/shader failures. Physical-device GPU performance and production multiplayer load require separate measurement.
