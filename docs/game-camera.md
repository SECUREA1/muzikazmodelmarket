# In-game views

Every playable map uses the same **First person / Top down** preference. Use the on-screen **View** control or press **V** while playing. The shortcut ignores chat, form fields and browser modifier shortcuts. Touch players can use the same on-screen control.

The choice is saved in this browser for the same site and follows travel between ordinary worlds, builder maps, hockey and Neon Junction. Switching changes the local view without reloading a map, resetting a round or leaving a server room. Each player chooses their own view.

General worlds, including the firing range and custom builder lands, use an eye-level camera or an overhead camera that follows the player. Overhead controls keep movement aligned to the screen and point aiming into the world. Indoor maps use a visual cutaway above the player so roofs do not cover the play area. Collision and server rules stay active. VR uses the headset camera.

Hockey offers the same two views alongside its chase, broadcast and spectator cameras. Top down follows the controlled skater; first person uses the animated glove and stick. Solo and server matches share these controls.

Neon Junction supports both views while exploring and playing the five arcade games. Train and coaster rides keep their attached ride camera until exit, then restore the selected exploration view. Arcade scores and games remain local single-player sessions.

The shared preference and shortcut guard live in `public/js/game-camera.js`. Runtime-specific cameras keep their own world-space picking and game simulation.
