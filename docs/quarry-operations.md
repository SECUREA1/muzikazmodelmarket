# Surface Mine · Quarry & Materials

The permanent `surface-mine-quarry` map is available beside Skyline Construction in the construction map directory. Its native machines and plants are also available to Builder. Editable copies carry the quarry and earthworks configuration.

## Working the site

Enter the six-metre pit using the access ramp. Operate either excavator, either haul truck, or the bulldozer using the existing nearby interaction, machine dashboard and sports action controls. Excavators scoop actual ground or loose piles, load nearby trucks and dump material. Trucks haul and tip their cargo; the dozer pushes and grades loose ground. The second excavator and truck work the separate topsoil strip.

Tip raw material into the marked screen-feed pad. Walk to the plant controls and open Quarry operations with the nearby interaction or toolbar. Engage or Park the selected screener, crusher or stacker. The transfer conveyor sends screened stone to the crusher. Stop all parks the entire processing line without deleting material. Hide/Show keeps the panel available while freeing the view; closing it releases its input state. No fullscreen control is added.

The named AI crew can operate the real excavation and haul machinery. Start AI operator in the quarry panel to assign the plant operator as well. Machines retain their normal human boarding and ownership rules. The plant operator must actually be at the controls; empty feed does not produce material.

## Processing and stock

Every quantity is cubic metres. Screening gravel produces 20% sand, 20% fines and 60% sorted stone. Screening stripped soil produces 75% screened topsoil and 25% organic mulch. Crushing sorted stone produces 75% crushed aggregate and 25% fines. Raw gravel must pass through the screen first. The stacker deposits buffered products into their labelled physical stockpiles, where machines can scoop, push and haul them again.

Book stock from the product pile reserves the selected whole quantity from real output. The room saves this reservation before crediting the shared warehouse. If a request is interrupted, Complete booking retries that same reservation without duplicating material. Warehouses start with zero quarry products; factory production cannot manufacture them.

## Deeds, freight and use

Choose an owned deed, material, quantity and shipping lane in Quarry operations. The displayed MZK price is charged once, and the order reserves finite warehouse stock. Travel to freight harbour to carry the existing shipping manifest. Deed inventory is credited only after sea unloading and the existing last-mile truck/courier delivery, rather than immediately on purchase. Unsent orders can be cancelled, returning their stock and payment.

Travel to selected deed changes the native world in place. On your own deed, use delivered material ahead of your character to prepare a seed-ready garden bed, lay an aggregate path/base or create a recoverable material storage bay. These placements consume delivered stock and are restored from saved material-use records on reconnect. Recovering a nearby storage bay returns its material once. Seed-ready beds prepare space for gardening; this addition does not simulate crop growth.

Existing freight dispatch can transfer your delivered deed stock to another owned deed or a shared construction/quarry receiving site. Quarry warehouse purchases must use the paid material order, and personal quarry warehouse stock remains restricted to its deed owner. Regional lots cut from a quarry are flat deed spaces with their own material inventory, rather than inheriting the parent pit simulation.

## Validation

`test/quarry.test.mjs` covers the native map, editable models, real truck ramp support, source filtering, processing yields, typed material conservation and operator access. `test/quarry-supply.test.mjs` covers durable booking recovery, ownership, stock and payment idempotency, cancellations, actual sea/last-mile delivery and deed material use. `test/quarry.browser.py` exercises the native mobile game, cab interaction, digging/loading, plant controls, Hide/Show, ordering and in-page deed travel.

## Connected plant and Trading Market

The expanded plant has thirteen individually editable conveyor sections: raw intake, three screened-stone transfer sections, crusher receiving intake, two product elevators, and six segregated stockpile conveyors. A steel gantry supports the raised stacker. The elevated stockpile belts leave at least six metres of clearance above the haul road; their supports do not create an invisible barrier in the truck lane.

The server checks the actual intake and discharge positions of every conveyor. Removing, disabling, or moving a section out of alignment stops the affected transfer and retains its feed or buffered material. Other connected product routes can continue. Reconnect the native belt to its authored endpoints to resume. Existing quarry copies without a configured conveyor network retain their previous operation.

Plant dashboards show actual m³/s and cumulative processed volume. Plant feed rate offers 25%, 50%, 75%, and 100% of rated capacity, validated at the operator's controls. Conveyors display colored aggregate only while real material moves; powered but empty plants do not manufacture visual output. Coarse stone piles have bounded instanced grains, while sand, fines, topsoil and mulch use their true terrain colors. Six live pile labels distinguish loose pile volume from the processing buffer. Neither is yet warehouse stock.

All six processed products appear in the public Trading Market and in-game Quarry materials section, using their canonical `quarry:*` identities and MZK/m³ prices. Availability reads only booked public-quarry warehouse stock, excluding loose piles, personal deed inventories and cargo already reserved for an order. Empty offers remain visible as production opportunities with zero availability. Each offer links to its own source quarry and selects that material in the real ordering panel. `/model-market.html?source=quarry` opens the public quarry filter directly.

The market does not grant free stock or add these materials to factory manufacture. Purchases use the same paid `order-quarry` operation, current deed ownership checks, finite source inventory, shipping and last-mile receipt. All quarry machines, conveyors, storage bays and prepared garden/path models resolve to their existing native market SKUs and appear in the quarry template's component list.

Additional validation: `quarry-processing-network.test.mjs` covers connected/misaligned belts, feed throttling and material conservation; `quarry-layout.test.mjs` drives a real truck under the gantry; `quarry-model-flow.test.mjs` and `quarry-scene.test.mjs` verify bounded visuals and scene cleanup; `quarry-market.test.mjs` and `quarry-market.browser.py` cover market provenance, availability, filters and source-specific ordering links.

## Stockyard expansion and opening inventory

The 768m surface-mine map now includes an eastern stocking and dispatch yard, wide haul lanes, receiving and returns pads, three additional excavator/haul-truck pairs and a spare dispatch truck. The original pit, processing line and six output stockpiles retain their positions. The new low stock banks are deliberately reachable from their stationed excavators with the normal articulated collision checks active.

Eight separate physical bays start with **1,200 m³** of finite material: 160m³ raw gravel, 160m³ raw soil, 160m³ sand, 120m³ fines, 160m³ screened stone, 160m³ crushed aggregate, 140m³ screened topsoil and 140m³ mulch. Raw soil and gravel still need screening. Finished materials can be scooped and hauled immediately, or booked from their selected pile for the existing paid freight flow.

Opening stock is seeded once per saved lot. Rejoining, restarting the server, updating the layout or changing the opening-stock version does not refill a depleted lot. Existing mines gain the new stockyard patches without resetting their worked terrain, machinery, product buffers or warehouse receipts. Seed quantities join the initial material ledger rather than being reported as player excavation or delivery work.

The Stockyard inventory panel lists actual pile sources, coordinates and loose quantities. Material-by-location readings keep ground stock, machine cargo, plant buffers and booked warehouse stock separate. Selecting a pile books only that pile's typed material. In-world yard labels update as stock is scooped or booked; the original processing-output pads remain distinct from opening stock.

For truck cargo, board the loaded haul truck, drive to the weighbridge at X196/Z174, park and lower its body. **Book cargo from my truck** reserves the selected material from its real payload, retaining any other materials in a mixed load. This uses the same durable reserve-then-book outbox as ground stock, so an interrupted warehouse acknowledgement can be retried without crediting the cargo twice. Freight orders and market availability use booked quantities; material still on the land or in a machine is not double-counted as warehouse stock.

## Automatic scoop and load assist

From an excavator, open **More → Auto scoop & load** with a receiving truck parked nearby. The assist repeats the existing dig and load joint cycles, transfers the real bucket contents and checks the same terrain, reach, receiving-bed and collision rules. It can stop with a partial last bucket when the reachable face is exhausted; move to another reachable face before restarting.

Manual hydraulic or travel input, Park, explicit stop, a full/moved receiver, blocked joints, loss of focus or leaving the seat stops the assist safely. A brief heartbeat delay pauses hydraulics and material transfer; fresh input from the same operator resumes the armed cycle. A true disconnect cancels the assist. No soil is awarded for unfinished digging, and ordinary single work cycles retain their existing heartbeat pause behavior.

Stockyard validation includes actual scooping/loading at all three new stands, truck travel through the expanded lanes, once-only seed migration and restart tests, typed cargo/pile booking, lost-acknowledgement recovery and responsive inventory controls. The native browser flow also exercises automatic scoop/load, booking pre-stocked sand, market availability, freight ordering and owned-deed travel.
