// Presentation coordinates stay local to the browser. Shared rooms continue to
// receive ordinary player-relative movement and eye-origin tool directions.
export function explorerMovementInput(input, yaw = 0, external = false, viewYaw = 0) {
  const x = Number(input?.x) || 0, y = Number(input?.y) || 0;
  if (!external) return { x, y };
  const sine = Math.sin(yaw-viewYaw), cosine = Math.cos(yaw-viewYaw);
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

/** An elevated sideline camera; portrait views retain the complete playing area. */
export function explorerBroadcastPose(position, aspect = 1, zoom = 68, {court=false} = {}) {
  const ratio=Math.max(.3,Math.min(3,Number(aspect)||1));
  const halfFov=Math.atan(Math.tan(58*Math.PI/360)*Math.min(1,ratio));
  const radius=court?Math.hypot(9,16,8):10;
  const distance=radius/Math.sin(halfFov)*1.08*Math.max(.7,Math.min(1.5,(Number(zoom)||68)/68));
  const target=court?[0,1.5,0]:[position.x,position.y+1,position.z];
  const offset=court?[1,.65,.18]:[.8,.7,1],length=Math.hypot(...offset);
  return {position:target.map((value,index)=>value+offset[index]*distance/length),target,up:[0,1,0],heading:Math.atan2(offset[0],offset[2]),cutHeight:court?16.4:position.y+3.8};
}
