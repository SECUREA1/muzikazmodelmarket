# Neon Junction — Arcade Park

The game map list and Backpack include **Neon Junction — Arcade Park**. Its seven attractions are arcade hockey, shooting targets, basketball, air hockey, billiards, the Park Express perimeter train, and the elevated Skyline coaster. The standalone private Site uses the same shared game/scene modules with its own Three.js distribution.

## Play

Choose an attraction from the navigation or click its platform in the 3D park. Hockey and basketball are timing/aim challenges; shooting uses moving targets. Air hockey has a controllable mallet, a computer opponent, puck rebounds and goals. Billiards has a cue ball, six object balls, cushion/collision physics, pockets, scratches and a table-clear bonus. These are short arcade challenges, not full league-rule simulations.

Use pointer/touch to aim or move the mallet. Click/tap or Space shoots; arrow keys adjust the aiming point. Each game supports restart and exit. Points persist in this browser and are not currency, MZK rewards, a server leaderboard or verified multiplayer results.

The train continuously circles the park. The coaster climbs and descends around the park; its cart includes a safety bar. Boarding attaches the camera to a passenger seat, with an inward-facing scenic view on the train, and locks orbit, zoom and attraction switching. A complete lap restores the overview. **Exit ride** and Escape are explicit emergency exits. Hidden tabs pause ride/game clocks. Both rides continue animating in overview.

## Builder

Select **Arcade & rides → Neon Junction Arcade Park**. The preview includes animated train/coaster scenery. Settings control round seconds (15–180), train lap seconds (20–120), coaster lap seconds (15–90), coaster peak (6–22 metres), relaxed/normal difficulty, enabled attractions, and the X/Z positions of the five game stations.

Disabled attractions remain scenery but cannot be entered. Ride tracks remain fixed around the park; station positions do not relocate the train/coaster path. Published custom maps retain their configuration and launch `arcade.html?environment=<map-id>&mode=solo`. Arcade maps are solo sessions, so the builder and server force their multiplayer flag off. Publishing shares a layout, not player positions, scoring or ride occupancy. Other arbitrary builder props are not imported into this dedicated arcade runtime.

The private Site exposes local park settings for round/ride length, coaster height and difficulty. Those settings apply only to the current browser. Its audience and existing project ID remain unchanged.

## Implementation and checks

- `public/js/arcade-rules.js`: bounded settings, attraction definitions, local score handling and ride state/locking.
- `public/js/arcade-park.js`: reusable procedural park geometry, perimeter rails, elevated coaster and animated vehicles. Static shadows are baked once for performance.
- `public/js/arcade-game.js`: navigation, locked seat cameras, five canvas minigames, sound, local points and settings.
- `arcade.html` and `public/assets/arcade.css`: responsive UI and accessible dialogs/controls.

`node --test test/arcade.test.mjs test/guest-map-play.test.mjs test/environment-builder.test.mjs test/world-map-picker.test.mjs test/browser-game-module-syntax.test.mjs` checks settings, ride state, scene geometry, configuration bounds, map publication and module syntax. Browser QA covers all seven attractions and custom-map publish-and-play. `npm run build && npm run check` validates static packaging. The unchanged repository baseline contains twelve unrelated failing tests; do not report the entire suite as green.
