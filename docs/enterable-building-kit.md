# Enterable building kit

The builder and native Backpack catalog now include 25 building assets:

- Hospitality: Frontier Tavern, Dusty Trail Saloon, Courtyard Café, Roadside Diner, Grand Restaurant, Boutique Hotel, Roadside Motel.
- Commerce: Civic Bank, General Store, Corner Bakery, Community Supermarket, Fashion Boutique.
- Services: Neighborhood Pharmacy, Medical Clinic, District Police Station, District Firehouse, Town Post Office.
- Industrial: Freight Warehouse, Artisan Workshop, Motor Garage, Service Station.
- Community and entertainment: Public Library, Neighborhood Center, Picture House Cinema, Live Music Club.

Each building is a procedural 3D shell with a collision floor, open front and rear passages, walls and a roof. Selected buildings include service counters, interior partitions, a porch, a stage or a vehicle bay. Most interior floor space is left open for the creator's furniture, avatars, props, drawings and interactive devices. These buildings do not create bank accounts, paid services or automatic item transfers; add the existing ATM, shop, quest or media devices to provide gameplay functions.

In **Environment Builder**, use the searchable **25 Enterable Buildings** section or the Buildings filter. Select or drag a building onto the map. **Interior View · Roofs Off** hides roofs in the editor and excludes them from placement raycasts. Select a building and use **Enter Selected Building** to focus the camera inside. Roofs remain present in the published game.

Use **Open my Backpack**, choose a placeable item, then click its interior floor or an existing item's top. **Refresh Backpack items** updates the dedicated Backpack filter. GLB assets, native props and custom image/extrusion items retain their saved model, depth, collision and gameplay definitions. Placing an item creates a scene instance and leaves Backpack ownership intact. Save or publish the map to retain the instances; published playback honors their authored elevations so interiors are not snapped to a roof during later asset loading.

The page supports 40, 80, 120, 160, 240 and 320 metre maps. Four additional district generators provide Frontier Main Street, Civic & Market Quarter, Hospitality & Nightlife Row, and the 25-Building Town. District templates expand to at least 160 metres; the full showcase uses at least 240 metres. Their buildings, furniture and interactive terminals remain separate editable scene objects. Publishing uses the existing server save and world-directory registration.

The building browser, search, Backpack buttons and roof controls are available on mobile and desktop. The editor is free to place objects; direct deployment from the live-game Backpack follows the existing marketplace ownership rules.

Newly placed buildings now receive editable interactive devices automatically when **Automatically furnish new buildings** is checked. Use **Auto-furnish interactive spaces** for existing buildings, or **Furnish from my Backpack** to use owned native interactive devices. The deterministic placement preserves entrance corridors, avoids occupied cells, honors building transforms, and skips previously furnished instances. It creates no purchases or wallet transfers. Taverns receive jukeboxes, poker, slots and trivia; stores receive market terminals; cinemas receive video equipment. Generated common spaces upgrade to experience version 3 with walk-in market and arcade buildings.

Video screens offer **Share my camera on this screen**, **Watch live camera** and **Stop my camera**. Camera access requires an explicit browser permission action. The camera sends video only; the existing room microphone supplies voice independently. Authenticated members must stand within five metres of an active video screen to begin sharing. Signaling and viewing stay within the room; camera sessions expire after fifteen seconds without a heartbeat. Leaving the world, removing the screen or stopping sharing stops the capture tracks. Camera frames are peer-to-peer and are not stored in server backups. HTTPS, WebRTC support and working network connectivity are required. Deployments can set `window.MUZIKAZ_RTC_ICE_SERVERS` with their STUN/TURN configuration for restrictive networks; the default supplies STUN only. Real two-device playback and mobile permission prompts require browser validation.

The shared world loader counts visible terrain as renderable even when it is an explicit collider. Named invisible collision helpers remain hidden. Asset requests have a thirty-second timeout and one retry. Failed replacements retain the prior world; superseded or unloaded requests cannot attach a stale map. `test/environment-playability.test.mjs` checks empty builder maps, every repository playlist environment, collision/spawn geometry, retries, cancellation and automatic furnishing. These checks do not guarantee external media availability or every live server's runtime state.
