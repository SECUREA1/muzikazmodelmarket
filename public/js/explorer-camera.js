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

export function explorerTopDownPose(position, aspect = 1, zoom = 68, scale = 1) {
  // Fit a useful walking area in portrait too, with north always at screen top.
  const height = Math.max(12, Math.min(42, 17 / Math.min(1, Math.max(.45, aspect)))) * (zoom / 68) / Math.max(.6,Math.min(1.6,Number(scale)||1));
  return { position: [position.x, position.y + height, position.z], target: [position.x, position.y, position.z], up: [0, 0, -1], cutHeight: position.y + 2.6 };
}

// A north-facing broadcast camera uses the same player location and aim plane as
// the overhead view. Camera zoom never changes the player's collider or speed.
export function explorerBroadcastPose(position, aspect = 1, zoom = 68, scale = 1) {
  const top=explorerTopDownPose(position,aspect,zoom,scale),height=top.position[1]-position.y;
  return {position:[position.x,position.y+height*.72,position.z+height*.7],target:[position.x,position.y+.7,position.z],up:[0,1,0],cutHeight:top.cutHeight};
}
