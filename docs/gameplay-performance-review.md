# Gameplay performance review · 17 October 2026

Reviewed source: `d409e069c9ec9959415ea48f3ac7f42df47e1137` on `work`. Tests ran from a clean GitHub archive with the locked Node dependencies installed, rather than the older mixed local checkout.

## Changes

- Simulation batches clone only the rooms being updated. Inactive worlds retain their saved records; failed callbacks roll back their room; callback references and returned values cannot modify committed room state. Durable checkpoints and serialized commands remain in place.
- World graphics preparation handles each shared material and texture once per load. Texture filtering still respects GPU limits, with the existing lighting, transparency and shadow settings preserved. The quality helper now uses the bundled Three.js module.
- Added a real local HTTP run-through: two guest players publish and enter a custom courtyard, observe the same movement and firing events, retain authored objects and layout, and cannot overwrite another creator's map.
- Replaced an obsolete exact database-read count in the batch test with its existing behavior checks. Added explicit isolation, rollback, concurrent update and restart coverage.

## Verification

- `npm run build` and `npm run check`: passed.
- `npm run check:environments`: 12 repository environments, 35 categorized models and GLB headers validated.
- Focused checks passed for room persistence, room-client recovery, shooting/audio event deduplication, local/remote movement, builder gameplay, multiplayer arcade sessions, store purchases, resale and ownership after restart.
- Browser builder checks passed at 1440×1000 and 390×844: mouse dragging, native desktop drops, touch dragging, building placement, cancellation, and the Test Map scene payload.
- Browser machine checks passed at phone, desktop and landscape sizes: dedicated screens, return navigation, shared-media queue pagination, enqueue wiring and game controls. These UI checks use the repository fixtures; they do not certify public video services or live camera hardware.

## Performance measurement

`node scripts/benchmark-room-ticks.mjs [baseline-module-path]` measures 30 in-memory ticks of one active room alongside 100 inactive worlds containing 20,000 saved objects. A local comparison measured about 140 ms/tick before and 0.025 ms/tick after. Results vary with machine load; this isolates cloning overhead and is not a claim about production FPS, network latency, disk write time or maximum server capacity.

The texture resource regression uses 100 meshes sharing materials/textures and verifies one texture dirty update rather than repeated updates for each mesh. It also verifies distinct textures, GPU anisotropy limits, shadow flags and transparency settings.

## Existing failures and limits

The unmodified baseline suite had 599 tests: 565 passed and 34 failed. The final run had 604 tests: 571 passed and 33 failed, with no new failure names compared with that baseline. The baseline atlas/environment-directory failure did not reproduce in the final run; that is not claimed as a fix. Existing failures have not been hidden or broadly rewritten to force a green suite.

Failures include stale source/response-shape assertions; synthetic map fixtures without collision models; tests that assume every actor is an enemy before automatic machines and coins were added; and streaming tests that omit the builder-base helper from their VM fixtures. Other outstanding checks include building-floor support/arrival, account/session flows and atlas contracts. These remain investigation items and prevent certification that every map, account flow or model is glitch-free.

Payment settlement and live public multiplayer load were not exercised against production accounts. No production data or economic rules were changed. Local browser viewport tests do not substitute for physical-phone, VR or hardware-GPU frame-rate measurements.
