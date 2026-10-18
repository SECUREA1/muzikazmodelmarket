# Neon Junction — Arcade Park

Neon Junction is a complete solo arcade map in the world registry, the game Menu, the Environment Builder and Backpack. The Menu has direct **Play Neon Junction** and **Customize Neon Junction** links; opening the park does not require loading the larger house explorer first.

## Games and rides

The seven attractions are arcade hockey, moving-target shooting, timing basketball, air hockey against a computer mallet, billiards, the Park Express perimeter train, and the elevated Skyline coaster. Games support pointer/touch aiming, keyboard arrows, Space/Enter to shoot, restart, and exit. Basketball shows the scoring window and animates both baskets and misses. Hockey is a short goalie challenge, separate from the full regulation hockey game.

The train and coaster follow closed tracks. Boarding locks the rider camera to the moving vehicle, including a customized or separately placed ride. The train faces inward across the scenery. A full lap restores the overview; **Exit ride** or Escape exits early. Dragging, zooming and attraction switching cannot detach a rider.

Mini-games stop rendering the covered 3D park, use real active-tab time, and run small physics steps for fast pucks/balls. This prevents slow GPU rendering from stretching basketball shots and round timers. Hidden tabs pause; returning does not fast-forward the game. The park animates at up to 30 frames per second in overview and on rides.

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

## Implementation and validation

`arcade-rules.js` defines bounded configuration and part metadata. `arcade-park.js` provides independent scene assemblies and transform-aware ride curves. `arcade-runtime.js` handles active time, physics steps and basketball release rules. `arcade-builder-runtime.js` rebuilds saved objects and their interaction targets. `arcade-game.js` connects the menu, mini-games, ride cameras, settings and shared API.

Automated tests cover settings, geometry, independent placed rides, saved object transforms, publication/configuration persistence, builder kit completeness, runtime timing, basketball scoring and module syntax. Browser checks cover all seven attractions, touch input, restart/close, low-frame-rate basketball timing, hidden-tab pause, custom-map publication/reopening and extracted attraction/ride launches. Static build checks require the arcade page and runtime assets. The wider suite retains eleven pre-existing failures; focused arcade checks are reported separately.
