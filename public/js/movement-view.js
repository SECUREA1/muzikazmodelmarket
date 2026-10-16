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

// Integrate controls every frame; reconcile server corrections without resetting
// the walking trajectory on every response. Stop prediction during long outages.
export class WalkingFollower {
 constructor(){this.reset();}
 reset(){this.position=null;this.correction={x:0,z:0};this.receivedAt=0;}
 push(position,now){
  if(!this.position||Math.hypot(position.x-this.position.x,position.z-this.position.z)>5){
   this.position={...position};this.correction={x:0,z:0};
  }else{
   this.correction={x:position.x-this.position.x,z:position.z-this.position.z};
   this.position.y=position.y;
  }
  this.receivedAt=now;
 }
 sample(input,delta,now,speed,target){
  if(!this.position)return target;
  const age=Math.max(0,(now-this.receivedAt)/1000);
  const fade=Math.max(0,Math.min(1,(.5-age)/.2));
  const offset=movementViewOffset(input,Math.min(.05,Math.max(0,delta)),speed*fade);
  const alpha=1-Math.exp(-10*Math.max(0,delta));
  for(const axis of ['x','z']){
   const correction=this.correction[axis]*alpha;
   this.position[axis]+=offset[axis]+correction;
   this.correction[axis]-=correction;
  }
  Object.assign(target,this.position);return target;
 }
}

// A radial dead zone prevents drift while preserving direction and a continuous
// speed range from a gentle walk to full travel speed.
export function joystickMovement(x,y,deadZone=.08){
 const length=Math.hypot(x,y);
 if(!Number.isFinite(length)||length<=deadZone)return {x:0,y:0};
 const magnitude=Math.min(1,(length-deadZone)/(1-deadZone));
 return {x:x/length*magnitude,y:y/length*magnitude};
}
