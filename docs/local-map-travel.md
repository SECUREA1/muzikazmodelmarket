# Local map teleportals

The map SVG opens local destinations on the explorer, arcade, and hockey pages.
Numbered SVG markers support touch, click, Enter, and Space. The corresponding
destination buttons stay visible below the map. Background clicks select an
exact ground coordinate; world/deed links still enter their separate worlds.

`local-map-locations.js` merges authored `locations` and `commonsLocations`,
deduplicates their IDs, and supplies Arrival. Maps with fewer than four authored
destinations also get eight compass teleportals spread across their footprint.
Terrain uses its declared size; GLBs use the loaded, transformed mesh bounds.
Client and server share this helper so the marker and requested destination agree.

Shared explorer travel is an authoritative `map-access` command. It checks
physical floor, wall clearance, placed solids, vehicle occupancy, and restricted
sports areas. Named destinations can search up to 12 metres for clear nearby
floor. An unsupported or blocked destination reports an error without moving
the player. Travel keeps the same live room, other members, and saved progress;
only relocation motion is reset. It does not run the GLB join-spawn selector.

Solo exploration checks the real local floor and standing capsule before
relocation. Arcade travel is available while exploring outside an attraction.
Hockey uses local spectator viewpoints and protects active competitive play.

Run `node --test test/local-map-*.test.mjs test/transport-map-access.test.mjs`
and the district-map, district-map-svg, and transport-map-access browser scripts.
