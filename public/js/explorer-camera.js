// Presentation coordinates stay local to the browser. Shared rooms continue to
// receive ordinary player-relative movement and eye-origin tool directions.
export function explorerMovementInput(input, yaw = 0, topDown = false) {
  const x = Number(input?.x) || 0, y = Number(input?.y) || 0;
  if (!topDown) return { x, y };
  const sine = Math.sin(yaw), cosine = Math.cos(yaw);
  return { x: cosine * x + sine * y, y: -sine * x + cosine * y };
}

export function explorerAimAngles(origin, target, fallbackYaw = 0) {
  const x = target.x - origin.x, y = target.y - origin.y, z = target.z - origin.z;
  const horizontal = Math.hypot(x, z);
  return {
    yaw: horizontal > .001 ? Math.atan2(-x, -z) : fallbackYaw,
    pitch: Math.max(-1.25, Math.min(1.15, Math.atan2(y, Math.max(.001, horizontal))))
  };
}

export function explorerTopDownPose(position, aspect = 1, zoom = 68) {
  // Fit a useful walking area in portrait too, with north always at screen top.
  const height = Math.max(12, Math.min(42, 17 / Math.min(1, Math.max(.45, aspect)))) * (zoom / 68);
  return { position: [position.x, position.y + height, position.z], target: [position.x, position.y, position.z], up: [0, 0, -1], cutHeight: position.y + 2.6 };
}
