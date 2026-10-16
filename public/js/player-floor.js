export const PLAYER_FLOOR_CLEARANCE=.02;
export const WALKABLE_NORMAL_Y=.55;
// All player positions are feet positions; capsule endpoints are sphere centers.
export function capsuleFeet(capsule){return {x:capsule.start.x,y:capsule.start.y-capsule.radius,z:capsule.start.z};}
export function capsuleEndpoints(feet,height=1.65,radius=.34){
 return {start:{x:feet.x,y:feet.y+radius,z:feet.z},end:{x:feet.x,y:feet.y+Math.max(radius,height-radius),z:feet.z}};
}
export class WalkingFloorFollower {
 constructor(){this.reset();}
 reset(){this.hit=null;this.sampledAt=-Infinity;this.hintY=null;}
 follow(position,{grounded=false,now=0,query,step=.4}={}){
  if(!grounded){this.reset();return position.y;}
  const hit=this.hit,distance=hit?Math.hypot(position.x-hit.x,position.z-hit.z):Infinity;
  if(!hit||distance>.16||Math.abs(position.y-(this.hintY??position.y))>.03||now-this.sampledAt>80){this.hit=query(position);this.sampledAt=now;this.hintY=position.y;}
  const floor=this.hit;if(!floor||floor.normal.y<WALKABLE_NORMAL_Y)return position.y;
  const height=floor.y-((position.x-floor.x)*floor.normal.x+(position.z-floor.z)*floor.normal.z)/floor.normal.y+PLAYER_FLOOR_CLEARANCE;
  // Ground following must never snap to another storey or pull a jumping player down.
  return Math.abs(height-position.y)<=step?height:position.y;
 }
}
