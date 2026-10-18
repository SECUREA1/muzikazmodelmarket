# Tiered ice hockey

The game map list contains one **Ice Hockey Arena**. Its lobby selects exhibition or tournament format, Rookie/Club/Pro/Elite difficulty, period length, solo AI, AI-only viewing, live players, and whether AI fills unclaimed skater positions (goalies stay AI). The hockey land in the Backpack opens the playable arena. Each map supports solo play, live players, and spectators. **Customize arena** opens the hockey layout in the Environment Builder.

## Difficulty and competitions

| Tier | Saved value | AI skating speed | Cup |
| --- | --- | --- | --- |
| Rookie | `easy` | 5.4 m/s | Rookie tournament |
| Club | `normal` | 6.5 m/s | Silver Club Cup |
| Pro | `pro` | 7.3 m/s | Gold Pro Cup |
| Elite | `elite` | 7.8 m/s | Platinum Elite Cup |

Reaction time, goalie reach and shot placement also vary by tier. Human skating is 7.8 m/s before fatigue. Rookie is the default relaxed setting.

Each cup has a playable semifinal, a simulated AI semifinal, a championship, and a recorded champion/tier in the match state. Winning participants advance; eliminated players become spectators. The AI semifinal uses the same simulation with shortened periods. The host advances a completed semifinal and can rematch a completed game. Advancing humans retain control of their skater positions; spectators remain connected.

## Controls and roles

- WASD/arrows skate with acceleration and momentum. In player-following views, forward/right movement follows the camera heading. Pointer aims, Space shoots, E passes, Shift lofts.
- Q body-checks, F poke-checks. H hooks, J slashes and K holds; illegal contact can cause penalties.
- X switches to an available AI skater. L replaces a tired shift at a stoppage or near the bench; the icing team cannot change on its icing stoppage.
- G pulls/returns the goalie for an extra attacker. T takes the team's single 30-second timeout at a stoppage.
- The fixed touch pad provides movement, shots, passes, checks, pokes, lofting and a View toggle while the rink stays visible. In First person, swiping turns the view and automatic shot aim follows it; in Top down, tap or drag the ice to aim.

Five skaters and a goalie start for each team. The simulation supplies AI for empty positions. Ten humans can occupy skater slots; goaltenders are AI. Inactive connections become AI after 15 seconds. Team roster metadata contains twenty athletes and the arena benches show reserve players. Shift rotation and fatigue use three lines.

Spectator mode takes no skater slot, supports up to 64 authenticated viewers per room, and provides broadcast, lower bowl, upper bowl, behind-goal and free orbit cameras. Spectator commands cannot move players, change lineups, advance brackets or alter results. If a tournament leaves no human finalists, spectators can continue watching its AI championship.

## Immersive 3D views

**First person** is the default when the browser has no saved view preference. It puts the camera at skater eye height with a visible animated glove/stick rig. **Top down** looks vertically down from 11 m and follows the controlled skater; its camera stays below the suspended scoreboard and trusses. The attacking net is toward the top of the screen, and movement follows that orientation. In Top down, point at or tap/drag the ice to aim. In First person or Player chase, right-drag or touch swipe turns the view; C centers the attacking net.

Press **V** or use either **View** button to switch First person / Top down during solo or live server play. The choice is remembered with the shared [game camera preference](game-camera.md) for other maps on the same browser and site. Changing the camera preserves the match, room, human slot, score and clock; camera choice stays in the client presentation. Switching skaters transfers the camera to the newly controlled player, and changing ends centers the new attacking direction. The Camera list also retains Player chase, broadcast and stadium seat/end views; authenticated spectators retain a free camera.

The arena has an open cutaway shell, roof trusses, lit ribbons, a standing instanced crowd and detailed helmets, jersey stripes, skate blades and woven goal nets. The vector ice finish adds fine scratches without changing the official rink geometry or scoring rules. Runtime-only batching combines static arena decorations while retaining named builder metadata, scoreboards and animated rig controls; it removes hundreds of draw calls without changing the arena shape. Shared SVG masters have 2048-pixel desktop GPU uploads and bounded mobile resolution; the catalog arena illustration is a scalable 2400 × 1800 SVG.

## Arena and builder

The ice is 200 × 85 ft with 28 ft corner radii, 6 × 4 ft goals, regulation-scale markings, boards, glass and creases. Four skating officials represent two referees and two linesmen. Player strides, stick actions, goalie saves and referee signals animate procedurally. The puck's display is enlarged for readability; scoring uses a separate simulation, including complete goal-line crossing and crossbar height.

The arena includes 2,368 individually instanced spectator seats across lower/upper bowls and end stands, aisles, guard rails, concourses, spectator tunnels, two team benches with reserve skaters/spare sticks/water bottles, locker-room tunnels, two enclosed penalty boxes with benches and gates, the official scorer's table, arena lighting and an updating suspended scoreboard.

Choose **Sports → Ice Hockey Arena** in the builder. It expands the editor map to 120 m to fit the full stadium enclosure. Saved options include all four difficulty tiers, exhibition/cup format, 30–1200 second periods, jersey colors, penalties, delayed/immediate offside, hybrid/automatic icing, and regular-season/playoff overtime. Tournament format always uses playoff overtime. Save, Test Map and Publish Map retain the settings and launch the selected solo/multiplayer mode.

The item library contains procedural skates, sticks, pucks, nets, skaters, goalies, referees and linesmen. Regulation equipment, officials and match actors are supplied automatically; authored hockey items are editor references and do not create extra scoring goals or roster slots. Supported procedural scenery outside the ice is reconstructed during play. Uploaded GLB/custom drawing scenery is not reconstructed by this hockey runtime. Authored scenery does not alter official scoring geometry.

## Officiating and match rules

- Three timed regulation periods, changing ends, faceoffs, whole-puck goal-line detection, goalie saves and freezes, goal disallowance for offside or goalie interference, high shots missing above the crossbar, puck gravity and board rebounds.
- Delayed offside/tag-up or immediate offside; attacking touches stop play while offside. Hybrid icing judges the race toward the end-zone faceoff dots; automatic icing is also available. Short-handed teams are exempt, shots into the goal are not icing, and the icing team cannot change its shift at that stoppage.
- Contact enforcement detects interference, tripping, hooking, holding, slashing, high-sticking, boarding, dangerous-contact majors and goaltender interference from the actual action/proximity. A defensive clear directly over the glass draws delay of game. Eligible breakaway stick fouls can award a playable penalty shot instead of a minor.
- The officiating catalog additionally supports charging, elbowing, roughing, bench minors, double minors, fighting majors, misconducts, game misconducts and match penalties. These types can be assessed by the shared official layer; not every catalog offense has a dedicated player animation or automatic detector.
- Delayed penalties allow the non-offending side to continue until an offending touch/stoppage. Minor, double-minor, major and misconduct durations are distinct. Penalty clocks stop with play; only two strength penalties count down concurrently. Later penalties queue, and reserve substitution preserves the minimum skater count. Power-play goals release one eligible minor segment, never an unexpired major or an even-strength penalty. A goal cancels one impending minor segment.
- Regular-season overtime is 3-on-3 for five minutes, with penalty manpower adjustments and sudden-death goals; a tie proceeds to a three-round shootout and then sudden-death rounds. Shootout athletes rotate. Playoff/cup overtime keeps five skaters and uses repeated 20-minute sudden-death periods.
- Team timeout clocks, extra attackers, penalty shots, shift stamina, rematches, match statistics, referee event logs and spectator-only participation share the same authoritative state.

This is a playable NHL-inspired rule simulation, not a claim of complete NHL rulebook compliance. Video reviews/coaches' challenges, intentional hand passes/kicks, equipment inspections, goalie trapezoid puck-handling violations, and every exceptional coincidental-penalty/line-change interpretation are not simulated. Most contact is represented by procedural game actions, not a full-body injury or fighting physics system. These boundaries are intentional and must not be described as complete official NHL coverage.

## Server contract and deployment

`POST /api/rooms/:mapId/hockey` accepts `join`, `spectate`, `input`, `watch`, `leave`, `next`, `rematch`, `line`, `switch`, `goalie`, and `timeout`. Map validation, guest/account identity and CSRF checks use the existing server access flow. Controls are bounded movement/aim and action flags; clients cannot submit authoritative scores, puck positions, penalties, identities or clocks. Snapshots include `selfId`, `role`, `sequence`, `serverTime`, and shared `state`. Players poll at approximately 50 ms; spectators at 200 ms. Simulation uses bounded 50 ms substeps. The map list reports player and spectator counts separately.

Live matches are in one server process's memory. Empty rooms expire and server restarts reset matches. Persisted map settings remain in the existing custom-map storage. Horizontal scaling requires shared room ownership/transport. Local multi-browser checks do not establish production load capacity.

`render.yaml` configures the Node service with `npm ci && npm run build`, `node server.mjs`, `/api/health`, and deployment on commits. The health response exposes the existing deployment commit field. Push the tested release to the repository's deployment branch; check the external deployment status before claiming it is live.

## Validation

`node --test test/hockey-camera.test.mjs test/game-camera.test.mjs test/hockey.test.mjs test/guest-map-play.test.mjs test/environment-builder.test.mjs test/world-map-picker.test.mjs test/browser-game-module-syntax.test.mjs` verifies rules, tiers, roster/substitution, overtime/shootouts, penalty shots, tournament elimination, spectator permissions, publication, scene geometry and browser module syntax. Browser checks exercise Elite solo, two live guest players plus a read-only spectator, all camera modes, skater/goalie controls and builder publish-and-play. `npm run build && npm run check` validates shipped static files.

The wider suite retains pre-existing failures outside the hockey release. Compare against that baseline rather than describing the whole suite as passing.
