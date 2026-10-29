# Resident life and map objectives

Residents combine context-specific jobs, needs, skills, memories and relationships with persistent individual names, ambitions and habits. Newly spawned characters have deterministic names and human, foxfolk, mossling or automaton forms. Existing saved names survive migration and distance culling. Each form uses the shared animation rig and job uniform.

## Activities and priorities

The authoritative room runs community planning, individual life and local object interactions. Machine operations and player-requested actions take priority. Conversations pause movement; autonomous object interactions yield to team assignments and personal rounds. Specialist factory, fitness and casino residents retain their dedicated activity schedulers. Native sports and vehicle AI retain their existing controllers.

Adult residents as well as families can form pairs. A shared assignment has preparation, work and handover stages, with a different duty for each teammate. Both participants must physically reach separate public work positions on the same floor before progress advances. Work pauses during conversation and ends if a participant becomes unavailable or its two-minute deadline expires. Contexts include music duets, nature observations, equipment briefings and local handovers.

Personal landmark rounds take residents beyond their home area. An available resident selects a nearby public landmark, verifies an outward and return route, walks to its checkpoint, spends time checking the local information and returns home to finish the round. Routes use existing floor, clearance, collision and active-area restrictions. A changed landmark, blocked route or expired deadline cancels or fails the round without credit. Small maps without another reachable landmark retain local work, practice and social routines.

Residents also operate supported nearby live objects using the same authoritative switch, information, inspection and recovery state as player interactions. Injured residents prioritize recovery. Autonomous maintenance enables switches rather than toggling them off on repeat. Players keep priority over reserved controls. Removed or unavailable operators release reservations.

## Progress and presentation

Completed rounds, team assignments and object use build bounded memories and skills. Team work builds affinity between the actual participants. The resident panel displays names, forms, ambitions, habits, current checkpoints, team responsibilities and completion counts. Asking about plans or teammates returns the live assignment.

Room saves retain live simulation state. Distance-culling archives keep names, learned skills, bounded journals, relationships and completion counters. They do not restore stale active routes or object reservations. Histories are capped at six entries per resident and twelve shared results; existing memory and relationship caps remain in effect.

These are resident-owned activities. They do not synthesize authenticated player sessions, complete a player's reward-bearing quest, spend player currency or claim a player's vehicle. Full parity with every player control is not implemented; additional game activities need explicit adapters to their authoritative controllers.

## Validation

The social integration review follows the resident changes in `d36cddc8`
(voiced contacts), `58abf2bf` (reactive residents and daily objectives),
`3857698d` (map context and saved progress), `c20d34ef` (identity, objectives
and teamwork), `20b8ef60` (bounded collision planning), and `77ab3ed0`
(solo resident simulation and conversation audio). Casino, fitness and native
game controllers retain their specialist behavior.

The integration adds collision-aware visitor approaches, addressed greetings,
public experience sharing, consent-based activity visits and audience-filtered
private dialogue. The original daily-favor rewards and requested machine-work
adapters remain separate from the new reward-free visits. Tests cover both
layers, persistence, collision budgets, map edits, personal space and client
controls.

`npm test` covers the resident planner, staged cooperation, world interactions, identity, rendering, dialogue, persistence and existing game systems. `python3 test/world-residents.browser.py` and `python3 test/resident-contexts.browser.py` exercise mobile/landscape conversation controls, live objective progress and character rendering in Chromium.
