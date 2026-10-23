# Map travel, vehicle loading and spoken objectives

The public-map directory lists public destinations across all districts. The
local map remains available while styles or a previously joined connection
recover. An unavailable connection keeps the selection pending for a bounded
reconnection period; failure leaves a visible retry message instead of hiding
controls or permanently closing the room.

Vehicle, route and location selections show an immediate, indeterminate loading
display. It never captures pointer or keyboard input. Boarding waits for the
confirmed vehicle model to reach the scene, then exposes the vehicle controls
by closing the companion map. The map button remains available. A failed model
stream reports that controls are active while the model is still streaming.

Players can select another available vehicle directly from their current
vehicle, seat or lift. Travel stops and releases the previous craft and ATC
reservation. An airborne public aircraft returns to its authored stand when
abandoned through map travel. The player's active assignment is cancelled
without paying a completion reward. Reopening the current vehicle preserves
its job. A defeated player's valid map selection includes the existing respawn
behavior and retains score and discoveries. Another player's craft, AI traffic,
private destinations and invalid landing positions remain protected.

Static map footprints retain their DOM elements between snapshots. Occupancy
updates do not reorder and replace vehicle buttons during a tap. Touch boarding
dispatches once on pointer release and suppresses the delayed compatibility click.

Spoken announcements are enabled by default after the player's first gesture.
They cover new assignments, changed objectives, completions, crew jobs, nearby
guides, walking quests and radio dispatch. The shared conversation voice
deduplicates repeated snapshots and respects private recipients and mute.
Crew radio provides mute and replay controls; changing worlds preserves mute.
Browsers without speech retain visible captions and status.

Validation includes authoritative travel/switching/respawn tests, bounded model
presentation and reconnect tests, announcement privacy/deduplication tests,
mobile and desktop loading/touch checks, and live controls during map use.

The broader 137-test transport regression selection passed. Additional checks
covered respawn, model-stream completion and live movement/boarding in the
airport and docks. An unrelated existing PvP test expects a laser cooldown
rejection that the HEAD implementation also does not produce; this was
reproduced with the unmodified room implementation and left outside this fix.
