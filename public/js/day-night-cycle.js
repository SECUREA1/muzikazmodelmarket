// Use the player's wall clock, never animation elapsed time or the server's UTC hour.
// Fixed local sunrise/sunset keeps the cycle predictable without asking for location.
const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function getDayNightState(date = new Date()) {
  const localHour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600 + date.getMilliseconds() / 3600000;
  const angle = (localHour - 6) * Math.PI / 12;
  const elevation = Math.sin(angle);
  const sunDirection = {x: Math.cos(angle), y: elevation * .88, z: elevation * -.475};
  const length = Math.hypot(sunDirection.x, sunDirection.y, sunDirection.z);
  for (const axis of ['x', 'y', 'z']) sunDirection[axis] /= length;
  const moonDirection = {x: -sunDirection.x, y: -sunDirection.y, z: -sunDirection.z};
  const daylight = smoothstep(-.12, .45, elevation);
  const isDay = localHour >= 6 && localHour < 18;
  const phase = localHour >= 5 && localHour < 7 ? 'dawn'
    : localHour >= 17 && localHour < 19 ? 'dusk' : isDay ? 'day' : 'night';
  return {
    localHour, phase, isDay, isNight: !isDay, daylight, night: 1 - daylight,
    twilight: smoothstep(-.18, 0, elevation) * (1 - smoothstep(0, .35, elevation)),
    sunDirection, moonDirection,
    sunVisibility: smoothstep(-.07, .03, elevation),
    moonVisibility: smoothstep(-.07, .03, -elevation)
  };
}
