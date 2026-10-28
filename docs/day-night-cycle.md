# Local day and night

The main explorer's outdoor maps and the Arcade Park follow the player's computer
clock and local timezone. Sunrise is at 06:00 and sunset is at 18:00. Dawn runs
from 05:00 to 07:00; dusk runs from 17:00 to 19:00. These are fixed local times,
without a location permission or a dependency on a weather service.

The sun and moon move across the sky, with gradual changes to sky, clouds, fog,
ground shading, ambient light and reflective materials. Clear nights have stars
and a bright moon. Overcast and storm weather reduce direct illumination. A
single directional shadow map follows the player and switches between sunlight
and moonlight, respecting the existing graphics quality setting. Indoor maps
retain their authored lighting.

`getDayNightState()` in `public/js/day-night-cycle.js` returns the current local
hour, phase, `isDay`, `isNight`, daylight/twilight levels and celestial directions.
The lighting controller samples the wall clock once per second, including after
tab suspension or computer clock changes. Reduced motion freezes cloud motion,
while the clock continues to advance.

Main-explorer gameplay can read `scene.userData.dayNight`. The browser emits
`muzikaz:day-night-change` with that state when the phase, day/night flag or
indoor/outdoor status changes. The Arcade Park exposes the same state through
`window.NeonJunction.snapshot().dayNight`. The explorer's player settings show
the current phase and local time. Each player's visuals follow their own clock;
shared multiplayer rules and rewards remain server authoritative.

Validation:

```sh
node --test test/day-night-cycle.test.mjs test/outdoor-day-night.test.mjs
python3 test/day-night.browser.py
python3 test/outdoor-scenery.browser.py
```
