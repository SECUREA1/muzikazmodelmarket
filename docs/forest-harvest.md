# Timberland: Forest Harvest & Lumber Mill

Open **Maps → Forestry → Timberland**, or `model-explorer.html?environment=forest-harvest&house=forest-harvest&mode=multiplayer&autoplay=1`. Use the **Forest** view control (under **More view controls** on smaller displays), or press **E** on foot. The map connects to World Commons, Skyline Construction and World Item Factory.

## Tree to finished item

1. At the logging depot, collect an axe or chainsaw. Choose a tree and use **Find tree** to visit it. Fell the mature tree, then buck the trunk into logs.
2. Load logs within tool reach. On foot, carry two logs; the harvester, forwarder and timber truck offer larger capacities. Collect vehicle equipment, find its machine, board it, then drive using the normal vehicle controls. Vehicle cargo stays bound to that machine. Stop at the lumber mill to unload.
3. At the mill select the **harvested species**, **lumber profile** and number of delivered logs to process. Pine, oak, birch, cedar, walnut and spruce maintain separate stock. Outputs include planks, structural beams, panels, veneer and dowels.
4. At the drying kiln, dry green lumber. Mill and kiln jobs run on server time and deliver once. The current batch occupies its shared machine until completion.
5. At the workshop, choose a recipe and wood species. Dry lumber can become walls, floors, roofs, fences, tables, benches, bookshelves, crates, planters and counters. **Send to Backpack** exports the completed batch. Dry lumber can also be exported as individual native material items. Exporting consumes the original stock.
6. Use Backpack's normal placement controls to take earned timber items to other maps. These are account-bound earned items; exported inventory is backed by server receipts, rather than client-provided item data.

Grind a bucked tree's stump with the actual stump-grinder vehicle. Haul away its logs to leave clear ground. Clear all twelve planting spots and logs in a stand to reclaim its land. Equip the planter, choose a replacement species, plant cleared ground, and tend seedlings. The accelerated game growth cycle lasts 90 seconds; tending once saves 30 seconds. Challenges award badges for harvesting, production, crafting, clearing land and restoring the forest.

## Shared and saved state

The four forest plots contain 48 shared tree slots. Trees, loose logs, production machines and cleared plots belong to the shared room; equipment selections, carried cargo, delivered logs, lumber, finished batches and progress belong to its player records. Room persistence retains the working forest and inventory across reconnects and server reloads. Jobs and regrowth catch up from server time when the world resumes. Forest room stock stays with that room; exported Backpack items stay with the account.

The canonical data is `public/js/forest-harvest-config.js`. `server-forest-harvest.mjs` validates work, equipment, vehicle occupancy, quantities, proximity and production. `server-forest-inventory.mjs` validates and records Backpack exports and reconciles account receipts before further work if a room save was interrupted. Native forestry assets are also available in Builder and the native market. Decorative forest trees and logs have no collision; equipment, stations and the ground use the normal world collision system.

## Validation

Run `node --test test/forest*.test.mjs test/authoritative-forest-harvest.test.mjs` for lifecycle, conservation, persistence, vehicles, inventory, map geometry, UI helpers and compact snapshot checks. `python3 test/forest-harvest.browser.py` runs the real desktop/mobile controls against an isolated server with temporary data, including harvesting through Backpack export. It requires the repository's existing Playwright and Chromium setup.

## Forestry graphics

Timberland uses authored 2,048-pixel color maps, 1,024-pixel normal maps and 512-pixel roughness maps for bark, timber, cut end grain, soil, gravel, painted metal and rubber. Alpha-cut leaf and needle sprays use separate 1,024-pixel textures. Mobile and low-memory browsers load 512-pixel color variants. Textures are shared across instances; changing one item's paint does not change another's finish. Generate the committed texture assets with `python3 scripts/build-forestry-textures.py` (NumPy and Pillow); normal application builds use the baked files.

Tree trunks have flared roots and individual branches; layered leaf sprays replace solid cone canopies. Instanced undergrowth, cut faces, subtle wind, falling trunks, gravel haul roads and smoother distant ridges follow the saved harvest state. Machinery has finer cylinders, bevelled body panels, hydraulic hoses, cab instruments, wipers, seals and grilles. Added cosmetic detail does not change machinery collision surfaces, station approaches or the forest's walkable floor.

Hardware rendering uses a tighter player-follow shadow area and a 2K shadow map, with up to twice the CSS pixel resolution when the display supports it. The existing mobile/software-renderer performance mode remains available. `test/forestry-*.test.mjs` and the forestry graphics model/scene tests check texture dimensions, shared resource disposal, geometry budgets and preserved gameplay surfaces. `python3 test/forest-harvest-graphics.browser.py` verifies desktop/mobile texture loading and shader compilation, and captures trees and machinery for inspection.
