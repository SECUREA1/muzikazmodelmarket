# In-game views

Every playable map uses the same **Broadcast / First person / Top down** preference. Open the SVG **Camera** icon to choose a view and adjust its own zoom slider. Close the popup, tap outside, or press Escape to return to play. Press **V** to switch First person and Top down while playing. The shortcut ignores chat, form fields and browser modifier shortcuts. Touch players can use the same on-screen control.

The choice is saved in this browser for the same site and follows travel between ordinary worlds, builder maps, hockey and Neon Junction. Switching changes the local view without reloading a map, resetting a round or leaving a server room. Each player chooses their own view. The three zoom settings are saved independently in the same browser and follow map travel. Zoom changes the camera lens or viewing distance; player size, position, movement speed and map collision geometry do not change.

General worlds, including the firing range and custom builder lands, use an eye-level camera, an overhead camera that follows the player, or an angled Broadcast camera. Overhead controls keep movement aligned to the screen and point aiming into the world. Indoor maps use a visual cutaway above the player so roofs do not cover the play area. Collision and server rules stay active. VR uses the headset camera.

Hockey offers all three views, with chase and spectator cameras under More arena views in the popup. Top down follows the controlled skater; first person uses the animated glove and stick. Solo and server matches share these controls.

Neon Junction supports all three views while exploring and playing the five arcade games. Train and coaster rides keep their attached ride camera until exit, then restore the selected exploration view. Camera changes preserve local matches and the state of live server matches.

The shared preference, zoom and shortcut guard live in `public/js/game-camera.js`; `public/js/game-camera-menu.js` owns the accessible camera popup. Runtime-specific cameras keep their own world-space picking and game simulation.

## Headset controls

Native basketball, hockey, the firing range and Neon Junction share `xr-game-controls.js`. Compatible secure-context WebXR browsers expose Enter VR when an immersive headset is available. All runtimes use the XR animation loop; desktop throttling is bypassed in the headset. Head pose remains tracked in first person. Hockey follows the active skater; park games keep the station camera; rides keep their moving seat position while allowing head tracking.

Left stick moves. Right stick snap-turns in native worlds and hockey and aims in arcade games. Right trigger shoots/plays; left trigger catches or steals in native basketball, passes in hockey/team arcade basketball, and interacts with a nearby attraction in the park. Basketball right grip passes; hockey grips check and poke. Extra actions, solo/live entry, joining, spectating, courses, weapons, park games and rides are available in a 3D menu. X/B or right-stick click opens it; left stick selects and trigger confirms. Long menus have pages. The menu neutralizes movement; headset exit/disconnection resets input. Account sign-in should be completed before entering VR; explicit live guest menu choices create a guest session when needed. Native world mode changes navigate and require entering VR again.

Validation uses deterministic controller-input tests and a simulated XR session/menu browser test. Physical headset rendering and vendor-specific controller behavior still require device QA.
