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

Spoken audio starts after the player's first gesture. Each map visit has one short
guide explaining its activities and how to find jobs or help. Returning to a
previously visited map plays its guide again; repeated snapshots stay quiet. Initial snapshots establish the job baseline without reading existing work
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
NPCs, AI contacts, map introductions and optional chat reading use two app-owned
neural voices: **MUZIKAZ Natural Female** and **MUZIKAZ Natural Male**. The server
generates speech with the local Kokoro model; phones and browsers play the same
24 kHz WAV output even when they have no installed voices. No speech API key or
external speech provider is needed. These are generated voices, not recordings
or clones of players. Model and speaker attribution is in
[voice-engine/NOTICE.md](../voice-engine/NOTICE.md).

In **Settings → Audio settings**, choose **Automatic**, **Female** or **Male**,
select a generated voice, and use **Preview voice** to hear it. Optional real
device voices remain selectable. Known robotic engines, unavailable selections
and wrong-language fallbacks are excluded; the app does not silently use the
browser's unknown default. Preview reports errors while captions remain visible.
Changes preview immediately and save to the member account with the other audio
preferences.

Playback stays at native pitch through a direct gain path with no added reverb,
delay or HRTF on speech. NPC distance changes adjust volume. The unrelated
continuous battle synthesizer is removed from all pages that host the NPC game.
One speech owner prevents radio, NPC and chat voices from competing, and passive
gestures do not trigger an extra tower introduction. Generation and playback
have separate deadlines so model startup cannot clip a short reply.

`npm run build` prepares a checksum-pinned 109 MB model from the official Kokoro
release using `curl`, then builds the site. Models stay in `.speech-models/`
(outside Git and public assets); `MUZIKAZ_SPEECH_MODEL_DIR` can select another
cache directory. The build converts signed convolution tensors to mathematically
equivalent unsigned tensors for the CPU runtime. The CPU-only Node inference
process serializes work, recycles after two jobs, and stops when idle. Typical
short replies generate in several seconds; repeated text is cached in bounded
private server memory. Public speech requests have text, queue, deadline and
rate limits. Hosting must run the Node server rather than only serve static
files. Render's build command prepares the model automatically and skips CUDA.

Static samples are available at
[`female-preview.wav`](../public/audio/voices/female-preview.wav) and
[`male-preview.wav`](../public/audio/voices/male-preview.wav). Run
`MUZIKAZ_TEST_NEURAL_VOICES=1 node --test test/neural-voice-engine.test.mjs` for
real inference/cancellation checks, and `python3 test/neural-speech.browser.py`
for real inference → HTTP → browser audio playback. Controlled voice-list tests
only test selection and lifecycle; the real tests validate generated waveforms.

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
