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

The catalog exposes Basketball, Shooting Arcade, Air Hockey and Billiards directly, alongside one Ice Hockey Arena and Neon Junction. Hockey tournament and difficulty selection live in the arena lobby instead of duplicate catalog maps. Hockey and arcade hockey use the basketball wood finish while retaining their equipment and rules.

Arcade attractions open a lobby before their clock runs. Choose solo, sign in/continue as a guest to join multiplayer, or spectate. Two player spots are available; an unclaimed spot uses AI. Basketball, shooting, arcade hockey and billiards alternate attempts; air hockey controls both mallets simultaneously. This preserves the latest basketball timing game and its visible ball/player camera; it does not add team basketball rules. Only the host starts/restarts shared rounds, and a restart requires a completed round. Spectators can join an available slot without resetting the round. Movement/aim uses WASD or arrows, pointer/touch aims, Space/Enter/click acts, V changes First person/Top down, and Escape leaves. Touch controls expose the same actions.

`POST /api/rooms/:mapId/arcade` uses the existing guest/account session and CSRF checks. The server owns physics, scores, timers, turn order and occupancy. A player joining another sports room releases the previous sports slot; stale connections become AI after 15 seconds. Active rooms live in one Node process and reset on restart. The separate Neon Junction Site connects to the same MUZIKAZ API, with its exact origin allowed by CORS; no second multiplayer simulation is hosted in its static files.

All sports now display the green MUZIKAZ™ RAD-TOX dual-stick controller. The left stick moves/skates or moves the arcade aim; the right stick looks/turns or aims. Tapping the left stick shoots/plays, and sports expose View plus contextual green action buttons. The firing range retains its existing RAD-TOX move/shoot and look/jump bindings and uses the shared stick markup and branding. Pointer cancellation, focus loss and hidden tabs reset held sports controls. Spectators have no player controller. Match options and the arcade lobby remain available through compact disclosures so they do not cover the playfield.
