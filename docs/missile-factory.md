# Missile & Rocket Factory

Enter the permanent public factory from **World menu → Factory**, the explorer
options, or `model-explorer.html?environment=muzikaz-missile-factory&house=muzikaz-missile-factory&mode=multiplayer&autoplay=1`.
It uses the existing multiplayer room, account wallet, Backpack, resident AI,
local/world maps and construction vehicle controls.

## A production shift

1. Walk to **Procurement & jobs** and press **E / Use**, or open **Factory & jobs**.
   Buy an **Aster Training Missile** parts kit for **180 MZK**, or an **Orbit Cargo
   Rocket** kit for **320 MZK**. The purchase starts one saved work order.
2. Visit **Component fabrication**, **Rocket assembly**, then **Quality & systems
   test**. Operate each station from its marked pad and let its cycle finish.
   Other players share machine reservations. The panel shows your next task and
   distance; the local map lists each work area.
3. Meet a crew member and enable **crew assistance** to shorten subsequent
   machine cycles by 25%. The crew also offers local walking favors through the
   existing People & favors system.
4. Enter the existing factory dump truck, stop in **Freight loading bay**, and
   choose **Load factory truck** in the production panel. Follow the marked lane
   to **Dispatch & collection**, stop, and choose **Deliver truck load**.
5. Exit the truck, approach dispatch, and **Collect to Backpack**. The completed
   detailed 3D model can be placed using the existing Backpack deployment flow.
   Completed jobs build saved fabrication/logistics skills and factory badges.

The training missile is an inert game model. Both recipes use fictional game
components and timed fabrication interactions. Existing cranes and earthmoving
machines remain available in the plant yard through their shared controls.

## Markets and Map Builder

Take completed items through the east gate to the neighboring proving grounds
for reusable launch and cargo landing tests. Successful tests unlock the
underground mountain facility. See [proving grounds and compound access](factory-proving-grounds.md).

All nine factory item types are available in **Marketplace → All game items →
Factory & engineering** and **Map Builder → ITEMS → Factory & engineering**:
the training missile, cargo rocket, shell fabricator, assembly jig, calibration
rig, procurement terminal, dispatch terminal, roller conveyor and freight
loading bay. Purchases retain their interaction settings in Backpack. The
existing crane, dump truck, excavator and bulldozer remain in the vehicle catalog.

Choose the **Missile & Rocket Factory** Builder template or copy the public map
to create an editable factory. Move, rotate, resize, duplicate or remove each
station, vehicle, display and crew member independently. The inspector exposes
station roles and operator offsets; the local map and live production prompts
follow those edits after publishing. Station deletion or disabling removes its
interaction. Editing a machine during a cycle requires repeating that cycle
without charging for another kit. Missing required stations prevent a new paid
order. Factory equipment can also be added to an ordinary Builder map while
keeping that map's environment.

The complete native game item catalog is market-listed. Eleven existing local
3D environment assets that were previously missing market offers are included
alongside the factory additions.

## Persistence and validation

Production orders, machine leases, charges, completion receipts and progress are
stored in the existing server user database. An order survives map travel,
reconnection and server restart. Each wallet can have one current order. Buying
another kit requires collecting the previous model; leaving does not refund it.

The server checks station distance, work order, machine timing, crew proximity,
truck type, the same loaded truck and dispatch delivery before creating an item.
Collection grants once. An immutable creation receipt authorizes deployment;
editable wallet item metadata cannot mint factory models. UI or localStorage
changes cannot bypass MZK spending or production.

Run `node --test test/*factory*.test.mjs`
for factory checks, plus `npm run build && npm run check` for the static site.
