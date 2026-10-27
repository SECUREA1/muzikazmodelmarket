# Strait of Hormuz Shipping Academy

The [factory supply chain](factory-supply-chain.md) adds a certified-model Atlas
Export voyage and exchanges delivered parts for new factory production credits.

Open **Strait of Hormuz · Shipping Academy** in the world picker, or use the **Hormuz shipping sea portal** beside Neon Marina in the Neon Docks world. The reciprocal dock portal returns to Neon Harbor. This is a shared, server-hosted 2.8 km arcade sea region with condensed geography inspired by the strait, rather than a real navigation chart.

## Start a delivery

1. At Jebel Ali, use **Board cargo ship** on the sports action panel to take the free Gulf Runner feeder.
2. Open **Shipping chart and cargo quests** and accept **Dock induction**. This short basin circuit teaches the complete loop before a longer international run.
3. Use **Auto** to load each container. It alternates port and starboard; the chart also offers manual load and remove controls. Wait for the crane between lifts. Excess weight, an uneven manifest, an unsecured load, and handling cargo away from the correct dock are rejected by the server.
4. **Secure cargo**, then **Depart on route**. Automatic passage follows each required checkpoint. Steer to take manual control, then choose **Follow shipping route** to resume.
5. Follow the buoy markers and chart to the assigned berth. Once the route is verified, slow and choose **Dock safely**. Unload every container to complete the manifest.
6. The server saves the MZK reward, delivery statistics and cargo stock. Use the dock supply exchange to turn stock into existing tools and prepaid building materials.

The actual bridge and water stay visible during play. The chart is an optional menu that releases movement, held actions and pointer lock. VR uses the real bridge, tracked headset view and native controller menus for contracts and cargo actions.

## Ports, routes and lessons

The region places the Persian Gulf west and Gulf of Oman east, with the Iranian coast, Qeshm and Hormuz islands north and Musandam south. Six ports connect Jebel Ali, Ras Tanura, Bandar Abbas, Qeshm, Khasab and Fujairah. Separate inbound and outbound lanes illustrate traffic separation. Nine contracts include dock induction, building supplies, island provisions, relief cargo, machinery, energy equipment and staged Atlas factory exports. Advanced materials and energy contracts carry eight units; the machinery return carries twelve heavy units and requires the tanker.

Ships have full hull collision, visible working decks, containers or tanker piping, bridge instruments, radar, navigation lights and propulsion animation. Cargo weight affects acceleration, stopping and turns. The feeder is available immediately; the container carrier unlocks after two deliveries and the tanker after five. Marketplace ownership of a vessel also grants access.

Fictional pirate launches, mine warnings, floating debris and squalls create cargo challenges. **Escort** protects shipments against pirates; **Radio** requests safe passage or weather guidance. Unresolved hazards and hull damage lower cargo quality and rewards. AI ships follow the shipping lanes in the same multiplayer room. Existing explicitly equipped weapons retain their normal game actions; cargo buttons do not double as weapon triggers.

## Live companies and the Freight League

Gulf Link Logistics, Oman Freight Cooperative and Strait Relief Shipping operate real vessels in the shared map. Their crews alternate balanced loading, secure the cargo, sail ordered channel markers, moor at dedicated commercial terminals, unload and choose a connected return shipment. The live chart shows each captain, cargo, route, progress, destination and estimated arrival. Select a company marker to inspect its voyage while keeping control of your own ship.

Commercial terminal wings have warehouses, dock staff, live dispatch boards and animated cranes. The hook and cargo transfers follow confirmed loading and unloading events. Port stock, imports, exports and outstanding demand change as ships work. A player contract can offer up to 15 extra MZK for a shortage at its destination; the agreed bonus is fixed when you accept, and the starter induction reward stays unchanged.

Join **Strait Freight League** in **Live fleets & league** before accepting a new manifest. Shared rounds run for 20 minutes after a 15-second preparation period. Loading and departure are allowed during preparation; only completed deliveries during the round score. Scoring uses the published route distance, cargo units and delivered quality, so circling or client-reported distances cannot inflate points. AI companies score only after actually unloading their manifests.

The standings freeze when a round ends. Claim 90, 55 or 30 MZK for the first three places, or 15 MZK for completing a scored delivery at a lower rank. Claims remain available for 24 hours and share the existing 400 MZK daily shipping cap. Rewards commit once to the same wallet as delivery rewards, even after reconnecting or retrying a request. The next league starts automatically while the region is active.

AI crews yield to player vessels, use their own commercial loading berths, and cannot be boarded or taken over. A pause or server reload does not instantly finish their journeys or create offline deliveries. Their manifests, warehouse state and standings persist in the shared room.

## Connected rewards and inventory

The **World item factory** adds finite, item-by-item native and GLB supply to these routes. Build discounted batches, dispatch a counted manifest, then complete the normal sea passage to restock any map warehouse or the central world inventory. Exact item quantities accompany the shipping job; stock credits only after full unloading. See [World supply](world-supply.md) for production, depletion, map stores, and simulated onward transfers.

MZK rewards are capped at 400 per account per UTC day. Delivery and exchange receipts are idempotent, and progression and stock live outside editable account memory. Port handling, route progress, vessel unlocks and rewards are calculated on the server. Leaving the vessel, defeat, relocation, travel or an expired connection cancels an active contract.

Delivered provisions exchange for a Medkit unlock or ten prepaid wood pieces. Machine parts exchange for five prepaid metal pieces or one 20 MZK factory production credit. Tool stock exchanges for a Scanner or professional fishing rod. These are the existing Tools, fishing, factory and Builder systems, with their usual ownership and usage rules. Stock appears in Marketplace and the Tools pouch as **Exchange at shipping port**. Raw stock is exchanged at docks; unlocked items follow the normal marketplace rules.

## Validation

Focused server, economy, route, geometry, vessel, control-isolation and rendering tests cover the shipping extension and existing harbor/fishing behavior. Browser checks exercise mobile layout, exact port selection and the real server gameplay loop. VR menu and bridge tests use simulated controller/session state; physical headset testing is separate.
