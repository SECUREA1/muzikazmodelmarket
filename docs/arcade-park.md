# Neon Junction — Arcade Park

Neon Junction is a complete solo arcade map in the world registry, the game Menu, the Environment Builder and Backpack. The Menu has direct **Play Neon Junction** and **Customize Neon Junction** links; opening the park does not require loading the larger house explorer first.

## Games and rides

The seven attractions are arcade hockey, moving-target shooting, timing basketball, air hockey against a computer mallet, billiards, the Park Express perimeter train, and the elevated Skyline coaster. All five games use physical 3D equipment in the selected park station, with visible player context, depth, moving opponents and projectiles. Pointer/touch aims through the 3D game plane; keyboard arrows adjust aim and Space/Enter shoots. Restart and exit remain available. Basketball shows the scoring window and animates both baskets and misses. Hockey is a short goalie challenge, separate from the full regulation hockey game.

The train and coaster follow closed tracks. Boarding locks the rider camera to the moving vehicle, including a customized or separately placed ride. The train faces inward across the scenery. A full lap restores the selected First person or Top down view; **Exit ride** or Escape exits early. Dragging, zooming and attraction switching cannot detach a rider.

Choose **First person** for eye-level walking with WASD/arrows, Shift to move faster, and drag to look. E or the nearby-use button opens an attraction within reach. Touch buttons supply walking and use actions. Furniture and other solid objects block movement, including transformed builder items; the camera follows the ground and raised platforms. **Top down** follows the same visitor from above, with north at the top and a visible location ring. WASD/arrows and touch movement work in both views.

The **View: First person / View: Top down** button or **V** switches perspective during exploration and all five games. The choice persists locally across map travel. First person uses a standing player view; Top down shows the court or table from above, with an elevated angle for the shooting range so its vertical targets remain visible. Switching preserves the round, score and world-space aim. Train and coaster cameras stay locked while riding, then restore the selected view.

Active games render in the same WebGL park with a compact HUD. Hockey shows skates, stick, puck, goalie and net; shooting has depth, moving targets and a blaster; basketball has a vertical flight arc, rim/net and player release; air hockey and billiards use full tables, mallets/cues, balls and collision motion. The selected station's static equipment is temporarily replaced by its live equipment, then restored exactly on exit.

Game clocks use real active-tab time and small collision substeps. Hidden tabs pause without catch-up. Rendering is capped at 30 fps, with adaptive pixel density and shadow quality after observed slow draws. There is no separate flat canvas game view.

Scores persist locally in the browser. They are arcade points, not currency, MZK rewards, verified server scores or a multiplayer leaderboard. Published custom maps share the layout; players run independent solo sessions.

## Customize the complete park

Open **Environment Builder → Arcade & rides → Neon Junction Arcade Park** or use the park's **Customize map** link. That link imports the exact published environment's settings and saved items into a new editable draft. Publishing the draft creates a separate map rather than overwriting someone else's map. A missing custom map reports an error instead of silently editing the default park.

The **Park parts** breakdown contains 15 built-in assemblies:

| Group | Editable assemblies |
| --- | --- |
| Games | Hockey, shooting arcade, basketball, air hockey, billiards |
| Rides | Train with track and carriages; coaster with track, supports and restrained car |
| Scenery | Foundation, walkway network, tree planting, park lighting, central fountain, seating, train station, entrance sign |

Every assembly supports visibility/availability, X/Z position, rotation, scale and color. **Show in scene** focuses it. **Make editable item** hides its built-in copy and creates a selectable item with the same configuration; it can then be moved, copied, painted, scaled or deleted using the normal inspector. The playable attraction remains available from the park menu through its placed copy. Multiple copies can be clicked individually; each ride keeps its own geometry and animation context. **Reset part** restores its defaults.

Round length is 15–180 seconds. Train laps are 20–120 seconds and coaster laps are 15–90 seconds. Coaster peak is 6–22 metres. Route controls set train X/Z radii and coaster width/depth. Ride assemblies move/rotate/scale with their tracks and camera paths. Difficulty offers relaxed and normal timing/AI speed. Disabled built-in groups are hidden and cannot intercept clicks.

## Reusable item kit

The Builder's **Arcade** filter and Backpack expose a 34-item kit with all park assemblies plus separate equipment and scenery pieces: individual trees, lamps, benches, walkway tiles, signs, train carriages and coaster cars; basketball hoops/balls, hockey goals/pucks, air-hockey mallets, billiard cues/balls, targets, the train engine, rail segments, coaster supports and safety bars.

The complete stations and rides carry playable attraction actions. Individual equipment pieces are visual building props; a separate hoop or rail segment does not create a new game or ride path. Use the full attraction assembly for gameplay. Train/coaster route controls preserve coherent rides rather than treating loose decorative rail pieces as a ride spline.

Saved builder items load into the dedicated arcade runtime with their transforms and paint. Supported procedural, generated, drawn and authored GLB props are rebuilt; a failed custom prop produces a visible notice while the other attractions remain playable. Placed attraction assemblies in other builder maps can launch their saved arcade instance via the normal Use action.

## SVG and 3D assets

The hockey and park catalog previews are detailed 2400 × 1800 SVG illustrations. Six shared 2048 × 2048 SVG surface masters provide ice scratches, maple grain, felt weave, laminate, brushed metal and park paving. Geometry supplies actual markings, depth, nets, posts and collision surfaces; a texture does not replace a 3D model.

`sports-surfaces.js` rasterizes the vector masters for GPU upload, capped at 2048 pixels on desktop and 1024 on small screens. It shares cached textures and preserves procedural materials if a finish fails to load. Builder previews, saved pieces and live games use the same surface tags and preserve paint settings.

## Implementation and validation

`arcade-rules.js` defines bounded configuration and part metadata. `arcade-park.js` provides independent scene assemblies and transform-aware ride curves. `arcade-runtime.js` handles active time, physics steps and basketball release rules. `arcade-builder-runtime.js` rebuilds saved objects and their interaction targets. `arcade-game.js` connects the menu, games, walking, ride cameras, settings and shared API. `arcade-3d-games.js` renders the active station and converts world-space pointer rays to the game simulation. `arcade-navigation.js` handles bounded walking and collision sliding.

Automated tests cover settings, geometry, independent placed rides, saved object transforms, publication/configuration persistence, builder kit completeness, runtime timing, basketball scoring and module syntax. Browser checks cover all seven attractions, touch input, restart/close, low-frame-rate basketball timing, hidden-tab pause, custom-map publication/reopening and extracted attraction/ride launches. Static build checks require the arcade page and runtime assets. The wider suite retains eleven pre-existing failures; focused arcade checks are reported separately.

## Shared sports lobby

The main catalog lists the native original **MUZIKAZ Basketball Arena**, one **Ice Hockey Arena**, **Neon Junction Arcade Park**, and **Firing Range**, alongside the existing worlds. Basketball, Shooting Arcade, Air Hockey and Billiards are arcade attractions inside the park, not separate map destinations.

The native basketball runtime is restored from `origin/work`: `basketball.js`, `basketball-rules.js`, `basketball-stadium.js`, aiming, jerseys, HUD, AI avatars and authoritative room integration. It retains physical shots, close-alignment assistance, catches and passes, AI fill, configurable teams, clocks, scoring, overtime and protected spectators. Match opens join/watch/start controls and a solo/live world selector. Match setup chooses team size, human slots and AI difficulty. Arrivals initially watch a live game; Join Home/Away explicitly takes an available AI spot without resetting score, match ID or clocks. Full human teams reject further joins. This is distinct from the park's `arcade-basketball-rules.js` minigame.

Hockey keeps its full native rules and solo, AI viewing, multiplayer and spectator lobby. Users can join available player spots; AI fills remaining enabled spots. Its match, rules and statistics panels open from the green RAD-TOX icon toolbar. Both sticks sit below the toolbar, and extra sports actions use a dialog rather than stacking between them. Spectators retain view and match-menu access.

Firing Range uses the native House Explorer with solo/live selection and individual training-course scoring. Park rides still board with Enter/E, lock the camera during the ride, and restore walking on completion or explicit exit.

Verification: original basketball physics/rules/AI/server and arena collision tests, hockey rules/cameras, arcade games/rides and shared controller checks; mobile browser checks for native basketball and hockey. Main-server production health must be checked after the hosting provider deploys the pushed commit.

The native Basketball Arena is based on commit `2d6ff8b201d0bd149312a1ca213c86385be35490`; its regulation stadium geometry is unchanged from that commit. Later AI, close-alignment aiming and explicit live AI-spot takeover updates remain. Old `environment=basketball` links resolve to this arena, including legacy arcade-page links. The Explorer menu has direct native Basketball, Ice Hockey and Firing Range links, separate from Neon Junction.

Regulation hockey and both static/live arcade hockey surfaces use the ice texture with a pale ice fallback; basketball retains hardwood. All four game worlds reject atlas streets and slime floor shaders, including refreshes and nested world roots. Solo firing-range sessions also exclude RAD-TOX enemies and gas. Automated silhouettes move without changing the lane floors and pause movement for reduced motion.

Neon Junction now uses the shared WebXR controller and paged in-scene menu. A headset can select every attraction, join/start a solo or live round, spectate, aim/fire, use team basketball actions, board rides and exit back into the park. Desktop and touch controls remain available. The world navigator uses accessible SVG pie wedges, sport icons, names and activity labels; keyboard arrows move focus and Enter/Space selects a destination. Native basketball uses a regulation spherical orange ball with dark seams. Its Q / Steal action can take an opposing AI or human-held ball within 1.7 metres, with server-checked visibility, team restrictions and cooldown.
