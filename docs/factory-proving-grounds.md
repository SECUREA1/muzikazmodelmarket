# Atlas Proving Grounds and Mountain Nuclear Research Compound

The proving grounds expand the existing missile factory with a connected outdoor
test map and a locked underground mountain facility. Both use the same account,
Backpack, multiplayer rooms, world atlas, local maps, Builder and markets.

Enter the **Atlas Proving Grounds** through the factory's east gate, or choose
the proving-ground destination from the world menu. A reciprocal gate returns
to the factory. The atlas places new expansion lots beside their parent when a
neighboring lot is free; existing maps and deeds retain their positions.

## Set up and deploy a test

1. Bring an **Aster Training Missile** or **Orbit Cargo Rocket** in Backpack.
   Both crafted items and items bought from the existing market are accepted.
   The server validates the original crafting or purchase receipt.
2. Visit **Test preparation & telemetry**. Open the **Test range** SVG icon in
   the top shelf, select your item and its matching profile, then configure a
   practice target or cargo landing test. Use **Recall display copy** here or at
   the pad if you previously placed that specific item in this map.
3. Walk to the **Shared launch pad** and deploy the configured item. The pad is
   reserved while your test runs; other players can watch the same launch.
4. Move to **Arm & launch control**, arm the test, adjust the abstract alignment
   indicators and start the countdown. The game shows a scripted flight,
   exhaust, target pulse or cargo touchdown, SVG telemetry, and a saved result.
5. Reuse the same item for another test. Testing does not consume it, charge an
   additional MZK fee, or award MZK. Scores, best results, skills and badges save
   with the account. Test sessions survive reloads and server restarts.

The training and cargo routes use fictional game presets and abstract alignment
scoring. They are not real missile or nuclear engineering simulations.

## VR control dashboards

Three raised control bays extend the range, each reached by its south stairs:

- **VR preparation deck** on the southwest side selects an owned model, matching
  test profile and target, configures a test and recalls its display copy.
- **VR launch supervision desk** southeast of the launch pad arms and launches
  a deployed model, adjusts its game alignment and cancels a test.
- **VR flight telemetry desk** east of the pad monitors the shared countdown,
  flight progress, trajectory, pad activity and saved results.

In VR, open **Show testing dashboards** from the headset menu or use the nearby
station action. Point either controller at a dashboard button and squeeze the
trigger. Switch between setup, launch, telemetry and compound pages without
leaving the headset. Controls enable when your position and test state allow
the action; deployment still requires visiting the shared pad. The left grip
cycles dashboards; the right grip shows or hides the panel.

The dashboard stays anchored in the world so head movement retains parallax.
Use **Recenter testing dashboard** in the headset menu to place it in front of
your current view, or use **Hide dashboard** to close
it to return to the range. Live flight graphics use the shared server clock;
reduced motion keeps the dashboard's decoration still. Desktop and touch users
retain the top-shelf SVG controls. The compound page operates the existing
access checks and colored-circuit puzzle from VR.

## Unlock the mountain facility

Complete a qualifying **accuracy** test and **cargo** test at the public proving
grounds to earn Mountain Facility Clearance. Approach the mountain hatch and
choose **Enter compound**. Direct URLs, ordinary map portals and stale join
receipts cannot bypass the server's clearance check.

The underground **Mountain Nuclear Research Compound** has an entry checkpoint, containment
hall, observation areas, a deeper bunker and a return lift. At the luminous core,
match the three colored circuit symbols to their displayed targets, then confirm
stabilization. This fictional power-containment puzzle unlocks the deep bunker.
The server blocks walking, vehicles and map relocation across the locked boundary
until that clearance is earned. The surface return remains available.

## Build custom facilities

The seven new native assets are independently available in Marketplace and
**Map Builder → Factory testing**: launch pad, launch console, range target,
telemetry terminal, blast door, containment core and cargo platform. Purchases
retain their interactions in Backpack. The **Proving Grounds** and **Mountain
Compound** Builder templates preserve editable stations and targets when copied,
moved, rotated, disabled, deleted, saved or published.
The proving-ground template also includes the three control bays' individual
consoles and preserves their setup, launch or telemetry dashboard selection.

Custom-map tests and puzzles work as sandbox activities. They do not grant access
to the official compound. A template never copies an account's inventory,
clearance or saved progress.

## Verification

Run `node --test test/*factory*.test.mjs test/mountain-compound-geometry.test.mjs`
for gameplay, access, geometry, catalog and Builder coverage. The browser checks
are `test/factory-testing-ui.browser.py` and the existing factory browser tests.
`test/factory-testing-vr.test.mjs` checks native dashboard controls, controller
rays, shared telemetry and lifecycle handling. Run
`python3 test/factory-testing-vr.browser.py` for production XR control events
with emulated controllers in Chromium.
Use `npm run build && npm run check` to verify the static build.
