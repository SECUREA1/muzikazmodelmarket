# Neon Harbor fishing

Enter **Neon Docks** in the explorer and open **Fishing** (under **More view
controls** on compact screens). Using an equipped fishing tool also enters it.
Fishing plays in the live boat view, with the same compact sports action panel
used by the other games. Your rod, line, float and catch remain in the 3D water.
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
   selected fishing area is ready. **Fish here** also enters fishing when you
   are already at a valid spot. Selecting an inland lake uses an available
   Angler on that lake; boats cannot sail across dry island ground. The map
   shows the current passage and its selected destination. Marked shores
   support fishing on foot.
   At shared fishing grounds, occupied stops use a nearby clear position in
   the same fishing area. Manual steering cancels the automatic route.
3. Choose a clear **Port** or **Starboard** station in the sports action panel.
   Its main action changes from **Cast** to **Hook** to **Hold to reel** as the
   fish bites. A slow, stopped
   Angler anchors automatically before casting; a moving boat or active route
   must finish or be stopped first. Wait for the bite prompt, tap **Hook**, then
   hold **Reel**. Automatic drag eases the line during strong surges. You can
   release Reel at any time without losing your progress. Bites allow six
   seconds to respond, and typical fights last about 8–20 seconds.
4. Keep the catch in your saved creel or release it for conservation progress.
   Returning to the helm after landing a fish also saves it in your creel.
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
keyboard shortcuts. Entering fishing releases held game inputs and gives you a
view over the selected side of the boat. The compact panel leaves the water
visible. Fishing holds the helm neutral and blocks conflicting movement,
combat and vehicle actions while allowing you to look around. **Return to
helm** restores boat controls. Tackle, creel, market sales and tournament details
remain available from the optional fishing menu. Browsing tackle during an
automatic passage keeps the selected route running. Cancelling, losing focus or
changing maps releases reel input.

## VR

Enter VR from a WebXR-capable browser. Fishing uses the actual boat and water,
with a small in-scene sports control screen. Press a controller trigger to cast
or hook, hold it to reel, and release it to ease the line. Point at the screen
to select the side, keep or release a catch, or return to the helm. Head tracking
stays under the headset’s control so you can look around naturally. The VR game
menu also exposes owned tackle selection, creel and fish sales, guides, and cup
standings and rewards without opening a hidden browser dialog. Left grip switches
sides before casting; right grip retrieves the line or keeps a landed catch.

Controller disconnection, headset visibility changes, opening the VR menu and
ending the VR session release held fishing inputs. The server’s reel lease
also expires if a client stops renewing it.

The server checks the fishing location, water, boat state, equipment ownership,
session identity, bite window, reel timing and catch disposition. Client values
for catch weight, score and payout are never authoritative.

## Verification

```sh
node --test test/fishing*.test.mjs
python3 test/fishing-controls.browser.py
python3 test/fishing-map-actions.browser.py
python3 test/fishing-vessel.browser.py
python3 test/fishing-vr-screen.browser.py
python3 test/xr-trigger-lifecycle.browser.py
python3 test/fishing-xr-lifecycle-contract.browser.py
python3 test/fishing-live.browser.py
npm run build
npm run check
```

The browser checks need Python Playwright and Chromium at `/usr/bin/chromium`.
The live check uses an isolated temporary account database and local server.
VR screen and input checks use real browser rendering with simulated WebXR
controllers and sessions. Physical headset behavior should also be checked on
the target device.
