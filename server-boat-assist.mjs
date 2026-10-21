import {isWatercraft} from './public/js/harbor-water.js';
import {boatWaterwayClear} from './public/js/vehicle-actions.js';
import {harborRadio} from './server-harbor-operations.mjs';

const fail=message=>{throw Object.assign(Error(message),{statusCode:409});};
function clearAssist(boat){boat.boating||={};boat.boating.assist=null;delete boat.boating.assistOrigin;delete boat.boating.assistSince;}
export function startBoatAssist(sim,player,environment,operation,now){
 const boat=sim.actors[player.vehicleId];
 if(!isWatercraft(boat)||boat.active===false)fail('Enter a boat before using helm assistance.');
 if(!['launch','cruise','slow','moor','continue','cancel'].includes(operation))fail('Choose departure, cruise, slow, moor, or manual helm.');
 if(operation==='cancel'){clearAssist(boat);return 'Manual helm active. Your controls override assistance.';}
 if(operation==='continue')return boat.boating?.assist?'Helm assistance continues. Steer to take manual control.':'Choose Auto again for the next helm action.';
 if(operation==='moor'){const message=harborRadio(sim,player,environment,'moor');clearAssist(boat);return message;}
 if(!environment?.builderScene?.layoutMeta?.harbor)fail('This map has no navigable harbor.');
 if((operation==='launch'||operation==='cruise')&&!boatWaterwayClear(environment,boat,sim.actors))fail('Turn toward open water before departing.');
 boat.boating||={};
 Object.assign(boat.boating,{assist:operation,assistSince:now,assistOrigin:{...boat.position},anchor:false});
 player.input={};
 return operation==='slow'?'Helm: reducing power and slowing to a stop.':operation==='launch'?'Helm: anchor raised. Departing at a gentle pace. Steer to take control.':'Helm: steady cruise. Assistance slows for shore and other boats.';
}
export function boatAssistedInput(boat,input={},environment,now=0,actors={},blocked=()=>false){
 const state=boat.boating;if(!state?.assist)return input;
 const manual=Math.abs(Number(input.side)||0)>.12||Math.abs(Number(input.rudder)||0)>.12||Math.abs(Number(input.forward)||0)>.05||Number.isFinite(input.throttle)||input.brake===true||typeof input.anchor==='boolean'||Number.isFinite(input.sailTrim);
 if(manual){clearAssist(boat);return input;}
 const speed=Math.abs(state.speed||0),common={...input,forward:0,side:0,rudder:0,anchor:false,brake:false};
 const distance=Math.max(6,speed*speed/10+3),yaw=boat.rotation?.y||0,direction=(state.speed||0)<-.1?-1:1,forecast={x:boat.position.x-Math.sin(yaw)*distance*direction,y:0,z:boat.position.z-Math.cos(yaw)*distance*direction};
 if(state.assist!=='slow'&&(!boatWaterwayClear(environment,boat,actors,distance)||blocked(boat.position,forecast,yaw)))state.assist='slow';
 if(state.assist==='slow'){
  if(speed<.15){clearAssist(boat);state.throttleCommand=0;return {...common,throttle:0,brake:true};}
  return {...common,throttle:0,brake:true};
 }
 const origin=state.assistOrigin||boat.position;
 if(state.assist==='launch'&&Math.hypot(boat.position.x-origin.x,boat.position.z-origin.z)>8)state.assist='cruise';
 const windAngle=Math.abs(Math.atan2(Math.sin((boat.rotation?.y||0)+(state.windDirection||35)*Math.PI/180),Math.cos((boat.rotation?.y||0)+(state.windDirection||35)*Math.PI/180)));
 return {...common,throttle:state.assist==='launch'?.32:.55,sailTrim:Math.max(.12,Math.min(.95,windAngle/Math.PI))};
}
