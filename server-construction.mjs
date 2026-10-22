import {constructionMachineKind,isConstructionMachine,constructionClamp as clamp,initialConstructionState,craneHookPosition,constructionTarget,stepConstructionHydraulics,stepCraneAlignment,constructionTravelStatus,CONSTRUCTION_LOAD_OFFSET} from './public/js/construction-state.js';
import {constructionJointPose} from './public/js/construction-kinematics.js';
import {constructionColliders,constructionBox,constructionBoxContact,constructionMotionBlocked,constructionColliderBounds} from './public/js/construction-collision.js';
import {constructionObstacles,constructionMovementBlocked} from './server-construction-collision.mjs';

const error=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const near=(a,b,reach)=>Math.hypot(a.x-b.x,a.z-b.z)<=reach;
const point=(source,fallback)=>Object.fromEntries(Object.entries(fallback).map(([key,value])=>[key,Number.isFinite(Number(source?.[key]))?Number(source[key]):value]));
const event=(sim,now,message)=>{sim.events.push({id:'construction-'+now+'-'+sim.sequence,type:'construction',message,at:now});sim.construction.message=message;};
export const CONSTRUCTION_CAPACITY=Object.freeze({crane:12,truck:40,excavator:2,bulldozer:0});
function syncStructure(sim){
 const tower=sim.construction.tower;
 const add=(id,kind,floor,position,size)=>{if(sim.actors[id])return;const asset={id:'builder-material-cube',buildAssetId:'material:cube',name:kind==='facade'?'Tower glazing':'Completed tower '+kind,type:'building-material',format:'procedural-3d'},rotation={x:0,y:0,z:0},scale={x:size.x/1.2,y:size.y/1.2,z:size.z/1.2};sim.actors[id]={id,modelId:'material:cube',asset,position,rotation,scale,active:true,health:1000,spawned:true,constructionManaged:true,constructionStructure:{kind,floor,size},definition:{objectId:id,modelId:'material:cube',asset,transform:{position,rotation,scale},gameplay:{behavior:'decor',destructible:false,health:1000}}};};
 for(let floor=1;floor<=tower.floors;floor++){
  const y=tower.baseY+floor*tower.floorHeight;add('construction-floor-'+floor,'floor',floor,{x:tower.x,y:y-.16,z:tower.z},{x:tower.width-.4,y:.16,z:tower.depth-.4});
  for(let corner=0;corner<4;corner++)add('construction-column-'+floor+'-'+corner,'column',floor,{x:tower.x+(corner%2?.5:-.5)*tower.width,y:y-tower.floorHeight,z:tower.z+(corner<2?-.5:.5)*tower.depth},{x:.36,y:tower.floorHeight,z:.36});
  const centerY=y-tower.floorHeight/2,height=tower.floorHeight-.7;
  add('construction-facade-'+floor+'-north','facade',floor,{x:tower.x,y:centerY-height/2,z:tower.z-tower.depth/2+.08},{x:tower.width-.7,y:height,z:.08});
  add('construction-facade-'+floor+'-east','facade',floor,{x:tower.x+tower.width/2-.08,y:centerY-height/2,z:tower.z},{x:.08,y:height,z:tower.depth-.7});
 }
}
const payloadPosition=actor=>({...craneHookPosition(actor),y:craneHookPosition(actor).y-CONSTRUCTION_LOAD_OFFSET});
function beamActorAt(beam,position,yaw=beam.rotation?.y||0){return {...beam,position:{...position},rotation:{x:0,y:yaw,z:0}};}
function assemblyBeam(actor){return {id:'payload-check',position:payloadPosition(actor),rotation:{y:actor.construction.loadYaw||0},constructionBeam:{state:'placed'},active:true};}
function beamPlacementBlocked(sim,actor,beam,position,yaw,context={}){
 const from=assemblyBeam(actor),to=beamActorAt(from,position,yaw),ignored=[actor.id,beam.id];
 const obstacles=constructionObstacles(sim,context).filter(box=>!ignored.includes(box.objectId));
 const motion=constructionMotionBlocked(from,to,obstacles,{ignoreIds:ignored});if(motion)return motion;
 for(const part of constructionColliders(to))for(const obstacle of obstacles)if(constructionBoxContact(part,obstacle))return {part:part.part,objectId:obstacle.objectId,reason:part.part+' final placement obstructed by '+obstacle.part};return null;
}
function releaseReadiness(sim,actor,context={}){
 const state=actor.construction,beam=sim.actors[state.load];if(!beam?.constructionBeam)return {allowed:false,reason:'Attach a steel beam before releasing.'};
 const bottom=payloadPosition(actor),target=sim.construction.tower.target,yaw=state.loadYaw||0;
 const aligned=target&&near(bottom,target,.6)&&Math.abs(bottom.y-target.y)<=.3&&Math.abs(Math.atan2(Math.sin(yaw-target.yaw),Math.cos(yaw-target.yaw)))<=.12;
 if(aligned){const blocked=beamPlacementBlocked(sim,actor,beam,target,target.yaw,context);return blocked?{allowed:false,reason:'Steel placement obstructed: '+blocked.reason}:{allowed:true,reason:'Aligned with the structural connection. Secure the beam.',target};}
 const supply=sim.construction.supply;
 if(near(bottom,supply,5)&&Math.abs(bottom.y-supply.y)<=.25&&!beamPlacementBlocked(sim,actor,beam,bottom,yaw,context))return {allowed:true,reason:'Steel supported at the delivery rack.',position:bottom};
 if(context.collision&&context.environment){
  const others=Object.fromEntries(Object.entries(sim.actors).filter(([id])=>id!==beam.id&&id!==actor.id)),floors=[];
  for(const along of [-8.4,0,8.4]){const point={x:bottom.x+Math.cos(yaw)*along,y:bottom.y+.25,z:bottom.z-Math.sin(yaw)*along},floor=context.collision.groundAt(context.environment,point,{actors:others,objects:context.objects,maxRise:.05});if(!floor||Math.abs(bottom.y-floor.y)>.25)return {allowed:false,reason:'Lower the steel onto a supported floor or align precisely with the tower target.'};floors.push(floor.y);}
  const position={...bottom,y:Math.max(...floors)};const blocked=beamPlacementBlocked(sim,actor,beam,position,yaw,context);if(blocked)return {allowed:false,reason:'Steel set-down obstructed: '+blocked.reason};return {allowed:true,reason:'Steel supported on clear ground.',position};
 }
 return {allowed:false,reason:'Lower the steel to the supply rack or highlighted tower connection before releasing.'};
}
function attachReadiness(sim,actor,context={}){
 if(actor.construction.load)return {allowed:false,reason:'Release the attached beam before lifting another.'};
 const bottom=payloadPosition(actor),beam=availableBeams(sim).filter(beam=>near(beam.position,bottom,1.25)&&Math.abs(beam.position.y-bottom.y)<.65).sort((a,b)=>Math.hypot(a.position.x-bottom.x,a.position.z-bottom.z)-Math.hypot(b.position.x-bottom.x,b.position.z-bottom.z))[0];
 if(!beam)return {allowed:false,reason:'Lower and center the hook above a loose steel beam.'};
 const payload={...actor,construction:{...actor.construction,load:beam.id,loadYaw:beam.rotation?.y||0}},obstacles=constructionObstacles(sim,context).filter(box=>box.objectId!==actor.id&&box.objectId!==beam.id),target=beamActorAt(beam,bottom),blocked=constructionMotionBlocked(beam,target,obstacles,{ignoreIds:[actor.id,beam.id]});
 // The hook must also have a clear, short path to the actual lifting eyes.
 if(context.collision&&context.environment){const hook=craneHookPosition(actor),to={x:beam.position.x,y:beam.position.y+CONSTRUCTION_LOAD_OFFSET,z:beam.position.z},delta=[to.x-hook.x,to.y-hook.y,to.z-hook.z],distance=Math.hypot(...delta),others=Object.fromEntries(Object.entries(sim.actors).filter(([id])=>id!==actor.id&&id!==beam.id));if(distance>.02&&context.collision.blocksShot(context.environment,hook,delta.map(value=>value/distance),distance,others))return {allowed:false,reason:'The rigging path to the steel is obstructed.'};}
 if(blocked)return {allowed:false,reason:'The hook or load envelope is obstructed: '+blocked.reason};
 for(const part of constructionColliders(target))for(const obstacle of obstacles)if(constructionBoxContact(part,obstacle))return {allowed:false,reason:'The steel lifting envelope is obstructed by '+obstacle.part};
 return {allowed:true,reason:'Hook centered over the steel lifting points.',beam};
}
function workReadiness(sim,actor){
 const state=actor.construction,kind=constructionMachineKind(actor),site=sim.construction;
 if(state.workCycle)return {allowed:false,reason:'Wait for the current hydraulic work cycle to finish.'};
 if(Math.abs(actor.driving?.speed||0)>.15)return {allowed:false,reason:'Park the machine before using the work cycle.'};
 if(kind==='excavator'){
  if(!near(actor.position,site.excavation,site.excavation.radius+5))return {allowed:false,reason:'Position the excavator beside the marked excavation.'};
  if(state.load>0){const trucks=Object.values(sim.actors).filter(other=>constructionMachineKind(other)==='truck'&&other.active!==false&&near(actor.position,other.position,10));if(!trucks.length)return {allowed:false,reason:'Position an available dumptruck within 10 metres of the excavator.'};const truck=trucks.find(truck=>Math.abs(truck.driving?.speed||0)<.15&&(truck.construction?.bed||0)<=.08&&(truck.construction?.load||0)+state.load<=CONSTRUCTION_CAPACITY.truck);if(!truck)return {allowed:false,reason:'The receiving truck must be parked, body lowered, and have room for this bucket.'};return {allowed:true,reason:'Parked truck ready to receive this bucket.',mode:'load',truck};}
  if(site.excavation.depth>=8)return {allowed:false,reason:'Excavation has reached the planned depth.'};return {allowed:true,reason:'Excavation work envelope ready.',mode:'dig'};
 }
 if(kind==='truck'){if(!state.load)return {allowed:false,reason:'Load this truck from the excavator first.'};if(!near(actor.position,site.stockpile,14))return {allowed:false,reason:'Drive to the marked spoil stockpile before tipping.'};return {allowed:true,reason:'Parked at the spoil stockpile.',mode:'dump'};}
 if(kind==='bulldozer'){if(!near(actor.position,site.stockpile,18)&&!near(actor.position,site.excavation,18))return {allowed:false,reason:'Move the bulldozer to the excavation or spoil stockpile to grade soil.'};return {allowed:true,reason:'Grading work envelope ready.',mode:'grade'};}
 return {allowed:false,reason:'Use the crane lifting controls.'};
}
export function constructionTelemetry(sim,actor,now,context={}){
 const state=actor.construction,kind=constructionMachineKind(actor),travel=constructionTravelStatus(actor),attach=kind==='crane'?attachReadiness(sim,actor,context):{allowed:false,reason:'This machine has no lifting hook.'},release=kind==='crane'?releaseReadiness(sim,actor,context):{allowed:false,reason:'This machine has no lifting hook.'},work=workReadiness(sim,actor),hookLoadTonnes=kind==='crane'&&state.load?3.2:0,safeWorkingLoadTonnes=kind==='crane'?Math.min(12,168/Math.max(4,state.trolley||4)):null;
 const axes=now-state.controlAt<350?{...state.axes}:{},cycle=state.workCycle,limits={};for(const [axis,min,max]of [['trolley',4,42],['hoist',.8,74],['boom',.3,1.3],['stick',-1.5,-.2],['bucket',-1.2,1.2],['blade',0,1.2],['bed',0,.95]])limits[axis]={min:state[axis]<=min+.001,max:state[axis]>=max-.001};
 return {travelAllowed:travel.allowed,travelReason:travel.reason,canAttach:attach.allowed,attachReason:attach.reason,canRelease:release.allowed,releaseReason:release.reason,canWork:work.allowed,workReason:work.reason,load:kind==='crane'?hookLoadTonnes:state.load||0,loadCapacity:CONSTRUCTION_CAPACITY[kind],loadPercent:kind==='crane'?hookLoadTonnes/(safeWorkingLoadTonnes||1)*100:(state.load||0)/Math.max(1,CONSTRUCTION_CAPACITY[kind])*100,hookLoadTonnes,safeWorkingLoadTonnes,loadMomentPercent:hookLoadTonnes*(state.trolley||0)/168*100,cycleProgress:cycle?clamp((cycle.elapsed||0)/cycle.duration,0,1):0,cyclePhase:cycle?.mode||state.assist||'idle',hydraulicsActive:!!state.working,precision:!!state.precision,blocked:!!state.blocked,blockedPart:state.blocked?.part||null,blockedReason:state.blocked?.reason||'',limits,status:state.blocked?.reason||(cycle?'Hydraulic cycle active':state.assist?'Alignment assistance active':'Hydraulics neutral'),axes};
}
function addBeam(sim,index){
 const site=sim.construction,id='construction-beam-'+index,supply=site.supply,position={x:supply.x,y:supply.y,z:supply.z+(index%6)*1.1};
 const asset={id:'builder-construction-steel-beam',buildAssetId:'construction-steel-beam',name:'Structural steel beam',type:'construction',format:'procedural-3d'};
 sim.actors[id]={id,modelId:'construction-steel-beam',asset,name:'Structural steel beam',position,rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},health:100,active:true,spawned:true,constructionManaged:true,constructionBeam:{state:'supply',index},definition:{objectId:id,modelId:'construction-steel-beam',asset,transform:{position,rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}},gameplay:{behavior:'decor',health:100,interactionDistance:0}}};
 return sim.actors[id];
}
export function ensureConstruction(sim,environment){
 const machines=Object.values(sim.actors).filter(isConstructionMachine),config=environment.construction||environment.builderScene?.layoutMeta?.construction;
 if(!machines.length&&!config?.enabled)return;
 if(!sim.construction){
  const tower={...point(config?.tower,{x:5,z:-10,width:18,depth:18,baseY:0,floorHeight:4,maxFloors:16}),placed:0,floors:0};
  tower.width=clamp(tower.width,6,26);tower.depth=clamp(tower.depth,6,26);tower.floorHeight=clamp(tower.floorHeight,2,5);tower.maxFloors=Math.floor(clamp(tower.maxFloors,1,Math.floor(68/tower.floorHeight)));tower.target=constructionTarget(tower);
  sim.construction={version:1,tower,supply:point(config?.supply,{x:-8,y:.8,z:15}),excavation:{...point(config?.excavation,{x:25,z:17,radius:12}),depth:0,volume:0},stockpile:{...point(config?.stockpile,{x:30,z:33}),volume:0},graded:0,nextBeam:6,message:'Lower the crane hook to the steel store, attach a beam, then place it on the illuminated frame target.'};
  for(let index=0;index<6;index++)addBeam(sim,index);
 }
 for(const actor of machines){actor.construction||=initialConstructionState(actor,sim.construction.supply);if(constructionMachineKind(actor)==='crane')actor.construction.hook=craneHookPosition(actor);}
 syncStructure(sim);
}
function availableBeams(sim){return Object.values(sim.actors).filter(actor=>actor.constructionBeam&&['supply','loose'].includes(actor.constructionBeam.state));}
function craneRelease(sim,actor,now,context={}){
 const state=actor.construction,beam=sim.actors[state.load];if(!beam)error('Attach a steel beam before releasing.');
 const readiness=releaseReadiness(sim,actor,context);if(!readiness.allowed)error(readiness.reason);const tower=sim.construction.tower,target=readiness.target;
 if(target){
  beam.position={x:target.x,y:target.y,z:target.z};beam.rotation.y=target.yaw;beam.constructionBeam.state='placed';beam.constructionBeam.floor=target.level;
  tower.placed++;tower.floors=Math.floor(tower.placed/4);tower.target=constructionTarget(tower);
  syncStructure(sim);
  const complete=!tower.target;event(sim,now,complete?'Skyscraper complete! All '+tower.maxFloors+' steel floors are assembled.':'Beam secured. '+tower.placed+' / '+tower.maxFloors*4+' beams · '+tower.floors+' complete floors.');
 }else{
  beam.position={...readiness.position};beam.rotation.y=state.loadYaw||0;beam.constructionBeam.state='loose';event(sim,now,'Beam safely set down on its supporting surface. Reattach it to continue building.');
 }
 delete beam.constructionBeam.craneId;state.load=null;state.assist=null;state.axes={};return sim.construction.message;
}
function runConstructionCommand(sim,player,command,now,context={}){
 const actor=sim.actors[player.vehicleId];
 if(!sim.construction||!isConstructionMachine(actor)||actor.active===false||actor.holderId!==player.actorId)error('Enter an available construction machine before operating its controls.');
 if(command.entityId&&command.entityId!==actor.id)error('Those controls belong to another machine.');
 if(player.health<=0||!near(player.position,actor.position,8))error('Return to the machine operator station.');
 const state=actor.construction,kind=constructionMachineKind(actor),operation=command.operation;
 if(operation==='control'){
  const allowed=kind==='crane'?['slew','trolley','hoist','loadYaw']:kind==='excavator'?['slew','boom','stick','bucket']:kind==='truck'?['bed']:['blade'];
  if(command.axes!==undefined&&(!command.axes||typeof command.axes!=='object'||Array.isArray(command.axes)))error('Choose valid hydraulic control axes.',422);
  state.axes=Object.fromEntries(allowed.map(key=>[key,clamp(command.axes?.[key],-1,1)]));state.controlAt=now;
  if(Object.values(state.axes).some(Math.abs)){state.assist=null;state.assistLowering=false;delete state.workCycle;}
  return 'Hydraulic controls updated.';
 }
 if(operation==='precision'){state.precision=command.enabled!==false;return state.precision?'Precision hydraulics: 30% speed.':'Normal hydraulic speed.';}
 if(operation==='park'){state.axes={};state.assist=null;state.working=false;delete state.workCycle;actor.driving={...actor.driving,speed:0,throttle:0,parked:true};player.input={};return 'Machine parked. Hydraulics neutral.';}
 if(kind==='crane'){
  if(operation==='attach'){
   if(state.load)error('Release the attached beam before lifting another.');
   const readiness=attachReadiness(sim,actor,context);if(!readiness.allowed)error(readiness.reason);const beam=readiness.beam;
   beam.constructionBeam.state='attached';beam.constructionBeam.craneId=actor.id;state.load=beam.id;state.loadYaw=beam.rotation?.y||0;beam.position=payloadPosition(actor);state.assist=null;state.axes={};event(sim,now,'Steel beam attached. Raise the hoist, slew to the tower and lower onto the highlighted target.');return sim.construction.message;
  }
  if(operation==='release')return craneRelease(sim,actor,now,context);
  if(operation==='aim-target'||operation==='aim-supply'){
   if(operation==='aim-target'&&!sim.construction.tower.target)error('The skyscraper frame is already complete.');
   if(operation==='aim-supply'&&!availableBeams(sim).length)addBeam(sim,sim.construction.nextBeam++);
   const obstacles=constructionObstacles(sim,context),radius=52;let ceiling=0;for(const box of obstacles){if(box.objectId===actor.id||box.objectId===state.load)continue;const b=constructionColliderBounds(box),x=clamp(actor.position.x,b.min.x,b.max.x),z=clamp(actor.position.z,b.min.z,b.max.z);if(Math.hypot(x-actor.position.x,z-actor.position.z)<radius&&b.max.y<75)ceiling=Math.max(ceiling,b.max.y);}
   state.assistClearance=Math.min(74,ceiling-actor.position.y+CONSTRUCTION_LOAD_OFFSET+2);state.assist=operation==='aim-target'?'target':'supply';state.assistLowering=false;state.axes={};state.controlAt=now;return 'Crane alignment assistance engaged. Manual controls take over immediately.';
  }
 }else if(operation==='work'){
  const ready=workReadiness(sim,actor);if(!ready.allowed)error(ready.reason);
  const startPose=Object.fromEntries(['boom','stick','bucket','swing','blade','bed'].map(key=>[key,state[key]||0]));
  const truck=ready.truck,truckYaw=truck?.rotation?.y||0,dx=truck?truck.position.x+Math.sin(truckYaw)*1.4-actor.position.x:0,dz=truck?truck.position.z+Math.cos(truckYaw)*1.4-actor.position.z:0;
  const desired=truck?Math.atan2(-dx,-dz)-(actor.rotation?.y||0):state.swing||0,difference=Math.atan2(Math.sin(desired-(state.swing||0)),Math.cos(desired-(state.swing||0)));
  state.workCycle={start:now,elapsed:0,duration:ready.mode==='load'?Math.max(5600,Math.abs(difference)/.8*2000+2600):ready.mode==='dump'?4200:ready.mode==='dig'?3600:2800,mode:ready.mode,startPose,truckId:truck?.id,targetSwing:(state.swing||0)+difference,transferred:false};
  state.axes={};state.assist=null;player.input={};actor.driving={...actor.driving,speed:0,parked:true};
  return ready.mode==='dig'?'Dig cycle: lower, scoop, curl and lift.':ready.mode==='load'?'Load cycle: raise, swing, discharge over the parked truck and return.':ready.mode==='dump'?'Dump cycle: raise body, discharge at the spoil pad and lower.':'Grading cycle: lower the blade into the work area and finish the pass.';
 }
 error('Choose an available operation for this construction machine.',422);
}
function cycleCandidate(actor,dt){
 const state={...actor.construction},cycle={...state.workCycle,paused:false},from=cycle.startPose;
 cycle.elapsed=Math.min(cycle.duration,(cycle.elapsed||0)+dt*1000);state.workCycle=cycle;const t=cycle.elapsed/cycle.duration;
 const frames=cycle.mode==='dig'?[[0,from],[.28,{boom:.4,stick:-1.5,bucket:1}],[.58,{boom:.4,stick:-1.5,bucket:-.9}],[1,{boom:.9,stick:-.8,bucket:-.9}]]:
  // Keep the high, curled arm fixed through each swing. Lowering/retracting
  // while simultaneously returning used to clip the receiving truck's cab.
  cycle.mode==='load'?[[0,from],[.13,{boom:1.3,stick:-.2,bucket:-.9,swing:from.swing}],[.38,{boom:1.3,stick:-.2,bucket:-.9,swing:cycle.targetSwing}],[.48,{boom:.8,stick:-.3,bucket:-.9,swing:cycle.targetSwing}],[.58,{boom:.8,stick:-.3,bucket:1,swing:cycle.targetSwing}],[.7,{boom:1.3,stick:-.2,bucket:0,swing:cycle.targetSwing}],[.95,{boom:1.3,stick:-.2,bucket:0,swing:from.swing}],[1,{boom:1.05,stick:-.8,bucket:0,swing:from.swing}]]:
  cycle.mode==='dump'?[[0,from],[.48,{bed:.95}],[.7,{bed:.95}],[1,{bed:0}]]:[[0,from],[.35,{blade:0}],[.75,{blade:0}],[1,{blade:1}]];
 let low=frames[0],high=frames.at(-1);for(let i=1;i<frames.length;i++)if(t<=frames[i][0]){low=frames[i-1];high=frames[i];break;}
 const amount=clamp((t-low[0])/Math.max(.001,high[0]-low[0]),0,1);
 for(const key of ['boom','stick','bucket','swing','blade','bed']){const a=low[1][key]??from[key],b=high[1][key]??a;state[key]=a+(b-a)*amount;}
 state.working=true;return state;
}
function finishCycleEffects(sim,actor,now){
 const state=actor.construction,cycle=state.workCycle,t=cycle.elapsed/cycle.duration;
 if(cycle.mode==='load'&&t>=.58&&!cycle.transferred){
  const truck=sim.actors[cycle.truckId],tip=constructionJointPose(actor).bucketTip;
  const receiving=truck&&{x:truck.position.x+Math.sin(truck.rotation?.y||0)*1.4,y:truck.position.y+3,z:truck.position.z+Math.cos(truck.rotation?.y||0)*1.4};
  if(!truck||truck.active===false||Math.abs(truck.driving?.speed||0)>.15||(truck.construction.bed||0)>.08||(truck.construction.load||0)+state.load>CONSTRUCTION_CAPACITY.truck||Math.hypot(tip.x-receiving.x,tip.z-receiving.z)>3||tip.y<receiving.y-.2){
   state.blocked={part:'excavator-bucket',reason:'Receiving truck moved or its bed is outside the bucket discharge envelope.'};state.working=false;delete state.workCycle;return;
  }
  truck.construction.load+=state.load;state.load=0;cycle.transferred=true;event(sim,now,'Dumptruck loaded. Drive the spoil to the marked stockpile.');
 }
 if(cycle.mode==='dump'&&t>=.65&&!cycle.transferred){sim.construction.stockpile.volume+=state.load;state.load=0;cycle.transferred=true;event(sim,now,'Spoil unloaded at the stockpile. Return for the next load.');}
 if(t<1)return;
 if(cycle.mode==='dig'){const site=sim.construction.excavation;state.load=2;site.volume+=2;site.depth=Math.min(8,site.depth+.15);event(sim,now,'Two cubic metres excavated. Park a dumptruck in the excavator loading envelope to transfer the bucket.');}
 if(cycle.mode==='grade'){sim.construction.graded=Math.min(100,sim.construction.graded+10);event(sim,now,'Site grading '+sim.construction.graded+'% complete.');}
 delete state.workCycle;state.working=false;
}
function refreshTelemetry(sim,actor,now,context){actor.construction.telemetry=constructionTelemetry(sim,actor,now,context);}
export function stepConstruction(sim,now,dt,context={}){
 if(!sim.construction)return;
 for(const actor of Object.values(sim.actors).filter(isConstructionMachine)){
  const owner=sim.players[actor.holderId],occupied=owner&&owner.vehicleId===actor.id&&!owner.replacedByRoom&&now-owner.lastSeen<15000&&owner.health>0;
  if(!occupied){actor.construction.axes={};actor.construction.assist=null;actor.construction.working=false;delete actor.construction.workCycle;refreshTelemetry(sim,actor,now,context);continue;}
  // A delayed packet stops motion immediately but does not discard a task
  // already accepted from the seated operator. No cycle time or soil moves
  // while the input link is stale; fresh input can safely resume the task.
  if(now-owner.lastSeen>=1000){actor.construction.axes={};actor.construction.working=false;if(actor.construction.workCycle)actor.construction.workCycle.paused=true;actor.construction.blocked={part:'operator-link',reason:'Operator input delayed. Hydraulics paused until the link resumes.'};refreshTelemetry(sim,actor,now,context);continue;}
  const state=actor.construction;let candidate;
  if(state.workCycle)candidate=cycleCandidate(actor,dt);
  else if(state.assist){const point=state.assist==='target'?sim.construction.tower.target:availableBeams(sim)[0];const source=point?.position||point;
   if(source)candidate=stepCraneAlignment(actor,{...source,y:source.y+CONSTRUCTION_LOAD_OFFSET,yaw:point?.rotation?.y??point?.yaw??0},dt);else candidate={...state,assist:null};
  }else{
   const axes=now-state.controlAt<350?state.axes:{};
   const moving=Math.abs(actor.driving?.speed||0)>.15&&constructionMachineKind(actor)!=='bulldozer';
   candidate=stepConstructionHydraulics(actor,moving?{}:axes,dt);if(moving&&Object.values(axes||{}).some(Boolean))candidate.blocked={part:'hydraulics',reason:'Park before operating this machine hydraulic attachment.'};
  }
  let blocked=constructionMovementBlocked(sim,actor,{...actor,construction:candidate},context);
  if(constructionMachineKind(actor)==='crane'&&candidate.load){const bottom=payloadPosition({...actor,construction:candidate});if(bottom.y<-.02)blocked={part:'crane-payload',reason:'The steel load has reached ground level.'};}
  if(blocked){state.blocked=blocked;state.working=false;}
  else {actor.construction=candidate;if(!candidate.blocked||candidate.blocked.part!=='hydraulics')candidate.blocked=null;if(candidate.workCycle)finishCycleEffects(sim,actor,now);}
  const current=actor.construction,beam=sim.actors[current.load];if(constructionMachineKind(actor)==='crane'){current.hook=craneHookPosition(actor);if(beam?.constructionBeam){beam.position=payloadPosition(actor);beam.rotation.y=current.loadYaw||0;}}
  refreshTelemetry(sim,actor,now,context);
 }
 if(availableBeams(sim).length<2&&sim.construction.tower.target)addBeam(sim,sim.construction.nextBeam++);
}
export function constructionView(sim){
 if(!sim.construction)return null;
 return {...sim.construction,beams:Object.values(sim.actors).filter(actor=>actor.constructionBeam).map(actor=>({id:actor.id,position:actor.position,rotation:actor.rotation,...actor.constructionBeam}))};
}

export function constructionCommand(sim,player,command,now,context={}){const result=runConstructionCommand(sim,player,command,now,context),actor=sim.actors[player.vehicleId];if(isConstructionMachine(actor))refreshTelemetry(sim,actor,now,context);return result;}
