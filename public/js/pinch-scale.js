export const MIN_DROPPED_MODEL_SCALE = 0.05;
export const MAX_DROPPED_MODEL_SCALE = 8;

export function pointerDistance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
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
