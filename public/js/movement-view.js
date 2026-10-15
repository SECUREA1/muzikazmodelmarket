// A short, bounded visual prediction. Server snapshots remain the source of truth.
export function movementViewOffset(input, seconds, speed = 4) {
  const forward = Math.max(-1, Math.min(1, Number(input.forward) || 0));
  const side = Math.max(-1, Math.min(1, Number(input.side) || 0));
  const yaw = Number(input.yaw) || 0;
  const distance = speed * Math.max(0, Math.min(.15, seconds)) / Math.max(1, Math.hypot(forward, side));
  return {
    x: (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * distance || 0,
    z: (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * distance || 0,
  };
}
