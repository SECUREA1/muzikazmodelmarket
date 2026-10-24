# In-game views

Every playable map uses the same **First person / Top down** preference. Use the on-screen **View** control or press **V** while playing. The shortcut ignores chat, form fields and browser modifier shortcuts. Touch players can use the same on-screen control.

The choice is saved in this browser for the same site and follows travel between ordinary worlds, builder maps, hockey and Neon Junction. Switching changes the local view without reloading a map, resetting a round or leaving a server room. Each player chooses their own view.

General worlds, including the firing range and custom builder lands, use an eye-level camera or an overhead camera that follows the player. Overhead controls keep movement aligned to the screen and point aiming into the world. Indoor maps use a visual cutaway above the player so roofs do not cover the play area. Collision and server rules stay active. VR uses the headset camera.

Hockey offers the same two views alongside its chase, broadcast and spectator cameras. Top down follows the controlled skater; first person uses the animated glove and stick. Solo and server matches share these controls.

Neon Junction supports both views while exploring and playing the five arcade games. Train and coaster rides keep their attached ride camera until exit, then restore the selected exploration view. Arcade scores and games remain local single-player sessions.

The shared preference and shortcut guard live in `public/js/game-camera.js`. Runtime-specific cameras keep their own world-space picking and game simulation.

## Double-tap movement

Double-tap a clear ground spot in the game view to move directly there. Mouse users can double-click; touch and pen use two quick taps in the same spot. This works in first person and top down across ordinary worlds, builder test maps, hockey and the Neon Junction park. Hockey moves your controlled skater on the ice; shared worlds and matches confirm the arrival with the server.

Relocation clears held movement so you stop at the selected spot. A single tap keeps its normal action, and dragging to look, pinching, or tapping control buttons does not relocate you. Walls, blocked landings and points outside the playable ground are rejected. Leave a vehicle, seat, ski lift or park ride before relocating. Arcade minigames keep their aiming controls, and VR keeps its headset controls.

## Headset controls

Native basketball, hockey, the firing range and Neon Junction share `xr-game-controls.js`. Compatible secure-context WebXR browsers expose Enter VR when an immersive headset is available. All runtimes use the XR animation loop; desktop throttling is bypassed in the headset. Head pose remains tracked in first person. Hockey follows the active skater; park games keep the station camera; rides keep their moving seat position while allowing head tracking.

Left stick moves. Right stick snap-turns in native worlds and hockey and aims in arcade games. Right trigger shoots/plays; left trigger catches or steals in native basketball, passes in hockey/team arcade basketball, and interacts with a nearby attraction in the park. Basketball right grip passes; hockey grips check and poke. Extra actions, solo/live entry, joining, spectating, courses, weapons, park games and rides are available in a 3D menu. X/B or right-stick click opens it; left stick selects and trigger confirms. Long menus have pages. The menu neutralizes movement; headset exit/disconnection resets input. Account sign-in should be completed before entering VR; explicit live guest menu choices create a guest session when needed. Native world mode changes navigate and require entering VR again.

Validation uses deterministic controller-input tests and a simulated XR session/menu browser test. Physical headset rendering and vendor-specific controller behavior still require device QA.
