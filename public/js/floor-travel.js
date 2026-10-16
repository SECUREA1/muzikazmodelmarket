// Steering feeds the same collision/prediction controls as a joystick.
export function floorTravelInput(position,target,yaw){
  const dx=target.x-position.x,dz=target.z-position.z,distance=Math.hypot(dx,dz);
  if(distance<.12)return {side:0,forward:0,arrived:true};
  const speed=Math.min(1,distance/ .65),x=dx/distance*speed,z=dz/distance*speed;
  return {side:x*Math.cos(yaw)-z*Math.sin(yaw),forward:-x*Math.sin(yaw)-z*Math.cos(yaw),arrived:false};
}
