import {boatWaterwayClear} from './vehicle-actions.js';

// Shared helm input resolution for server simulation and immediate local presentation.
export function clearBoatAssist(boat){boat.boating||={};boat.boating.assist=null;delete boat.boating.assistOrigin;delete boat.boating.assistSince;}
export function boatAssistedInput(boat,input={},environment,now=0,actors={},blocked=()=>false){
 const state=boat.boating;if(!state?.assist)return input;
 const manual=Math.abs(Number(input.side)||0)>.12||Math.abs(Number(input.rudder)||0)>.12||Math.abs(Number(input.forward)||0)>.05||Number.isFinite(input.throttle)||input.brake===true||typeof input.anchor==='boolean'||Number.isFinite(input.sailTrim);
 if(manual){clearBoatAssist(boat);return input;}
 const speed=Math.abs(state.speed||0),common={...input,forward:0,side:0,rudder:0,anchor:false,brake:false};
 const distance=Math.max(6,speed*speed/10+3),yaw=boat.rotation?.y||0,direction=(state.speed||0)<-.1?-1:1,forecast={x:boat.position.x-Math.sin(yaw)*distance*direction,y:0,z:boat.position.z-Math.cos(yaw)*distance*direction};
 if(state.assist!=='slow'&&(!boatWaterwayClear(environment,boat,actors,distance)||blocked(boat.position,forecast,yaw)))state.assist='slow';
 if(state.assist==='slow'){
  if(speed<.15){clearBoatAssist(boat);state.throttleCommand=0;return {...common,throttle:0,brake:true};}
  return {...common,throttle:0,brake:true};
 }
 const origin=state.assistOrigin||boat.position;
 if(state.assist==='launch'&&Math.hypot(boat.position.x-origin.x,boat.position.z-origin.z)>8)state.assist='cruise';
 const windAngle=Math.abs(Math.atan2(Math.sin((boat.rotation?.y||0)+(state.windDirection||35)*Math.PI/180),Math.cos((boat.rotation?.y||0)+(state.windDirection||35)*Math.PI/180)));
 return {...common,throttle:state.assist==='launch'?.32:.55,sailTrim:Math.max(.12,Math.min(.95,windAngle/Math.PI))};
}
