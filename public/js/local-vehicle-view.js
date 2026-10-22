import {roadSpeedLimit} from './road-network.js';
import {isRoadVehicle,stepRoadVehicle} from './road-vehicles.js';
import {isAircraft,stepAircraftFlight} from './aircraft-flight.js';
import {aircraftAssistedInput} from './aircraft-assist.js';
import {isWatercraft} from './harbor-water.js';
import {stepBoatSimulation} from './boat-simulation.js';
import {boatAssistedInput} from './boat-assist.js';
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const validPosition=actor=>actor?.position&&['x','y','z'].every(axis=>Number.isFinite(actor.position[axis]));
const wrap=value=>Math.atan2(Math.sin(value),Math.cos(value));
const copyState=state=>state?structuredClone(state):state;
const cloneActor=actor=>({...actor,position:{...actor.position},rotation:{...actor.rotation},...(actor.scale?{scale:{...actor.scale}}:{}),...(actor.flight?{flight:copyState(actor.flight)}:{}),...(actor.boating?{boating:copyState(actor.boating)}:{}),...(actor.driving?{driving:copyState(actor.driving)}:{})});
// Only the local vehicle's presentation is predicted. Snapshots retain all
// authority over health, ownership, impacts, boarding and travel operations.
export class LocalVehicleView {
 constructor({staleAfter=1200,snapDistance=5,correctionRate=18}={}){this.staleAfter=staleAfter;this.snapDistance=snapDistance;this.correctionRate=correctionRate;this.reset();}
 reset(){this.state=null;this.display=null;this.history=[];this.options={};this.offset={x:0,y:0,z:0};this.rotationOffset={x:0,y:0,z:0};this.clockOffset=null;this.bestRtt=Infinity;this.lastSnapshotTime=-Infinity;this.lastSimulationTime=-Infinity;this.receivedAt=-Infinity;this.lastNow=-Infinity;this.lastRenderNow=-Infinity;this.lastServerTime=null;}
 get actor(){return this.display;}
 get current(){return this.display;}
 reconcile(actor,{serverTime,simulationTime=serverTime,sentAt,receivedAt=performance.now(),teleport=false}={}){
  if(!validPosition(actor)||!Number.isFinite(receivedAt))return false;
  const changed=!this.state||this.state.id!==actor.id||this.state.holderId!==actor.holderId||this.state.active!==actor.active;
  if(teleport||changed)this.reset();
  if(Number.isFinite(sentAt)&&Number.isFinite(serverTime)){
   const rtt=Math.max(0,receivedAt-sentAt);this.bestRtt=Math.min(this.bestRtt,rtt);
   if(this.clockOffset===null)this.clockOffset=(sentAt+receivedAt)/2-serverTime;
  }
  const mapped=Number.isFinite(simulationTime)&&this.clockOffset!==null?simulationTime+this.clockOffset:receivedAt;
  const time=Math.min(receivedAt,mapped);
  // Commands such as Assist can change flight metadata without advancing the
  // simulation clock; accept equal-time updates without replaying elapsed time.
  if(Number.isFinite(simulationTime)&&simulationTime<this.lastSimulationTime)return false;
  if(Number.isFinite(simulationTime))this.lastSimulationTime=simulationTime;
  const previous=this.display,source=cloneActor(actor);this.receivedAt=receivedAt;this.lastServerTime=Number.isFinite(serverTime)?serverTime:null;this.lastSnapshotTime=time;
  let replayed=source;
  for(const segment of this.history){
   const start=Math.max(time,segment.start),end=Math.min(segment.end,receivedAt);
   if(end>start)replayed=this.advance(replayed,segment.input,(end-start)/1000,this.options,end);
  }
  this.state=replayed;
  const dx=previous?previous.position.x-replayed.position.x:0,dy=previous?previous.position.y-replayed.position.y:0,dz=previous?previous.position.z-replayed.position.z:0;
  const snap=!previous||teleport||changed||actor.active===false||Math.hypot(dx,dy,dz)>this.snapDistance;
  if(snap){this.offset={x:0,y:0,z:0};this.rotationOffset={x:0,y:0,z:0};if(teleport||changed)this.history=[];}
  else{
   this.offset={x:dx,y:dy,z:dz};
   for(const axis of ['x','y','z'])this.rotationOffset[axis]=wrap(finite(previous.rotation?.[axis])-finite(replayed.rotation?.[axis]));
  }
  this.lastNow=previous&&!teleport&&!changed?Math.max(finite(this.lastNow,time),time):receivedAt;
  if(!Number.isFinite(this.lastRenderNow))this.lastRenderNow=receivedAt;
  this.publish(0,this.options);return true;
 }
 groundAt(actor,options,fallback=actor.position.y-Math.max(0,finite(actor.flight?.altitude))){
  const value=options.groundAt?.(actor.position,actor);
  if(Number.isFinite(value))return value;
  if(Number.isFinite(value?.y))return value.y+.4;
  // The authoritative room uses the world datum when no floor ray hits.
  if(options.groundAt)return .4;
  return fallback;
 }
 advance(actor,input,delta,options,localTime){
  let state=actor;
  // The render frame may be slow; retain its elapsed time while recalculating
  // assistance and physical sweeps in short, deterministic control intervals.
  for(let remaining=Math.max(0,Math.min(this.staleAfter/1000,delta));remaining>1e-8;){const step=Math.min(.05,remaining);remaining-=step;state=this.advanceStep(state,input,step,options,localTime-remaining*1000);}
  return state;
 }
 advanceStep(actor,input,delta,options,localTime){
  let state=cloneActor(actor);const environment=options.environment||{},serverNow=this.clockOffset!==null?localTime-this.clockOffset:finite(this.lastServerTime,localTime)+(localTime-this.receivedAt);
  const blocked=(from,to,yaw)=>options.blocked?.(from,to,yaw,state)===true;
  if(isAircraft(state)){
   const controls=aircraftAssistedInput(state,{...input},environment,serverNow),runway=environment.airport?.runway,onRunway=!runway||(Math.abs(state.position.x-runway.x)<runway.width/2-1&&Math.abs(state.position.z-runway.z)<runway.length/2);
   const cleared=typeof options.cleared==='function'?options.cleared(state):options.cleared!==undefined?options.cleared:!environment.airport?.enabled||(onRunway&&state.flight?.clearance==='takeoff');
   const pose=stepAircraftFlight(state,options.fuel<=0?{...controls,throttle:0}:controls,delta,{ground:this.groundAt(state,options),ceiling:environment.airport?.ceiling||80,half:Math.max(20,Math.min(2000,Number(environment.builderScene?.mapSize)||200))/2,cleared,blocked});
   // Impact damage belongs to the server; rendering must not apply it twice.
   pose.flight.impactDamage=0;Object.assign(state,pose);
  }else if(isWatercraft(state)){
   const controls=boatAssistedInput(state,{...input},environment,serverNow,options.actors||{},blocked);const pose=stepBoatSimulation(state,options.fuel<=0?{...controls,throttle:0}:controls,delta,{environment,now:serverNow,blocked});pose.boating.impactDamage=0;Object.assign(state,pose);
  }else if(isRoadVehicle(state)){Object.assign(state,stepRoadVehicle(state,input,delta,{speedLimit:roadSpeedLimit(environment,state.position)/3.6,groundAt:point=>{const floor=options.groundAt?.(point,state);return typeof floor==='number'?{...point,y:floor}:floor||(!options.groundAt?point:null);},blocked}));}else if(options.step){state={...state,...options.step({actor:state,input:{...input},dt:delta,options})};}
  return state;
 }
 publish(delta,options){
  if(!this.state)return null;const decay=Math.exp(-this.correctionRate*delta);
  for(const axis of ['x','y','z']){this.offset[axis]*=decay;this.rotationOffset[axis]*=decay;}
  const state=this.state,display={...state,predicted:true,position:{...state.position},rotation:{...state.rotation}};
  for(const axis of ['x','y','z']){display.position[axis]+=this.offset[axis];display.rotation[axis]=finite(display.rotation[axis])+this.rotationOffset[axis];}
  // Even reconciliation smoothing may not cross known geometry or the floor.
  if(options.blocked?.(state.position,display.position,display.rotation.y,state)){
   display.position={...state.position};this.offset={x:0,y:0,z:0};
  }
  if(isAircraft(state)){const ground=this.groundAt(display,options,this.groundAt(state,{}));if(display.position.y<ground){display.position.y=ground;this.offset.y=0;}}
  if(isWatercraft(state)){display.position.y=0;this.offset.y=0;}
  this.display=display;return display;
 }
 sample(now,delta,controls={},options={}){
  if(!this.state)return null;if(!Number.isFinite(now))return this.display;this.options=options;
  // Simulation uses this predictor's actual sampling timeline. Frame-start
  // deltas can omit expensive work before this call or be visually capped.
  const dt=Math.max(0,Math.min(this.staleAfter/1000,(now-this.lastRenderNow)/1000)),end=Math.min(now,this.receivedAt+this.staleAfter),duration=Math.max(0,Math.min(this.staleAfter/1000,(end-this.lastNow)/1000)),start=end-duration*1000;
  if(duration>0&&this.state.active!==false){
   this.state=this.advance(this.state,controls,duration,options,end);this.history.push({start,end,input:{...controls}});
   while(this.history.length>512||this.history.length>2&&this.history[1].end<now-3000)this.history.shift();
  }
  this.lastNow=now;this.lastRenderNow=now;return this.publish(dt,options);
 }
}
