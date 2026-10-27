# World item factory and stock supply

Open **World item factory** in the game controls. Search the native, repository GLB/GLTF, published model, or care catalog and inspect each item's world, factory, and destination warehouse count.

Each canonical item starts with **1,000 units across the world**, once. Aliases for the same native item or model share one count. Catalog refreshes, server restarts, and visiting a new map never reset depleted stock. Existing owned items and authored map scenery are preserved.

## Build and ship

1. Choose an item and whole-unit quantity. Request a server quote. Production costs the catalog unit price, with **20% off batches of 10 or more**. Free catalog items have a base manufacturing cost of 1 MZK per unit before the bulk discount. Every catalog item receives a manufacturing recipe. Batches take about 8–120 seconds based on item complexity and quantity, and produce up to 10,000 units.
2. Start production. The server charges MZK once and runs four timed stages: input preparation, fabrication/assembly, quality checks, and packing. The board shows each stage and its progress. All four must complete before the packed batch enters shared factory stock; no stage replenishes stores immediately. An unfinished batch can be cancelled for its original cost; finished goods cannot be refunded.
3. Select a destination map warehouse or **World stock · central stores**, a shipping map, and a shipping contract. Dispatch reserves actual factory units. To redistribute existing goods, choose a world or map warehouse as the source instead; transfers debit its stock and never manufacture extra units. Packing capacity depends on the item recipe: materials, tools and care supplies fit up to 1,000 per container; furniture 50; general props and character assets 100; electronics 250; ground vehicles 4; aircraft, boats, structures and world modules 1. The board shows the selected route capacity and a shipment-size control. Larger batches need a larger manifest or several shipments. Dock induction cannot transport world stock.
4. On the assigned shipping map, board an eligible vessel at the contract's origin port. Open World item factory and accept the shipment task. Its item manifest appears in the shipping loading panel.
5. Load and balance every container, secure the cargo, sail the marked route, dock, and unload completely. Only the verified final unload credits the selected inventory. Ordinary freight rewards still apply. The shipping chart links back to factory tasks, with directions to the correct shipping world, origin port and eligible vessel.

The sea leg is playable in Hormuz and copied shipping maps. Warehouse transfers to and from the shipping ports are **simulated in-game freight**, recorded on the shipment's transfer task. This does not arrange real-world production, trade, or shipping. Maps with stores share their map warehouse; maps without stores still receive inventory.

## Consumption and restocking

Market sales remove the purchased quantity from stock. Buying a reusable upgrade consumes one unit for ownership; placing another physical asset consumes another unit. Repeated tool use retains the owned tool. Bulk building purchases reserve every piece once; using prepaid pieces does not debit world stock again. Buying care supplies removes units from supply, and using them consumes the owned Backpack supply.

In-game purchases and deployments use the current map inventory. Until an item first receives a local shipment, the map draws from the initial central reserve. After receiving that item, the local count governs availability: a local zero blocks further purchases and deployments until another shipment arrives. Global stores use the central count. The in-game Marketplace uses the same current-map inventory client as the factory and Backpack, including after travel. Room aliases resolve to the canonical world, so alternate URLs cannot create a second free deployment. Player resale transfers existing ownership and does not manufacture more stock.

Cancellation or map travel releases a bound shipment for another attempt. Disconnected or abandoned reservations expire after the freight window plus a one-minute grace period. Unassigned shipments can return their goods to their original source inventory. Retried production, purchases, cancellations, dispatch, and deliveries preserve quantities and payment receipts.

## Implementation

`world-supply.mjs` maintains the canonical ledger in the existing durable user database. `server-world-supply.mjs` commits production, payments, reservations, and transfers under its transaction queue. No public endpoint can complete a shipment: the authoritative shipping command supplies the verified delivery event. Editable account memory and client-reported quantities cannot restock the ledger.

`GET /api/world-supply` exposes the counts, jobs, destinations, and eligible shipping maps. Authenticated, CSRF-protected `POST /api/world-supply/{quote,produce,dispatch,cancel}` handles factory actions. Purchasing endpoints accept map context and validate it against the world directory.

## Catalog coverage and verification

Run `node scripts/audit-world-items.mjs` to compare authored world placements, base GLBs, renderer IDs, native definitions, market SKUs and finite supply identities. The current review covers 47 worlds and 5,431 placed instances: all 613 economy SKUs and 46 authored GLB/GLTF files already exist in the market. Thirteen previously unlinked whole-model placements across twelve worlds now point to their existing purchasable entries. World names and placement aliases are searchable in the market and factory; duplicate SKUs are not created.

`public/js/world-factory-recipes.js` provides deterministic processing and packing plans for every native, GLB and care item. Recipe names, stage times, stock counts and container capacities sent by clients cannot override the server's plan. Production receipts, stage completion, sealed dispatch, voyage binding, full unloading and stock debit are tested together. Old in-progress timed orders remain compatible and finish once.

Earned-only quest collectibles keep their existing ownership rules. The four Ironwood Prison keepsakes remain earned and account-bound; factory production cannot mint replacement quest licenses. They remain visible in the market with their earning instructions.

## World Item Factory map

Choose **World Item Factory** in Maps → Factories, or open `model-explorer.html?environment=world-item-factory&autoplay=1`. It is a permanent shared destination, featured in the map picker and included in the offline map manifest, atlas, public directory and supply destinations.

The production campus has four physical stations: blueprint/component intake, assembly, quality verification, and sealed packing/dispatch. Walk to the marked operator pad and press **E / Use** to open that stage's production workspace. The Quests control opens the factory workspace on this map. The campus uses the same procedural geometry for browser rendering and server collision. Its signs are scalable/high-resolution, and the bay lights reflect confirmed running or paused work when the factory board refreshes.

Use the physical gateways to Hormuz Shipping, the World Commons, and Atlas engineering. Reciprocal gateways from Jebel Ali and the Atlas factory return to the World Item Factory. No gateway completes a delivery or creates stock.

## Detailed batch framework

Every item now has a versioned plan and fingerprint, an immutable snapshot of its native/model identity and game behavior, an abstract game bill of components, and twelve operations across the four stages. The server records operation starts and completions. Quality checks and sealed packing each produce a batch receipt. These game-factory checks do not replace official Atlas certification. Component procurement is represented in the quoted MZK cost; the abstract component list does not remove extra finished items from world stock.

Use **Inspect operations & trace** to view the saved item blueprint, station operations, checks, events and the batch's stock lots. Pause freezes progress, including across server restarts; resume preserves remaining work without charging again. Paused orders still count toward the twenty-active-order limit and can be cancelled once for their original cost. Older timed and four-stage batches remain compatible.

Packed output creates a counted factory lot. Dispatch reserves exact lot quantities in order; split shipments retain their lot references. Cancelling returns those exact units. Only verified final unloading credits the receiving inventory and records a stock receipt. Historical warehouse stock is marked as legacy stock instead of receiving invented manufacturing proof.

Recipe previews are compact in the catalog; full per-item blueprints are fetched on demand through `GET /api/world-supply/recipe?itemId=...`. `GET /api/world-supply/trace?productionId=...` (also `shipmentId` or `lotId`) follows the saved production→lot→shipment→stock receipt references. Authenticated pause/resume actions use the same CSRF and idempotent request rules as production.

## Strait distribution challenges

The World item factory board now offers six prepared deliveries: cargo rockets, inert training collectibles, Builder metal, port repair tools, community care supplies and factory freight terminals. Each challenge selects its canonical item, batch quantity, destination warehouse and actual Strait sea route. Produce the missing units, dispatch them, and complete the normal loading, passage and unloading controls. Editing any selection clears the challenge binding; the server independently verifies every requirement.

Rocket and training collectibles pack individually, one per container. Four sealed units fit a feeder manifest. A challenge records completion only after the authoritative delivery reaches its destination with the required 85% or 90% cargo quality. Lower-quality delivered goods still reach stock, while the challenge remains incomplete. Completion never adds another currency reward; normal capped freight rewards continue. Counts and completion history survive reloads and duplicate requests.

When any central catalog stock falls below 250 units, the board also offers a restocking task for that item. Depletion remains in the shared ledger; generating or refreshing a task never creates stock. Generic factory shipments continue to support every registered item and available map, including copied shipping worlds.

Builder cards and the standalone map editor preserve the server supply identity and current available/world counts for native and authored models. An explicit zero at a supplied map remains zero even when central stores have stock; personal prepaid material pieces stay a separate balance.

## Recent integration review

Reviewed the latest five first-parent commits through `a16af59d`, including factory staging, finite supply and Ironwood earned-item merges, against the existing shipping and market paths. Subsequent shared-radio, boat-control and native-resort merges were also checked against factory freight and warehouse inventories. Certified Atlas model handling remains a reusable personal-item transfer; bulk manufacturing is the path that creates paid stock for distribution. Quest-only licenses keep their earned ownership rules.

The review fixed wallet connection migration for paid production, shipment ownership/reservations, factory proof ownership, credits and saved reward caps; connecting an Ethereum wallet no longer strands those records or permits replayed charges. It also fixed same-SKU display collisions between independent rocket owners at proving grounds. Existing scenery, catalog browsing and AI demonstration activity do not create global stock.
