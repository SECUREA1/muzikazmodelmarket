# Advanced firing ranges

**MUZIKAZ Live Firing Range** (`firing-range`) and **Force Training**
(`force-training-range`) share the complete authoritative range engine. Force
Training retains its protected booths and classic target artwork. Both offer
five lanes, the same nine firearms, live target scoring, optics, multiplayer
competition, spectators, shopping, and Backpack access.

Both permanent destinations use their shared room even when an entry link says
`mode=solo`. A player can practice alone in that room; other players may join
available lanes. The ordinary solo training console is not their tournament
engine.

## Operations and areas

Range operations has four tabs:

- **Practice:** choose a range location, lane and team; start unlimited open
  practice, change a free lane, or watch from the safe lobby.
- **Tournament:** select Precision, Rapid fire, Endurance or Moving targets;
  configure time, rounds, shots, speed, countdown, weapon and individual/team
  competition. Starting applies the displayed valid settings before starting
  the event. The host can end open practice and configure a competition.
- **Armory & optics:** borrow any of the nine range firearms, adjust scope
  magnification and reticle, or open the marketplace to buy permanent gear.
  A live tournament locks shooting to its configured firearm. A loan grants
  neither permanent ownership nor paid use elsewhere.
- **Results:** view live standings, round results, individual/team winners and
  the final totals. Completed results remain available while choosing the next
  lane; starting the next event clears the new event's score.

The armory, start, tournament rules, market, Backpack and spectator consoles
each open their corresponding function. Placed range modules retain their own
transformed console locations. Decorative navigation stays outside collision
queries, and the safe lobby remains connected to all five firing bays.

Moving silhouettes animate in Rapid fire, Endurance and Moving targets, using
the server's target positions and speed. Paper targets remain fixed for aimed
practice. Both styles show confirmed impact marks and live scoreboards.

The headset menu sends the same server practice, tournament, lane, team and
weapon commands. Armory/market/Backpack panels leave the immersive session to
display their native popups on screen.

## Tournaments and commerce

The server owns countdowns, intermissions, round limits, lane safety, hit zones,
cooldowns and scoring. A delayed tick follows the scheduled round deadlines.
Withdrawn participants retain earned total/team points; each round has its own
standings. Stopping a live event records its partial round once.

The range uses the existing marketplace: upgrades, bundles, member listings,
Backpack, member messages, history, builder assets, owned assets and care.
Filters never activate items. Preview buttons open larger accessible previews;
closing the marketplace also closes its preview. Buying uses the existing
authenticated wallet, price checks and request receipts.

## Verification

Run `node --test test/firing-range*.test.mjs
test/authoritative-firing-range.test.mjs test/game-economy-client.test.mjs
test/in-game-market*.test.mjs` for the functional range and commerce regressions.

`python3 test/firing-range-advanced-hud.browser.py` tests the production HUD with
isolated simulation callbacks. `test/firing-range-entry.browser.py` checks actual
desktop/mobile room entry and scoring against a separately started local server;
its `--range` option selects either permanent range. Use disposable server data
for browser purchase and competition checks.
