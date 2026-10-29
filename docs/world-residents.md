# Contextual world residents

Open the **People & favors** control in a shared map. Walk near a resident to
start a conversation, type a question, or use a suggested reply. Their profile
shows their background, strengths, current activity and familiar contacts. The
nearby conversation feed follows exchanges between residents.

Residents can also walk over to welcome a nearby visitor, stopping with personal
space on the same public floor. One resident approaches a visitor at a time;
conversations and assigned work take priority. The greeting can be heard after
audio is enabled, and a small invitation card appears without opening People or
blocking movement. Choose **Talk**, **Join**, **Something else**, or **Not now**.
Declining an activity gives the visitor a two-minute break from new suggestions.

Ask **What can we do together?** or type a similar question to receive a current
map suggestion. Joining marks a public activity approach on the local map. Walk
there, then choose **Confirm arrival** in the invitation card. **End visit**
clears the marker. Visits expire after ten minutes; travel or removal of the
destination cancels them. These visits award no currency or quest credit and do
not enter a native match automatically. At the destination, use its own controls
to play, watch or work. Daily favors remain a separate activity.

**Share a recent experience** describes completed resident work, practice,
landmark rounds or teamwork. Nearby residents also exchange those experiences
with each other and remember what they learned. Private player questions are
kept out of those public exchanges. Recipient-only dialogue, invitations and
speech captions are filtered from other visitors' HTTP snapshots.

Residents adapt to the location: musicians rehearse, dock crews review departure
plans, ground crews practise flight briefings, sports hosts work beside the
playing area, and makers discuss projects in saved Builder maps. The casino
keeps its specialized dealers, guests, service queues and twenty-two-person cast.
Other maps use a bounded population of up to twenty-two people where their
public areas have sufficient clear floor space.

Needs influence work, practice, rest and social plans. Practice has multiple
steps, outcomes and gradual skill improvement. Conversations alternate speakers,
refer to local activity and build bounded memories and relationships. These are
local game rules; no external language-model service is required. Practice does
not change the odds of casino games or replace native sports AI.

Ask whether a resident needs help, review the offer, and accept a daily favor.
The map marks the public check-in, supplied collection point, tour stops or
resident introduction. Walk there, stop safely, confirm the checkpoint in People,
and return to the contact. Introductions require speaking to the marked person.
Completed favors award score plus reputation, skill experience and a badge once.
They do not spend or award MZK. Travel cancels an active favor; an ordinary reload
restores its current state.

Arcade and hockey menus and controllers have **People & favors** links to a
walkthrough of the exact same map. Solo play also offers this entry. The shared
walkthrough uses the existing guest/account access flow so conversations and
progress can be saved. Native match controls continue in the sports game page.
Basketball walkthrough visitors enter as spectators.

Preferences and earned resident progress follow the authenticated account between
maps. Character memories are keyed by map and resident, keeping separate people
distinct even if their generated names match. Existing room saves migrate when
opened. Server restarts, saved Builder worlds and master-runtime backups retain
the records through the existing room store. Client-writable Backpack data cannot
grant reputation or skill progress. Active favors, positions, wallets and score
are not copied between worlds.

Where a verified indoor lounge or lobby has room, runtime seating, planters and
notice furniture enrich its public area. Full footprints and approaches are
checked against floors, objects, doors and reserved routes. Unknown interiors,
active courts, firing lanes, runways and water are excluded. Runtime dressing and
resident migration leave authored layouts and placed items intact. Translated
saved maps use their transformed arrival point for fallback resident placement.

The shared implementation is in `server-resident-life.mjs`,
`public/js/resident-personalities.js`, `server-resident-dialogue.mjs`,
`server-resident-progress.mjs` and `server-world-residents.mjs`. Runtime dressing
uses `server-resident-furnishings.mjs` and `public/js/resident-furnishings.js`.

Resident designs also include map-specific details: park locals wear moss or
flowers, harbor crews carry satchels or scarves, and other maps draw from local
accessory combinations. Outfit patterns, detail colors and mossling fern,
blossom or mushroom growth vary by resident and remain stable across reloads.
Saved appearance fields override generated defaults. Botanical head details
hide under construction and security headwear. These visual details share the
existing animation rig and do not enlarge resident collision footprints.

Some locals now use the existing built character designs. Parks can include
forest rangers and moss golems; arcade residents can include clockwork knights
and friendly or spectral spirits; community, music and creator maps can include
travelling merchants and friendly spirits. Selection is stable per resident and
map, with ordinary residents retained in each cast. These are visual designs on
the same resident actors: local conversation, objectives, favors, relationships
and saved learning still use the resident system. Their design appears in the
People profile. Hostile creature behavior is not added to public residents.

Built designs have resident-sized silhouettes, local color variations and
movement, speaking and greeting animation. Shared work props remain available.
Safety and sports uniforms and the specialized funhouse cast take precedence.
Older saves receive missing detail fields without replacing saved appearance
choices. Set `appearance.characterModel` to `none` to keep the standard rig, or
to a supported friendly built design to choose it explicitly in resident data.

**Play a riddle**, **Would you rather?**, and **Make a silly story together**
start short conversational mini-games from the resident conversation panel.
Type a guess or a story sentence, or use the offered follow-up buttons. Riddles
provide a hint before revealing the answer after a second missed guess. Stories
finish after two contributions. **End our mini-game** ends a round, and inactive
rounds expire after five minutes. Each player/contact has one current round;
starting another replaces it. These casual rounds do not award currency or favor
progress. Navigation questions and daily objective commands remain available.

**High five!** and **Show me your dance** trigger short resident celebrations.
Mosslings, foxfolk and automatons describe their own signature moves; local joke
and would-you-rather topics draw on the map. Ordinary and built resident designs
animate the celebrations through their existing visual models. Conversations
and game replies retain the existing nearby-player access and private speech
routing. Casino staff and fitness trainers keep their specialized conversations.

The humor library contains 35 riddles, with local selections for map activities
and character forms, and joke sets for 20 map themes. Rangers, merchants,
clockwork knights, moss golems and both spirit designs have their own jokes.
Casino staff combine their duty-specific jokes with the expanded library, and
gym residents use fitness jokes. Riddle and joke counters advance independently
of ordinary conversation so asking directions does not skip the next item.
Each local pool cycles without repeating until exhausted, and rotation counters
follow the existing server-owned contact memory. Natural guesses such as
“It's a compass!” are accepted, including answers that otherwise resemble a
navigation or skill question.
