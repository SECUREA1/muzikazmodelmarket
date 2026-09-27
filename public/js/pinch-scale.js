export const MIN_DROPPED_MODEL_SCALE = 0.05;
export const MAX_DROPPED_MODEL_SCALE = 8;

export function pointerDistance(first, second) {
  if (!first || !second) return 0;
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function pointerAngle(first, second) {
  if (!first || !second) return 0;
  return Math.atan2(second.y - first.y, second.x - first.x);
}

export function shortestAngleDelta(startAngle, currentAngle) {
  const start = Number(startAngle) || 0;
  const current = Number(currentAngle) || 0;
  return Math.atan2(Math.sin(current - start), Math.cos(current - start));
}

export function pinchZoomFov({ startDistance, currentDistance, startFov, minFov = 32, maxFov = 92 }) {
  const start = Math.max(1, Number(startDistance) || 1);
  const distance = Math.max(1, Number(currentDistance) || 1);
  const lower = Math.min(Number(minFov) || 32, Number(maxFov) || 92);
  const upper = Math.max(Number(minFov) || 32, Number(maxFov) || 92);
  const requestedFov = (Number(startFov) || upper) * start / distance;
  return Math.max(lower, Math.min(upper, requestedFov));
}

export function pinchScaleFactor({ startDistance, currentDistance, baseLargestAxis }) {
  const start = Math.max(1, Number(startDistance) || 1);
  const distance = Math.max(1, Number(currentDistance) || 1);
  const largestAxis = Math.max(Number(baseLargestAxis) || 1, Number.EPSILON);
  const requestedFactor = distance / start;
  return Math.max(
    MIN_DROPPED_MODEL_SCALE / largestAxis,
    Math.min(MAX_DROPPED_MODEL_SCALE / largestAxis, requestedFactor),
  );
}
