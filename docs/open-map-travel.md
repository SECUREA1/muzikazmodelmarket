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

Spoken audio starts after the player's first gesture. Each map has one short
introduction per page session. Returning to a previously visited map does not
replay it. Initial snapshots establish the job baseline without reading existing work
or past traffic aloud. Subsequent new jobs, changed objectives, completions,
walking quests and requested game interactions are announced once. Nearby NPCs
and periodic traffic chatter remain visible without automatic speech. Private
calls stay restricted to their recipients, and stale or muted calls are discarded.

Open **Settings → Audio settings** to mute all audio or independently mute world
introductions, new jobs and map announcements, NPC conversations, game effects,
and shared media. Changes preview immediately; **Save settings** persists them to
your member account. Muting effects preserves the effects volume slider. Local
radio replay/enable controls cannot override a Settings mute. Captions remain
available throughout.

Spatial audio defaults on. World effects and shared media use HRTF positioning
relative to the camera, with distance falloff and orientation updates as you
move or look around. NPC browser voices use distance-based volume; browser speech
synthesis does not expose a Web Audio source for stereo positioning. Map
introductions and radio-style objectives stay clear regardless of distance.
NPCs and AI contacts prefer natural, neural or enhanced voices installed in the
browser, with a stable voice per character and restrained personality-based
pacing. Voice loading is allowed a brief grace period; an unavailable online
voice can fall back locally. Spoken game shorthand is expanded without changing
captions, and long replies receive enough time to finish. Voice quality depends
on the voices available on the player's device.

Disabling spatial audio centers world sounds and removes distance falloff.
Browsers without speech retain visible captions and status; those without a
panner retain distance attenuation.

Validation includes authoritative travel/switching/respawn tests, bounded model
presentation and reconnect tests, announcement privacy/deduplication tests,
mobile and desktop loading/touch checks, and live controls during map use.

The broader 137-test transport regression selection passed. Additional checks
covered respawn, model-stream completion and live movement/boarding in the
airport and docks. An unrelated existing PvP test expects a laser cooldown
rejection that the HEAD implementation also does not produce; this was
reproduced with the unmodified room implementation and left outside this fix.
