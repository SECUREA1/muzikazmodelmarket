# Contextual world residents

Open the **People & favors** control in a shared map. Walk near a resident to
start a conversation, type a question, or use a suggested reply. Their profile
shows their background, strengths, current activity and familiar contacts. The
nearby conversation feed follows exchanges between residents.

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
