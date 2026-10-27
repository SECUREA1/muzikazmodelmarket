const number=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const position=value=>({x:number(value?.x),y:number(value?.y),z:number(value?.z)});
const validViewer=value=>value&&['x','y','z'].every(axis=>Number.isFinite(value[axis]));

/** Offset the locomotion rig once when boarding, rather than editing a tracked
 * camera. The viewer may stand, sit, lean or look around after calibration;
 * every later headset pose remains a normal room-space tracking update. */
export function createFunhouseRideView(){
 let currentRideId=null,anchor=null;
 function reset(){currentRideId=null;anchor=null;}
 function project({rideId=null,presenting=false,position:feet,eyeHeight=1.15,yaw=0,viewerPosition=null}={}){
  const base=position(feet),active=Boolean(rideId)&&Boolean(presenting);
  if(!active){reset();return {position:base,offset:{x:0,y:0,z:0},active:false,calibrated:false};}
  if(currentRideId!==rideId){currentRideId=rideId;anchor=null;}
  if(!anchor&&validViewer(viewerPosition))anchor=position(viewerPosition);
  // A session may start before its first viewer pose is available. Keep the
  // authored rig origin until that pose arrives, then calibrate exactly once.
  if(!anchor)return {position:base,offset:{x:0,y:0,z:0},active:true,calibrated:false};
  const local={x:-anchor.x,y:number(eyeHeight,1.15)-anchor.y,z:-anchor.z},angle=number(yaw),c=Math.cos(angle),s=Math.sin(angle);
  const offset={x:local.x*c+local.z*s,y:local.y,z:-local.x*s+local.z*c};
  return {position:{x:base.x+offset.x,y:base.y+offset.y,z:base.z+offset.z},offset,active:true,calibrated:true};
 }
 return {project,reset,snapshot:()=>({rideId:currentRideId,calibrated:Boolean(anchor),viewerPosition:anchor?{...anchor}:null})};
}
