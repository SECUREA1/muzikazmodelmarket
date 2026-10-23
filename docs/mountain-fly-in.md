# Alpine Ridge mountain fly-in

Open `model-explorer.html?environment=muzikaz-airport&autoplay=1&mode=multiplayer`.
The existing airport and its three public aircraft connect to four airfields in
a 2,000 × 2,000 metre world. Alpine Ridge is a valley destination surrounded by
snowy peaks, with a 240 × 20 metre paved runway, lights, threshold markings,
taxiway and a broad western parking apron.

## Flying there

Board an aircraft with **E / Use**, open the local map and choose **Fly to**
**Alpine Ridge Mountain Airfield**. Automatic navigation handles takeoff,
approach, landing and parking. Move the stick to resume manual control. Keep
the runway clear and use Tower radio for clearance or ground repair/refuelling.
Stop and land before exiting the cockpit. The map also offers a return flight
to International Runway 18 / 36.

## Exploring on foot

The west side of the apron connects to Alpine Ridge Lodge, the ranger station
and the supply hut with first aid. Follow the stone and lantern trail to four
tents, campfire seats, picnic tables, Mirror Lake, the valley lookout and a rest
cabin. Lodge, tents and cabin have walk-in entrances. Lake and canoes are scenic
props; campfire benches and lodge sofas support sitting.

## Quests

| Quest | How to play | Reward |
| --- | --- | --- |
| Alpine Ridge supply flight | Start parked near the main airport, load cargo, fly the ordered departure and mountain approach markers, then stop and unload at the mountain apron. | 1,000 room score |
| Alpine Ridge camper evacuation | Fly to the mountain approach, stop at the apron to receive the stranded campers, then fly home and unload at the main airport apron. | 1,250 room score |
| Alpine trail explorer | Accept at the campground board, collect the supply pack by the rest cabin and compass badge at the lookout, then return to the board. | 40 room score, once |
| Ranger cache recovery | Accept outside the ranger station, collect the lookout supply crate and signal crystal by the lake, then return to the board. | 50 room score, once |

Flight quests appear in the local map's Quests panel. Follow their live markers
in order and confirm pickup/unloading after the required stop. Using automatic
takeoff preserves an active flight assignment. Teleporting, leaving the assigned
aircraft, defeat or disconnection cancels it. Rewards use authoritative room
score; they do not grant MZK.

For walking quests, collect an item with **E / Use**, then **Drop** it to free
your hands before collecting the next. Its collected type remains in your room
inventory. Return to each board to finish; completion and score survive a room
store reload.

## Verification

The static build and static checks pass. Mountain scene, flying, collection,
room upgrade and persistence tests pass, including collision-checked round trips
for all three public aircraft and automatic flights through the quest objectives.
The browser check covers destination selection, quest acceptance, map markers
and dialog fit at desktop and mobile sizes:

```sh
npm run build
npm run check
node --test test/mountain-*.test.mjs test/airport-expansion-migration.test.mjs
python3 test/mountain-fly-in.browser.py
```

Broader validation encountered existing failures outside this expansion:

- `check:environments`: Pixel Peaks ski resort has no `playableSize` metadata.
- `builder-library.test.mjs`: the arcade count is already 49 on HEAD; the test expects 15.
- `expanded-quests.test.mjs`: harbor quests cannot find a safe circular water route; the HEAD implementation reproduces this failure.
- `game-item-graphics.test.mjs`: existing `lot-owned-sign` lacks the expected visual-finish marker. The new mountain has this marker.
