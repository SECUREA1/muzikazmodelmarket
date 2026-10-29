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
