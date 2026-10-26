# Neon Harbor fishing

Enter **Neon Docks** in the explorer and open **Fishing** (under **More view
controls** on compact screens). Using an equipped fishing tool also opens it.
The public Angler
boat at Captain Mara’s pier has port and starboard fishing stations. Additional
fishing boats serve the inland lakes. The local map marks the fishing grounds,
piers and guides.

## Play

1. Use the free **Coastal Spinning Rod** and **Renewable Bait Tin** in Tools.
   Fishing needs no paid upgrade.
2. Board an Angler boat using the normal vehicle action. Select a fishing
   destination on the map and choose **Sail & fish**. The helm follows that
   destination, stops in clear water, and anchors. Fishing opens when the
   selected fishing area is ready. **Fish here** also opens fishing when you
   are already at a valid spot. Selecting an inland lake uses an available
   Angler on that lake; boats cannot sail across dry island ground. The map
   shows the current passage and its selected destination. Marked shores
   support fishing on foot.
   At shared fishing grounds, occupied stops use a nearby clear position in
   the same fishing area. Manual steering cancels the automatic route.
3. Choose a clear **Port** or **Starboard** station and cast. A slow, stopped
   Angler anchors automatically before casting; a moving boat or active route
   must finish or be stopped first. Wait for the bite prompt, tap **Hook**, then
   hold **Reel**. Automatic drag eases the line during strong surges. You can
   release Reel at any time without losing your progress. Bites allow six
   seconds to respond, and typical fights last about 8–20 seconds.
4. Keep the catch in your saved creel or release it for conservation progress.
   Closing the panel after landing a fish also saves it in your creel.
   Return to Captain Mara or Ranger Reed and sell kept catches through Fishing
   to receive MZK in the existing wallet.

The saltwater grounds contain mackerel, snapper, tuna and marlin. Freshwater
zones contain perch, bass, trout and golden carp. Species differ in rarity,
weight, value and fight difficulty.

## Tools and markets

The Game Market, Builder catalog and Tools inventory use the same fishing item
identities. The free starter equipment is supplemented by the Deepwater Carbon
Rod, Precision Drag Reel, Silver Spoon Lure, Angler Tackle Box and Landing Net.
Upgrade ownership is checked by the server. Fishing equipment uses fishing
actions and does not fire the selected weapon.

## Shared competitions and progress

Join the server’s fishing tournament before casting. Players in the same room
share the event clock and leaderboard with AI anglers. Only server-validated
catches count; the server decides weights, scores, results and rewards. Captain
Mara explains boat fishing and competitions; Ranger Reed explains freshwater
fishing and conservation.

Kept catches, fishing progress and reward receipts live in the account database,
outside editable game memory. Selling consumes saved catches atomically;
reconnecting or repeating a request cannot sell the same catch twice. Fishing
earnings are capped at **300 MZK per UTC day**; fish that cannot be paid for
remain in the creel. A cup has a 15-second entry countdown, three minutes of
fishing and a one-minute weigh-in before the next round. Recent tournament
results remain available to claim. Public event state is held in the existing
shared-room store.

## Controls and validation

Fishing uses contextual on-screen buttons and pointer holds. It adds no global
keyboard shortcuts. Opening the fishing panel releases held game inputs; active
fishing holds the helm neutral and blocks conflicting movement, combat and
vehicle actions. Browsing tackle during an automatic passage keeps the selected
route running. Closing, cancelling, losing focus or changing maps releases reel
input. Leave the fishing activity before returning to normal boat controls.

The server checks the fishing location, water, boat state, equipment ownership,
session identity, bite window, reel timing and catch disposition. Client values
for catch weight, score and payout are never authoritative.

## Verification

```sh
node --test test/fishing*.test.mjs
python3 test/fishing-controls.browser.py
python3 test/fishing-map-actions.browser.py
python3 test/fishing-vessel.browser.py
python3 test/fishing-live.browser.py
npm run build
npm run check
```

The browser checks need Python Playwright and Chromium at `/usr/bin/chromium`.
The live check uses an isolated temporary account database and local server.
