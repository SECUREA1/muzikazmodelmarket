# Ironwood Prison

Choose **Prison & escape** in the world menu, select **Ironwood Prison**, and enter the facility. The direct destination is:

`model-explorer.html?environment=ironwood-prison&house=ironwood-prison&mode=multiplayer&autoplay=1`

The 240-metre map includes 24 furnished cells across two cell blocks, a cafeteria and kitchen, exercise yard, recreation room, infirmary, laundry, workshop, security control, perimeter walls and watchtowers. The connected world map includes the prison and return gateways; the local map identifies the activity areas.

Walk with WASD / arrow keys or the touch movement controls. **V** changes between first person and top down. Approach an activity and press **E / Use**, or open the prison activities control. Actions require your character to be near the station. The activity directory provides the purpose and location of each station.

At intake, choose a **prisoner** or **guard** shift. Prisoners can follow the routine, complete activities, earn recreation tokens and attempt an escape. Guards can patrol, settle disturbances and operate security controls. Health, energy, morale and suspicion show how the current shift is going. Recreation tokens are prison scores; they do not spend the MZK wallet.

## Life inside

- **Cells:** Each door has its own lock. Guards can operate cell doors; prisoners can manage their assigned cell and need the proper security item for other cells. Locked bars block the doorway. Resting restores health and energy.
- **Meals:** Collect a hot tray at the cafeteria counter to restore health and energy. Meal service has a short refill delay.
- **Television:** Change the common-room channel and recover morale.
- **Radio:** Tune to the frequency shown in the activity instructions.
- **Video games:** Start the arcade challenge, then follow the directional cues before the round expires.
- **Boxing:** Complete the jab, cross and duck combination. A wrong move ends the round; you can start again.
- **Work:** Follow the workshop supply-sorting instructions to complete a shift, earn tokens and lower suspicion.
- **Fights:** Starting a yard scuffle costs health and energy, increases suspicion and draws the guards. De-escalating settles the disturbance. The fights are non-graphic.

The accelerated daily routine cycles through meals, free time, yard, work and lockdown. Guards patrol while prisoners move between activities. A security alarm and rising suspicion make escape harder. Guards pursue suspicious prisoners; getting caught returns the prisoner to a cell for a short detention and carries a token penalty.

## Escape challenges

The escape route is a sequence of in-game objectives. Search the laundry stash, obtain the security item, solve the control-room clue and open the maintenance passage. The activity panel explains the required items and shows completed challenges. Carry the maintenance pass to the south service gate, wait until the alarm clears and the patrol moves away, then reach the marked escape finish. Releasing the gate gives you 15 seconds to walk through and reach the finish pad.

The security desk and gate check your character's proximity, inventory and current security conditions. Walking to the finish without completing the objectives does not complete the escape challenge. Use **Return to intake** at the finish pad to start another shift. This also returns you safely if the gate timer expires after you cross; earned tokens and completed challenges stay saved.

Guards can trigger a temporary facility lockdown or release the cell locks from security control. Individual cell locks and detention have physical consequences, so open a door before trying to walk through it.

Multiplayer activities, prison progress, cell states and security use the existing Node room server. The prison shares the game's controls, camera, maps and room connection. Unrelated ambient enemies, random road traffic and toxic combat encounters are disabled inside the facility.

## Shift contracts and ranks

Open **Challenge board** at intake to accept a contract for your current role. There are three prisoner contracts (daily routine, recreation circuit, service-route escape) and three guard contracts (inspection, keeping the peace, securing the facility). Completed activities count after accepting. Skill games count only on a complete successful round, inspections require different cells, and calming a disturbance requires an actual incident.

Each contract pays recreation tokens once per prison day and role. Changing roles, reconnecting or reloading preserves progress; the next prison day makes the contracts replayable. The board shows goal counts, lifetime completions and rank. You can abandon an unfinished contract at intake to choose another.

## Supply packets and your Backpack

The **Packs & Backpack** tab has four supply packets: canteen, recreation, workshop and guard duty. Buy them at intake or meal service using recreation tokens. The workshop packet unlocks after three successful workshop sorting jobs; the duty packet requires a guard shift. Your prison supply pouch holds eight items, with at most four of one kind. Snacks, water, juice and first aid restore the stats listed on their cards. Use carried supplies while on foot; consumption has a shared ten-second cooldown. Full stats do not waste an item. These consumable supplies and escape contraband stay in the prison room.

Four separate keepsakes can leave the facility in your account **Backpack**:

| Keepsake | Earn it by |
| --- | --- |
| Ironwood portable radio | Tune the prison radio correctly |
| Recreation chess set | Complete an arcade round |
| Workshop supply crate | Finish three workshop sorting jobs |
| Ironwood escape trophy | Complete the escape challenge |

Return to intake and choose **Collect** on the unlocked keepsake. Collection is free and each item can be earned once per account. Open your Backpack in another world to place it; the portable radio retains the game's shared audio controls. Collection, ownership and placement survive reconnects and server restarts. Keepsakes are account bound and cannot be bought or resold. Their placement does not grant prison keys or reset escape objectives.

## Multiplayer message framework

Prison commands use the existing authenticated room transport with versioned `ironwood-prison` action packets. The server validates canonical operations, IDs and bounded input, supplies its own position, inventory, prices and clock, and acknowledges accepted commands with a revision. Request IDs identify one exact intent: retrying it does not repeat purchases or rewards, and changing an already used request's payload is rejected. Legacy flat action messages remain supported. Clients ignore prison snapshots older than an acknowledged revision.

The framework separates shared rules, navigation, contracts, supply packets, transport validation, collectible definitions, account receipts and UI rendering into reusable modules. Targeted tests are in `test/prison-*.test.mjs` and `test/authoritative-prison.test.mjs`; `test/prison-world.browser.py` and `test/prison-expansion.browser.py` cover browser and cross-world Backpack use.
