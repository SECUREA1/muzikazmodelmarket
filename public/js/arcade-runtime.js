/** Active-tab time stays real-time even when a device cannot draw 60 frames/sec. */
export function createArcadeClock(now = 0) {
  return {previous: Number.isFinite(now) ? now : 0};
}

export function advanceArcadeClock(clock, now, {paused = false} = {}) {
  if (!Number.isFinite(now)) return 0;
  const delta = Math.max(0, (now - clock.previous) / 1000);
  clock.previous = now;
  return paused ? 0 : delta;
}

/** Collision steps are small enough to keep fast pucks and billiard balls solid.
 * A long process stall consumes round time without an unbounded catch-up loop.
 */
export function arcadePhysicsSteps(delta) {
  const elapsed = Number.isFinite(delta) ? Math.min(.5, Math.max(0, delta)) : 0;
  const count = Math.ceil(elapsed * 120);
  return count ? Array.from({length: count}, () => elapsed / count) : [];
}

export function arcadePointer(x, y) {
  return {x: Math.max(20, Math.min(780, Number.isFinite(x) ? x : 400)),
    y: Math.max(20, Math.min(440, Number.isFinite(y) ? y : 370))};
}

export function basketballPosition(elapsed) {
  return 400 + Math.sin((Number.isFinite(elapsed) ? elapsed : 0) / .65) * 260;
}

export function basketballRelease(x, difficulty = 'easy') {
  const scored = Math.abs(x - 400) < (difficulty === 'normal' ? 45 : 65);
  return {scored, endX: scored ? 400 : 400 + (x - 400) * .4};
}

export function arcadeAnimationSpeed(enabled = true, speed = 1) {
  if (enabled === false) return 0;
  const value = Number(speed);
  return Number.isFinite(value) ? Math.max(0, Math.min(3, value)) : 1;
}
