# Null Sector underground bunker

Enter **Maps → Bunker campaign** or use the World Item Factory gateway. Arrival
is an exposed surface apron. Follow the armoured descent twelve metres below
ground, open the perimeter blast shutter, enter the six-room bunker, and close
the shutter behind you. The whole descent and return route use physical floors
and ordinary walking controls.

## Protection and alarms

**Defense** opens Shelter command: current threat, impact countdown, personal
cover, power, filtration, relay, entrance seal, crew response and active quest.
Surface airstrikes begin automatically; the first warning starts after 24 seconds
and impacts follow 16 seconds later. The existing automatic nuclear event keeps
its original timing. Alarms, surface impact effects and native beacon colours
follow the shared room clock. Alarm sound uses the existing sound preferences.
Underground viewers retain their shelter view instead of seeing sky explosions
or falling ash inside the rooms.

Protection is checked from actual player position and live equipment:

- The exposed surface, including ground directly above the rooms, takes impact
  damage. A map name or shelter marker alone grants no protection.
- Underground rooms reduce blast damage; a closed, present perimeter shutter
  provides full blast protection.
- Fallout protection additionally requires the power core and filtration unit
  to be present and enabled. Turning them off or removing a required component
  changes protection immediately.

These are game rules. Impact receipts persist across room restarts and prevent
repeated damage from replaying one strike. Fallout uses bounded exposure pulses.
Acknowledge warnings from within reach of the physical alert console; an
acknowledgement does not cancel the threat. The alarm remains active through
recovery until the actual all-clear.

## Crew and operations

Nyx coordinates shelter ingress and closes the shutter. Rook checks backup power
and filtration. Patch checks medical supplies, the emergency locker and water.
Echo checks the archive and communications relay. They walk on real collision
routes, operate supported controls, wait for players using those controls,
remember completed checks, and return to ordinary routines after all-clear.
Missing or blocked equipment prevents a successful check. Moving or removing an
authored crew member in Builder keeps the existing identity and saved progress.

Open **Quests** for six independent operations: Black-start protocol, Ghost
archive, Safe passage, Seal the vault, Deep stores and Hold the signal. Follow
each operation's three marked steps in order. Switch and seal objectives require
the correct final state, so turning a required system off cannot finish a
readiness check. Crew conversations can describe the requesting player's current
objective. Crew work never completes a player's quest or issues player rewards.
Operations award world score; equipment purchases use MZK.

## Market, Backpack and Builder

The [bunker collection](../builder-market.html?collection=bunker) contains 24
native models with dedicated SVG artwork, plus the complete editable map.
Curated shelter, command and survival kits link to their canonical item offers
and actual MZK prices. Purchases use the existing authenticated transaction,
finite supply, bundle and Backpack systems. The map's component breakdown lists
each item and its exact quantity. Copying the template does not grant ownership.

All structures and equipment remain individual editable components. The existing
**Interior view / roofs off** control hides the ceilings and overburden; exterior
view restores them. The editor display table and grid sit below the bunker floor
so they cannot obscure the underground rooms. Copied maps retain their shelter
configuration and underground emergency objectives.

`bunker-world.mjs` authors the map; `public/js/bunker-config.js` defines depth,
locations and crew. `server-bunker-defense.mjs` owns hazards and protection;
`server-bunker-response.mjs` owns crew response. Native factories and metadata
live in `public/js/bunker-models.js` and `bunker-items.js`. `bunker-quests.js`,
`bunker-defense-ui.js`, and `bunker-market.js` connect operations, status and
commerce. The repository environment manifest mirrors the live constructor.
