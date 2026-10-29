import {constructionStructure} from './public/js/construction-workplans.js';
import {createEarthworks,expandEarthworks,earthworksSurfaceAt,earthworksTake,earthworksDeposit,earthworksPush,earthCargo,earthCargoVolume,refreshEarthworksTotals} from './public/js/construction-earthworks.js';
import {constructionMachineKind,isConstructionMachine,constructionClamp as clamp,initialConstructionState,craneHookPosition,constructionTarget,stepConstructionHydraulics,stepCraneAlignment,constructionTravelStatus,CONSTRUCTION_LOAD_OFFSET} from './public/js/construction-state.js';
import {constructionJointPose} from './public/js/construction-kinematics.js';
import {constructionColliders,constructionBox,constructionBoxContact,constructionMotionBlocked,constructionColliderBounds} from './public/js/construction-collision.js';
import {constructionObstacles,constructionMovementBlocked} from './server-construction-collision.mjs';

const error=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
// Allow normal mobile heartbeat jitter; explicit neutral still stops immediately.
const MANUAL_CONTROL_LEASE_MS=600;
const near=(a,b,reach)=>Math.hypot(a.x-b.x,a.z-b.z)<=reach;
const point=(source,fallback)=>Object.fromEntries(Object.entries(fallback).map(([key,value])=>[key,Number.isFinite(Number(source?.[key]))?Number(source[key]):value]));
const event=(sim,now,message)=>{sim.events.push({id:'construction-'+now+'-'+sim.sequence,type:'construction',message,at:now});sim.construction.message=message;};
export const CONSTRUCTION_CAPACITY=Object.freeze({crane:12,truck:40,excavator:2,bulldozer:0});
function syncStructure(sim){
 for(const [structureId,tower]of [['tower',sim.construction.tower],['facility',sim.construction.facility]]){
 if(!tower)continue;
 const add=(id,kind,floor,position,size)=>{if(structureId!=='tower')id=id.replace('construction-','construction-'+structureId+'-');if(sim.actors[id])return;const asset={id:'builder-material-cube',buildAssetId:'material:cube',name:kind==='facade'?'Tower glazing':'Completed '+(structureId==='facility'?'facility':'tower')+' '+kind,type:'building-material',format:'procedural-3d'},rotation={x:0,y:0,z:0},scale={x:size.x/1.2,y:size.y/1.2,z:size.z/1.2};sim.actors[id]={id,modelId:'material:cube',asset,position,rotation,scale,active:true,health:1000,spawned:true,constructionManaged:true,constructionStructure:{kind,floor,size,structureId},definition:{objectId:id,modelId:'material:cube',asset,transform:{position,rotation,scale},gameplay:{behavior:'decor',destructible:false,health:1000}}};};
 for(let floor=1;floor<=tower.floors;floor++){
  const y=tower.baseY+floor*tower.floorHeight;add('construction-floor-'+floor,'floor',floor,{x:tower.x,y:y-.16,z:tower.z},{x:tower.width-.4,y:.16,z:tower.depth-.4});
  for(let corner=0;corner<4;corner++)add('construction-column-'+floor+'-'+corner,'column',floor,{x:tower.x+(corner%2?.5:-.5)*tower.width,y:y-tower.floorHeight,z:tower.z+(corner<2?-.5:.5)*tower.depth},{x:.36,y:tower.floorHeight,z:.36});
  const centerY=y-tower.floorHeight/2,height=tower.floorHeight-.7;
  if(!tower.frameOnly)add('construction-facade-'+floor+'-north','facade',floor,{x:tower.x,y:centerY-height/2,z:tower.z-tower.depth/2+.08},{x:tower.width-.7,y:height,z:.08});
  if(!tower.frameOnly)add('construction-facade-'+floor+'-east','facade',floor,{x:tower.x+tower.width/2-.08,y:centerY-height/2,z:tower.z},{x:.08,y:height,z:tower.depth-.7});
 }
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
 const bottom=payloadPosition(actor),target=constructionStructure(sim.construction,actor)?.target,yaw=state.loadYaw||0;
 const aligned=target&&near(bottom,target,.6)&&Math.abs(bottom.y-target.y)<=.3&&Math.abs(Math.atan2(Math.sin(yaw-target.yaw),Math.cos(yaw-target.yaw)))<=.12;
 if(aligned){const blocked=beamPlacementBlocked(sim,actor,beam,target,target.yaw,context);return blocked?{allowed:false,reason:'Steel placement obstructed: '+blocked.reason}:{allowed:true,reason:'Aligned with the structural connection. Secure the beam.',target};}
 const supply=sim.construction.supply;
 if(near(bottom,supply,5)&&Math.abs(bottom.y-supply.y)<=.25&&!beamPlacementBlocked(sim,actor,beam,bottom,yaw,context))return {allowed:true,reason:'Steel supported at the delivery rack.',position:bottom};
 if(context.collision&&context.environment){
  const others=Object.fromEntries(Object.entries(sim.actors).filter(([id])=>id!==beam.id&&id!==actor.id)),floors=[];
  for(const along of [-8.4,0,8.4]){const point={x:bottom.x+Math.cos(yaw)*along,y:bottom.y+.25,z:bottom.z-Math.sin(yaw)*along},floor=context.collision.groundAt(context.environment,point,{actors:others,objects:context.objects,earthworks:sim.construction.earthworks,maxRise:.05});if(!floor||Math.abs(bottom.y-floor.y)>.25)return {allowed:false,reason:'Lower the steel onto a supported floor or align precisely with the tower target.'};floors.push(floor.y);}
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
 if(context.collision&&context.environment){const hook=craneHookPosition(actor),to={x:beam.position.x,y:beam.position.y+CONSTRUCTION_LOAD_OFFSET,z:beam.position.z},delta=[to.x-hook.x,to.y-hook.y,to.z-hook.z],distance=Math.hypot(...delta),others=Object.fromEntries(Object.entries(sim.actors).filter(([id])=>id!==actor.id&&id!==beam.id));if(distance>.02&&context.collision.blocksShot(context.environment,hook,delta.map(value=>value/distance),distance,others,context.objects))return {allowed:false,reason:'The rigging path to the steel is obstructed.'};}
 if(blocked)return {allowed:false,reason:'The hook or load envelope is obstructed: '+blocked.reason};
 for(const part of constructionColliders(target))for(const obstacle of obstacles)if(constructionBoxContact(part,obstacle))return {allowed:false,reason:'The steel lifting envelope is obstructed by '+obstacle.part};
 return {allowed:true,reason:'Hook centered over the steel lifting points.',beam};
}
function normalizeCargo(sim,actor,{accountImport=true}={}){
 const state=actor.construction;if(constructionMachineKind(actor)==='crane')return;
 const cargo=earthCargo(state.cargo),legacy=Math.max(0,Number(state.load)||0);
 if(legacy>earthCargoVolume(cargo)+1e-6){const imported=legacy-earthCargoVolume(cargo);cargo.soil+=imported;if(accountImport&&sim.construction.earthworks)sim.construction.earthworks.importedVolume=(sim.construction.earthworks.importedVolume||0)+imported;}
 state.cargo=cargo;state.load=earthCargoVolume(cargo);
}
function updateCargo(state,cargo){state.cargo=earthCargo(cargo);state.load=earthCargoVolume(state.cargo);}
const addCargo=(a,b)=>({soil:(a?.soil||0)+(b?.soil||0),gravel:(a?.gravel||0)+(b?.gravel||0)});
const subtractCargo=(a,b)=>({soil:Math.max(0,(a?.soil||0)-(b?.soil||0)),gravel:Math.max(0,(a?.gravel||0)-(b?.gravel||0))});
const partCargo=(source,volume)=>{const total=earthCargoVolume(source),factor=total?Math.min(1,volume/total):0;return {soil:(source?.soil||0)*factor,gravel:(source?.gravel||0)*factor};};
function dumpOutlet(actor){const yaw=actor.rotation?.y||0;return {x:actor.position.x+Math.sin(yaw)*4,y:actor.position.y+1.55,z:actor.position.z+Math.cos(yaw)*4};}
function receivingTruck(sim,actor,tip=constructionJointPose(actor).bucketTip){
 return Object.values(sim.actors).find(truck=>{if(constructionMachineKind(truck)!=='truck'||truck.active===false||Math.abs(truck.driving?.speed||0)>.15||(truck.construction?.bed||0)>.08)return false;const yaw=truck.rotation?.y||0,center={x:truck.position.x+Math.sin(yaw)*1.4,z:truck.position.z+Math.cos(yaw)*1.4};return Math.hypot(tip.x-center.x,tip.z-center.z)<2.5&&tip.y>=truck.position.y+2.7;});
}
function recordEarthMove(sim,actor,volume,kind,now){if(volume<=1e-8)return;actor.construction.earthMoved=(actor.construction.earthMoved||0)+volume;actor.construction.lastEarthMove={volume,kind,at:now};const earth=sim.construction.earthworks;sim.construction.excavation.volume=earth.excavated;let depth=0;for(const patch of earth.patches)if(patch.kind==='excavation')for(const height of patch.heights)depth=Math.max(depth,patch.baseY-height);sim.construction.excavation.depth=depth;sim.construction.stockpile.volume=earth.deposited;sim.construction.graded=Math.min(100,earth.pushed/20*100);}
function clearMaterialDrop(sim,actor,from,to,context={},ignore=[]){
 if(!to||from.y<to.y-.15)return false;
 if(!context.collision||!context.environment||from.y-to.y<.08)return true;
 const actors=Object.fromEntries(Object.entries(sim.actors).filter(([id])=>id!==actor.id&&!ignore.includes(id))),distance=from.y-to.y;
 return !context.collision.blocksShot(context.environment,from,[0,-1,0],distance,actors,context.objects);
}
function dischargeBucket(sim,actor,amount,now,context={}){
 const state=actor.construction,tip=constructionJointPose(actor).bucketTip,source=partCargo(state.cargo,amount),truck=receivingTruck(sim,actor,tip);let moved;
 if(truck){if(!clearMaterialDrop(sim,actor,tip,{...tip,y:truck.position.y+2.7},context,[truck.id]))return 0;normalizeCargo(sim,truck);moved=partCargo(source,Math.max(0,CONSTRUCTION_CAPACITY.truck-truck.construction.load));updateCargo(truck.construction,addCargo(truck.construction.cargo,moved));}
 else {const surface=earthworksSurfaceAt(sim.construction.earthworks,tip);if(!surface||!clearMaterialDrop(sim,actor,tip,surface,context))return 0;moved=earthworksDeposit(sim.construction.earthworks,tip,source,{radius:1.6});}
 updateCargo(state,subtractCargo(state.cargo,moved));recordEarthMove(sim,actor,earthCargoVolume(moved),truck?'load':'deposit',now);return earthCargoVolume(moved);
}
function truckReceivingCells(actor,cellSize=2){
 const yaw=actor.rotation?.y||0,sin=Math.sin(yaw),cos=Math.cos(yaw);let rear=0;
 for(const part of constructionColliders(actor).filter(part=>/^truck-(?:front|rear)-(?:chassis|wheel)$/.test(part.part))){const m=part.matrix,extent=Math.abs(m[0]*sin+m[2]*cos)*part.size.x/2+Math.abs(m[4]*sin+m[6]*cos)*part.size.y/2+Math.abs(m[8]*sin+m[10]*cos)*part.size.z/2;rear=Math.max(rear,(part.center.x-actor.position.x)*sin+(part.center.z-actor.position.z)*cos+extent);}
 // A grid column is indivisible ground. Its entire top must remain behind
 // the real rear chassis/wheels so tipping cannot grow soil beneath the truck.
 return {radius:Math.max(2.4,cellSize+.4),allowedKinds:['stockpile','fill'],cellFilter:cell=>{const minimum=(cell.x-actor.position.x)*sin+(cell.z-actor.position.z)*cos-cell.patch.cellSize/2*(Math.abs(sin)+Math.abs(cos));return minimum>=rear+.08;}};
}
function dischargeTruck(sim,actor,amount,now,context={}){
 const outlet=dumpOutlet(actor),surface=earthworksSurfaceAt(sim.construction.earthworks,outlet);if(!surface||!clearMaterialDrop(sim,actor,outlet,surface,context))return 0;const state=actor.construction,moved=earthworksDeposit(sim.construction.earthworks,outlet,partCargo(state.cargo,amount),truckReceivingCells(actor,surface.patch.cellSize));updateCargo(state,subtractCargo(state.cargo,moved));recordEarthMove(sim,actor,earthCargoVolume(moved),'dump',now);return earthCargoVolume(moved);
}
function bladePass(sim,actor,requested,now,distance=.8){
 const blade=constructionJointPose(actor).bladeEdge,yaw=actor.rotation?.y||0,surface=earthworksSurfaceAt(sim.construction.earthworks,blade);if(!surface)return 0;
 const to={x:blade.x-Math.sin(yaw)*distance,y:Number.isFinite(actor.construction.gradeTarget)?actor.construction.gradeTarget:Math.max(blade.y+1.5,surface.y+.5),z:blade.z-Math.cos(yaw)*distance},cutY=Number.isFinite(actor.construction.gradeTarget)?Math.max(actor.construction.gradeTarget,blade.y-.12):Math.max(actor.position.y-.15,blade.y-.12),moved=earthworksPush(sim.construction.earthworks,blade,to,requested,{radius:1.9,cutY,looseOnly:surface.patch.kind!=='excavation'}),volume=earthCargoVolume(moved);recordEarthMove(sim,actor,volume,'push',now);return volume;
}
function digPose(actor,earthworks){const initial={...actor,construction:{...actor.construction,boom:.4,stick:-1.5,bucket:1}},tip=constructionJointPose(initial).bucketTip,surface=earthworksSurfaceAt(earthworks,tip);initial.construction.boom=clamp(.4+Math.max(0,(surface?.y||0)-actor.position.y)*.28,.4,1.3);return initial;}
function workReadiness(sim,actor){
 const state=actor.construction,kind=constructionMachineKind(actor),site=sim.construction;
 if(state.workCycle)return {allowed:false,reason:'Wait for the current hydraulic work cycle to finish.'};
 if(Math.abs(actor.driving?.speed||0)>.15)return {allowed:false,reason:'Park the machine before using the work cycle.'};
 if(kind==='excavator'){
  if(state.load>0){const trucks=Object.values(sim.actors).filter(other=>constructionMachineKind(other)==='truck'&&other.active!==false&&near(actor.position,other.position,10));if(!trucks.length)return {allowed:false,reason:'Position an available dumptruck within 10 metres of the excavator, or empty the bucket over an earthworks patch.'};const truck=trucks.find(truck=>Math.abs(truck.driving?.speed||0)<.15&&(truck.construction?.bed||0)<=.08&&(truck.construction?.load||0)+state.load<=CONSTRUCTION_CAPACITY.truck);if(!truck)return {allowed:false,reason:'The receiving truck must be parked, body lowered, and have room for this bucket.'};return {allowed:true,reason:'Parked truck ready to receive this bucket.',mode:'load',truck};}
  const digging=digPose(actor,site.earthworks),tip=constructionJointPose(digging).bucketTip,source=earthworksTake(site.earthworks,tip,CONSTRUCTION_CAPACITY.excavator,{radius:1.3,cutY:tip.y-.3,dryRun:true});if(earthCargoVolume(source)<=1e-6)return {allowed:false,reason:'No reachable soil or gravel beneath the bucket. Move to an unworked cell or lower the machine into the cut.'};return {allowed:true,reason:'Reachable finite soil or gravel ready for the bucket.',mode:'dig',digBoom:digging.construction.boom};
 }
 if(kind==='truck'){if(!state.load)return {allowed:false,reason:'Load this truck from the excavator first.'};const outlet=dumpOutlet(actor),surface=earthworksSurfaceAt(site.earthworks,outlet);if(!surface||!['stockpile','fill','excavation'].includes(surface.patch.kind))return {allowed:false,reason:'Position the rear discharge above a stockpile, road formation, fill or excavation patch before tipping.'};if(surface.y>outlet.y-.1)return {allowed:false,reason:'The material pile has reached the rear discharge. Move to a clear cell.'};const capacity=earthworksDeposit(site.earthworks,outlet,state.cargo,{...truckReceivingCells(actor,surface.patch.cellSize),dryRun:true});if(!earthCargoVolume(capacity))return {allowed:false,reason:'No clear receiving cells behind the chassis. Reposition within the fill or stockpile patch.'};return {allowed:true,reason:'Rear discharge over clear receiving cells behind the chassis.',mode:'dump'};}
 if(kind==='bulldozer'){const low={...actor,construction:{...state,blade:Number.isFinite(state.gradeTarget)?clamp(state.gradeTarget+.11-actor.position.y,0,1.2):0}},blade=constructionJointPose(low).bladeEdge,surface=earthworksSurfaceAt(site.earthworks,blade),source=surface&&earthworksTake(site.earthworks,blade,1,{radius:1.9,cutY:Number.isFinite(state.gradeTarget)?Math.max(state.gradeTarget,blade.y-.12):actor.position.y-.15,looseOnly:surface.patch.kind!=='excavation',dryRun:true});if(!source||earthCargoVolume(source)<=1e-6)return {allowed:false,reason:'Position the lowered blade against soil or gravel that can be pushed into the work patch.'};const yaw=actor.rotation?.y||0,target={x:blade.x-Math.sin(yaw)*.8,y:Number.isFinite(actor.construction.gradeTarget)?actor.construction.gradeTarget:Math.max(blade.y+1.5,surface.y+.5),z:blade.z-Math.cos(yaw)*.8},possible=earthworksPush(site.earthworks,blade,target,1,{radius:1.9,cutY:Number.isFinite(state.gradeTarget)?Math.max(state.gradeTarget,blade.y-.12):actor.position.y-.15,looseOnly:surface.patch.kind!=='excavation',dryRun:true});if(earthCargoVolume(possible)<=1e-6)return {allowed:false,reason:'The blade has no clear receiving cells ahead. Reposition within the work patch.'};return {allowed:true,reason:'Blade has reachable material and receiving space ahead.',mode:'grade'};}
 return {allowed:false,reason:'Use the crane lifting controls.'};
}
export function constructionTelemetry(sim,actor,now,context={}){
 const state=actor.construction,kind=constructionMachineKind(actor),travel=constructionTravelStatus(actor),attach=kind==='crane'?attachReadiness(sim,actor,context):{allowed:false,reason:'This machine has no lifting hook.'},release=kind==='crane'?releaseReadiness(sim,actor,context):{allowed:false,reason:'This machine has no lifting hook.'},work=workReadiness(sim,actor),hookLoadTonnes=kind==='crane'&&state.load?3.2:0,safeWorkingLoadTonnes=kind==='crane'?Math.min(12,168/Math.max(4,state.trolley||4)):null;
 const axes=now-state.controlAt<MANUAL_CONTROL_LEASE_MS?{...state.axes}:{},cycle=state.workCycle,limits={};for(const [axis,min,max]of [['trolley',4,42],['hoist',.8,74],['boom',.3,1.3],['stick',-1.5,-.2],['bucket',-1.2,1.2],['blade',0,1.2],['bed',0,.95]])limits[axis]={min:state[axis]<=min+.001,max:state[axis]>=max-.001};
 return {cargo:earthCargo(state.cargo),material:state.cargo?.gravel>0?'gravel':state.load>0?'soil':null,earthMoved:state.earthMoved||0,terrainRevision:sim.construction.earthworks?.revision||0,travelAllowed:travel.allowed,travelReason:travel.reason,canAttach:attach.allowed,attachReason:attach.reason,canRelease:release.allowed,canPlaceTower:!!(release.allowed&&release.target),releaseReason:release.reason,canWork:work.allowed,workReason:work.reason,load:kind==='crane'?hookLoadTonnes:state.load||0,loadCapacity:CONSTRUCTION_CAPACITY[kind],loadPercent:kind==='crane'?hookLoadTonnes/(safeWorkingLoadTonnes||1)*100:(state.load||0)/Math.max(1,CONSTRUCTION_CAPACITY[kind])*100,hookLoadTonnes,safeWorkingLoadTonnes,loadMomentPercent:hookLoadTonnes*(state.trolley||0)/168*100,cycleProgress:cycle?clamp((cycle.elapsed||0)/cycle.duration,0,1):0,cyclePhase:cycle?.mode||state.assist||'idle',hydraulicsActive:!!state.working,precision:!!state.precision,blocked:!!state.blocked,blockedPart:state.blocked?.part||null,blockedReason:state.blocked?.reason||'',limits,status:state.blocked?.reason||(cycle?'Hydraulic cycle active':state.assist?'Alignment assistance active':'Hydraulics neutral'),axes};
}
function addBeam(sim,index){
 const site=sim.construction,id='construction-beam-'+index,supply=site.supply,position={x:supply.x,y:supply.y,z:supply.z+(index%6)*1.1};
 const asset={id:'builder-construction-steel-beam',buildAssetId:'construction-steel-beam',name:'Structural steel beam',type:'construction',format:'procedural-3d'};
 sim.actors[id]={id,modelId:'construction-steel-beam',asset,name:'Structural steel beam',position,rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},health:100,active:true,spawned:true,constructionManaged:true,constructionBeam:{state:'supply',index},definition:{objectId:id,modelId:'construction-steel-beam',asset,transform:{position,rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}},gameplay:{behavior:'decor',health:100,interactionDistance:0}}};
 return sim.actors[id];
}
function migrateLegacyEarthworks(sim,legacy){
 const site=sim.construction,earth=site.earthworks,cut=earth.patches.find(patch=>patch.id==='excavation'),pile=earth.patches.find(patch=>patch.id==='spoil'),removed={soil:0,gravel:0};
 const cargo=Object.values(sim.actors).filter(isConstructionMachine).map(actor=>earthCargo(actor.construction?.cargo)).reduce(addCargo,{soil:0,gravel:0});
 if(!legacy.excavated&&!legacy.stockpile&&!earthCargoVolume(cargo))return;
 // Historical counters had no spatial cells. Spread their real volume over
 // the original cut instead of preserving the former artificial depth gain.
 let pending=Math.max(legacy.excavated,legacy.stockpile+earthCargoVolume(cargo));
 if(cut){const count=cut.heights.length,size=cut.cellSize;for(let index=0;index<count&&pending>1e-8;index++){const at={x:cut.origin.x+(index%cut.columns+.5)*size,y:cut.baseY,z:cut.origin.z+(Math.floor(index/cut.columns)+.5)*size},taken=earthworksTake(earth,at,pending/(count-index),{radius:0});removed.soil+=taken.soil;removed.gravel+=taken.gravel;pending-=earthCargoVolume(taken);}}
 const recovered=earthCargoVolume(removed),required={soil:legacy.stockpile+cargo.soil,gravel:cargo.gravel},imports={soil:Math.max(0,required.soil-removed.soil),gravel:Math.max(0,required.gravel-removed.gravel)},remainder={soil:Math.max(0,removed.soil-required.soil),gravel:Math.max(0,removed.gravel-required.gravel)},restored={soil:legacy.stockpile+remainder.soil,gravel:remainder.gravel};
 // Recover old removed material that was neither recorded at the pile nor
 // carried by a surviving machine. It remains visible at the real spoil pad.
 if(pile){const count=pile.heights.length,size=pile.cellSize;let unplaced={...restored};for(let index=0;index<count;index++){const share={soil:unplaced.soil/(count-index),gravel:unplaced.gravel/(count-index)},at={x:pile.origin.x+(index%pile.columns+.5)*size,y:Infinity,z:pile.origin.z+(Math.floor(index/pile.columns)+.5)*size},maxHeight=Math.max(6,pile.heights[index]-pile.baseY+earthCargoVolume(share)/(size*size)+.01),placed=earthworksDeposit(earth,at,share,{radius:0,maxHeight,allowedKinds:['stockpile']});unplaced=subtractCargo(unplaced,placed);}}
 earth.importedVolume=earthCargoVolume(imports);earth.importedCargo=imports;earth.excavated=recovered;earth.migration={version:1,legacyExcavatedVolume:legacy.excavated,legacyStockpileVolume:legacy.stockpile,recoveredCutVolume:recovered,recoveredUnrecordedCutVolume:Math.max(0,recovered-legacy.excavated),unrecoverableCutVolume:Math.max(0,legacy.excavated-recovered),recoveredUntrackedCargo:remainder,importedCargo:imports};
 site.excavation.volume=recovered;let depth=0;if(cut)for(const height of cut.heights)depth=Math.max(depth,cut.baseY-height);site.excavation.depth=depth;site.stockpile.volume=earth.deposited;site.graded=0;refreshEarthworksTotals(earth,Object.values(sim.actors).filter(isConstructionMachine).map(actor=>actor.construction.cargo));
}
export function ensureConstruction(sim,environment){
 const hadSite=!!sim.construction,machines=Object.values(sim.actors).filter(isConstructionMachine),config=environment.construction||environment.builderScene?.layoutMeta?.construction;
 if(!machines.length&&!config?.enabled)return;
 if(!sim.construction){
  const tower={...point(config?.tower,{x:5,z:-10,width:18,depth:18,baseY:0,floorHeight:4,maxFloors:16}),placed:0,floors:0};
  tower.width=clamp(tower.width,6,26);tower.depth=clamp(tower.depth,6,26);tower.floorHeight=clamp(tower.floorHeight,2,5);tower.maxFloors=Math.floor(clamp(tower.maxFloors,1,Math.floor(68/tower.floorHeight)));tower.target=constructionTarget(tower);
  sim.construction={version:1,tower,supply:point(config?.supply,{x:-8,y:.8,z:15}),excavation:{...point(config?.excavation,{x:25,z:17,radius:12}),depth:0,volume:0},stockpile:{...point(config?.stockpile,{x:30,z:39}),volume:0},graded:0,nextBeam:6,message:'Lower the crane hook to the steel store, attach a beam, then place it on the illuminated frame target.'};
  for(let index=0;index<6;index++)addBeam(sim,index);
 }
 if(config?.facility&&!sim.construction.facility){const facility={...point(config.facility,{x:-41,z:5,width:18,depth:18,baseY:0,floorHeight:4,maxFloors:3}),placed:0,floors:0,frameOnly:true};facility.width=clamp(facility.width,6,26);facility.depth=clamp(facility.depth,6,26);facility.floorHeight=clamp(facility.floorHeight,2,5);facility.maxFloors=Math.floor(clamp(facility.maxFloors,1,12));facility.target=constructionTarget(facility);sim.construction.facility=facility;}
 const migratingLegacy=hadSite&&!sim.construction.earthworks,legacy=migratingLegacy?{excavated:Math.max(0,Number(sim.construction.excavation.volume)||0),stockpile:Math.max(0,Number(sim.construction.stockpile.volume)||0)}:null;
 sim.construction.earthworks ||= createEarthworks({...config,excavation:{...sim.construction.excavation,...config?.excavation},stockpile:{...sim.construction.stockpile,...config?.stockpile}});
 for(const actor of machines){actor.construction||=initialConstructionState(actor,sim.construction.supply);normalizeCargo(sim,actor,{accountImport:!migratingLegacy});if(constructionMachineKind(actor)==='crane')actor.construction.hook=craneHookPosition(actor);}
 if(migratingLegacy)migrateLegacyEarthworks(sim,legacy);
 expandEarthworks(sim.construction.earthworks,config);
 syncStructure(sim);
}
function availableBeams(sim){return Object.values(sim.actors).filter(actor=>actor.constructionBeam&&['supply','loose'].includes(actor.constructionBeam.state));}
function craneRelease(sim,actor,now,context={}){
 const state=actor.construction,beam=sim.actors[state.load];if(!beam)error('Attach a steel beam before releasing.');
 const readiness=releaseReadiness(sim,actor,context);if(!readiness.allowed)error(readiness.reason);const tower=constructionStructure(sim.construction,actor),target=readiness.target;
 if(target){
  beam.position={x:target.x,y:target.y,z:target.z};beam.rotation.y=target.yaw;beam.constructionBeam.state='placed';beam.constructionBeam.floor=target.level;beam.constructionBeam.structureId=state.structureId||'tower';
  tower.placed++;tower.floors=Math.floor(tower.placed/4);tower.target=constructionTarget(tower);
  syncStructure(sim);
  const complete=!tower.target;event(sim,now,complete?(state.structureId==='facility'?'Facility frame complete! All ':'Skyscraper complete! All ')+tower.maxFloors+' steel floors are assembled.':'Beam secured. '+tower.placed+' / '+tower.maxFloors*4+' beams · '+tower.floors+' complete floors.');
 }else{
  beam.position={...readiness.position};beam.rotation.y=state.loadYaw||0;beam.constructionBeam.state='loose';event(sim,now,'Beam safely set down on its supporting surface. Reattach it to continue building.');
 }
 delete beam.constructionBeam.craneId;state.load=null;state.assist=null;state.axes={};return sim.construction.message;
}
function executeConstructionCommand(sim,actor,command,now,context={},player=null){
 const state=actor.construction,kind=constructionMachineKind(actor),operation=command.operation;
 if(operation==='control'){
  const allowed=kind==='crane'?['slew','trolley','hoist','loadYaw']:kind==='excavator'?['slew','boom','stick','bucket']:kind==='truck'?['bed']:['blade'];
  if(command.axes!==undefined&&(!command.axes||typeof command.axes!=='object'||Array.isArray(command.axes)))error('Choose valid hydraulic control axes.',422);
  state.axes=Object.fromEntries(allowed.map(key=>[key,clamp(command.axes?.[key],-1,1)]));state.controlAt=now;
  if(Object.values(state.axes).some(Math.abs)){state.assist=null;state.assistLowering=false;delete state.workCycle;}
  return 'Hydraulic controls updated.';
 }
 if(operation==='precision'){state.precision=command.enabled!==false;return state.precision?'Precision hydraulics: 30% speed.':'Normal hydraulic speed.';}
 if(operation==='park'){state.axes={};state.assist=null;state.working=false;delete state.workCycle;actor.driving={...actor.driving,speed:0,throttle:0,parked:true};if(player)player.input={};return 'Machine parked. Hydraulics neutral.';}
 if(kind==='bulldozer'&&operation==='grade-target'){if(state.workCycle)error('Park before changing the finished grade.');if(command.height!==null&&(!Number.isFinite(command.height)||command.height< -12||command.height>6))error('Choose a finished grade between -12 and 6 metres.',422);state.gradeTarget=command.height;return command.height===null?'Free blade grading.':'Finished grade set to '+command.height.toFixed(2)+' metres.';}
 if(kind==='excavator'&&operation==='empty'){if(state.workCycle)error('Park to cancel the active cycle before emptying the bucket.');const moved=dischargeBucket(sim,actor,state.load,now,context);if(!moved)error('Position the bucket over a parked truck bed or an earthworks patch with receiving space.');return 'Bucket discharged at its actual position.';}
 if(kind==='crane'){
  if(operation==='attach'){
   if(state.load)error('Release the attached beam before lifting another.');
   const readiness=attachReadiness(sim,actor,context);if(!readiness.allowed)error(readiness.reason);const beam=readiness.beam;
   beam.constructionBeam.state='attached';beam.constructionBeam.craneId=actor.id;state.load=beam.id;state.loadYaw=beam.rotation?.y||0;beam.position=payloadPosition(actor);state.assist=null;state.axes={};event(sim,now,'Steel beam attached. Raise the hoist, slew to the tower and lower onto the highlighted target.');return sim.construction.message;
  }
  if(operation==='release')return craneRelease(sim,actor,now,context);
  if(operation==='structure-target'){if(!['tower','facility'].includes(command.structureId)||!sim.construction[command.structureId])error('Choose an existing steel structure.',422);state.structureId=command.structureId;state.axes={};state.assist=null;return 'Crane destination: '+(command.structureId==='facility'?'facility steel frame':'skyscraper')+'.';}
  if(operation==='aim-target'||operation==='aim-supply'){
  if(operation==='aim-target'&&!constructionStructure(sim.construction,actor)?.target)error('The skyscraper frame is already complete.');
   if(operation==='aim-supply'&&!availableBeams(sim).length)addBeam(sim,sim.construction.nextBeam++);
   const obstacles=constructionObstacles(sim,context),radius=52;let ceiling=0;for(const box of obstacles){if(box.objectId===actor.id||box.objectId===state.load)continue;const b=constructionColliderBounds(box),x=clamp(actor.position.x,b.min.x,b.max.x),z=clamp(actor.position.z,b.min.z,b.max.z);if(Math.hypot(x-actor.position.x,z-actor.position.z)<radius&&b.max.y<75)ceiling=Math.max(ceiling,b.max.y);}
   state.assistClearance=Math.min(74,ceiling-actor.position.y+CONSTRUCTION_LOAD_OFFSET+2);state.assist=operation==='aim-target'?'target':'supply';state.assistLowering=false;state.axes={};state.controlAt=now;return 'Crane alignment assistance engaged. Manual controls take over immediately.';
  }
 }else if(operation==='work'){
  const ready=workReadiness(sim,actor);if(!ready.allowed)error(ready.reason);
  const startPose=Object.fromEntries(['boom','stick','bucket','swing','blade','bed'].map(key=>[key,state[key]||0]));
  const truck=ready.truck,truckYaw=truck?.rotation?.y||0,dx=truck?truck.position.x+Math.sin(truckYaw)*1.4-actor.position.x:0,dz=truck?truck.position.z+Math.cos(truckYaw)*1.4-actor.position.z:0;
  const desired=truck?Math.atan2(-dx,-dz)-(actor.rotation?.y||0):state.swing||0,difference=Math.atan2(Math.sin(desired-(state.swing||0)),Math.cos(desired-(state.swing||0)));
  state.workCycle={start:now,elapsed:0,duration:ready.mode==='load'?Math.max(5600,Math.abs(difference)/.8*2000+2600):ready.mode==='dump'?4200:ready.mode==='dig'?3600:2800,mode:ready.mode,digBoom:ready.digBoom,startPose,truckId:truck?.id,targetSwing:(state.swing||0)+difference,gradeBlade:Number.isFinite(state.gradeTarget)?clamp(state.gradeTarget+.11-actor.position.y,0,1.2):0,transferred:false};
  state.axes={};state.assist=null;if(player)player.input={};actor.driving={...actor.driving,speed:0,parked:true};
  return ready.mode==='dig'?'Dig cycle: lower, scoop, curl and lift.':ready.mode==='load'?'Load cycle: raise, swing, discharge over the parked truck and return.':ready.mode==='dump'?'Dump cycle: raise body, discharge at the spoil pad and lower.':'Grading cycle: lower the blade into the work area and finish the pass.';
 }
 error('Choose an available operation for this construction machine.',422);
}
function cycleCandidate(actor,dt){
 const state={...actor.construction},cycle={...state.workCycle,paused:false},from=cycle.startPose;
 cycle.elapsed=Math.min(cycle.duration,(cycle.elapsed||0)+dt*1000);state.workCycle=cycle;const t=cycle.elapsed/cycle.duration;
 const frames=cycle.mode==='dig'?[[0,from],[.28,{boom:cycle.digBoom??.4,stick:-1.5,bucket:1}],[.58,{boom:cycle.digBoom??.4,stick:-1.5,bucket:-.9}],[1,{boom:.9,stick:-.8,bucket:-.9}]]:
  // Keep the high, curled arm fixed through each swing. Lowering/retracting
  // while simultaneously returning used to clip the receiving truck's cab.
  cycle.mode==='load'?[[0,from],[.13,{boom:1.3,stick:-.2,bucket:-.9,swing:from.swing}],[.38,{boom:1.3,stick:-.2,bucket:-.9,swing:cycle.targetSwing}],[.48,{boom:.8,stick:-.3,bucket:-.9,swing:cycle.targetSwing}],[.58,{boom:.8,stick:-.3,bucket:1,swing:cycle.targetSwing}],[.7,{boom:1.3,stick:-.2,bucket:0,swing:cycle.targetSwing}],[.95,{boom:1.3,stick:-.2,bucket:0,swing:from.swing}],[1,{boom:1.05,stick:-.8,bucket:0,swing:from.swing}]]:
  cycle.mode==='dump'?[[0,from],[.48,{bed:.95}],[.7,{bed:.95}],[1,{bed:0}]]:[[0,from],[.35,{blade:cycle.gradeBlade||0}],[.75,{blade:cycle.gradeBlade||0}],[1,{blade:1}]];
 let low=frames[0],high=frames.at(-1);for(let i=1;i<frames.length;i++)if(t<=frames[i][0]){low=frames[i-1];high=frames[i];break;}
 const amount=clamp((t-low[0])/Math.max(.001,high[0]-low[0]),0,1);
 for(const key of ['boom','stick','bucket','swing','blade','bed']){const a=low[1][key]??from[key],b=high[1][key]??a;state[key]=a+(b-a)*amount;}
 state.working=true;return state;
}
function finishCycleEffects(sim,actor,now,context={}){
 const state=actor.construction,cycle=state.workCycle,t=cycle.elapsed/cycle.duration;
 if(cycle.mode==='dig'&&t<.7){const tip=constructionJointPose(actor).bucketTip;if(!cycle.cutPoint||tip.y<cycle.cutPoint.y)cycle.cutPoint={...tip};}
 if(cycle.mode==='load'&&t>=.58&&!cycle.transferred){
  const truck=sim.actors[cycle.truckId],tip=constructionJointPose(actor).bucketTip,receiving=receivingTruck(sim,actor,tip);
  if(receiving!==truck||truck.construction.load+state.load>CONSTRUCTION_CAPACITY.truck){state.blocked={part:'excavator-bucket',reason:'Receiving truck moved or its bed is outside the bucket discharge envelope.'};state.working=false;delete state.workCycle;return;}
  const moved=dischargeBucket(sim,actor,state.load,now,context);cycle.transferred=true;if(moved)event(sim,now,'Dumptruck loaded with real material from the bucket. Haul it to a fill or stockpile patch.');
 }
 if(cycle.mode==='dump'&&t>=.65&&!cycle.transferred){const moved=dischargeTruck(sim,actor,state.load,now,context);cycle.transferred=true;if(moved)event(sim,now,'Material discharged behind the truck and added to the ground surface.');else state.blocked={part:'truck-discharge',reason:'The rear outlet has no receiving space. The load remains in the body.'};}
 if(cycle.mode==='grade'&&t>=.5&&!cycle.transferred){const moved=bladePass(sim,actor,3,now);cycle.transferred=true;if(moved)event(sim,now,'Blade moved '+moved.toFixed(2)+' cubic metres of existing material.');}
 if(t<1)return;
 if(cycle.mode==='dig'){const tip=cycle.cutPoint||constructionJointPose(digPose(actor,sim.construction.earthworks)).bucketTip,cargo=earthworksTake(sim.construction.earthworks,tip,CONSTRUCTION_CAPACITY.excavator-state.load,{radius:1.3,cutY:tip.y-.3}),volume=earthCargoVolume(cargo);updateCargo(state,addCargo(state.cargo,cargo));recordEarthMove(sim,actor,volume,'dig',now);if(volume)event(sim,now,volume.toFixed(2)+' cubic metres scooped from the cut into the bucket. Load a truck or empty into a receiving patch.');else state.blocked={part:'excavator-bucket',reason:'No reachable material remains at this bucket position.'};}
 delete state.workCycle;state.working=false;
}
function manualEarthworks(sim,actor,before,dt,now,context={}){
 const state=actor.construction,kind=constructionMachineKind(actor),axes=now-state.controlAt<MANUAL_CONTROL_LEASE_MS?state.axes:{};
 if(kind==='excavator'){
  const tip=constructionJointPose(actor).bucketTip,oldTip=constructionJointPose({...actor,construction:before}).bucketTip,surface=earthworksSurfaceAt(sim.construction.earthworks,tip);
  if((axes.bucket||0)<-.02&&surface&&Math.min(tip.y,oldTip.y)<=surface.y+.2&&state.load<CONSTRUCTION_CAPACITY.excavator){const cut={...tip,y:Math.min(tip.y,oldTip.y)},cargo=earthworksTake(sim.construction.earthworks,cut,Math.min(CONSTRUCTION_CAPACITY.excavator-state.load,4*dt),{radius:1.2,cutY:cut.y-.25});updateCargo(state,addCargo(state.cargo,cargo));recordEarthMove(sim,actor,earthCargoVolume(cargo),'dig',now);}
  else if((axes.bucket||0)>.02&&state.bucket>.3&&state.load>0&&!dischargeBucket(sim,actor,4*dt,now,context))state.blocked={part:'bucket-discharge',reason:'No clear receiving truck or earthworks ground beneath the bucket. Material retained.'};
 }else if(kind==='truck'&&state.bed>.55&&state.load>0){if(!dischargeTruck(sim,actor,8*dt,now,context))state.blocked={part:'truck-discharge',reason:'No clear receiving space beneath the rear outlet. Material retained in the body.'};}
 else if(kind==='bulldozer'&&state.blade<.25&&before.earthPosition){const distance=Math.hypot(actor.position.x-before.earthPosition.x,actor.position.z-before.earthPosition.z);if(distance>.002&&actor.driving?.speed>.02)bladePass(sim,actor,Math.min(4,distance*2.5),now,1.4);}
 state.earthPosition={...actor.position};
}
function refreshTelemetry(sim,actor,now,context){actor.construction.telemetry=constructionTelemetry(sim,actor,now,context);}
export function stepConstruction(sim,now,dt,context={}){
 if(!sim.construction)return;
 for(const actor of Object.values(sim.actors).filter(isConstructionMachine)){
  const owner=sim.players[actor.holderId],human=owner&&owner.vehicleId===actor.id&&!owner.replacedByRoom&&now-owner.lastSeen<15000&&owner.health>0,lease=actor.construction.crewOperator,crew=!actor.holderId&&lease&&lease.expiresAt>now,occupied=human||crew;if(actor.holderId||lease&&lease.expiresAt<=now)delete actor.construction.crewOperator;
  if(!occupied){if(lease)actor.driving={...actor.driving,speed:0,throttle:0,steering:0,parked:true};actor.construction.axes={};actor.construction.assist=null;actor.construction.working=false;delete actor.construction.workCycle;if(actor.construction.blocked?.part==='operator-link')actor.construction.blocked=null;refreshTelemetry(sim,actor,now,context);continue;}
  // A delayed packet stops motion immediately but does not discard a task
  // already accepted from the seated operator. No cycle time or soil moves
  // while the input link is stale; fresh input can safely resume the task.
  if(human&&now-owner.lastSeen>=1000){const pending=!!(actor.construction.workCycle||actor.construction.assist||actor.construction.working);actor.construction.axes={};actor.construction.working=false;if(actor.construction.workCycle)actor.construction.workCycle.paused=true;if(pending)actor.construction.blocked={part:'operator-link',reason:'Operator input delayed. Hydraulics paused until the link resumes.'};else if(actor.construction.blocked?.part==='operator-link')actor.construction.blocked=null;refreshTelemetry(sim,actor,now,context);continue;}
  normalizeCargo(sim,actor);const state=actor.construction;let candidate;
  if(state.workCycle)candidate=cycleCandidate(actor,dt);
  else if(state.assist){const point=state.assist==='target'?constructionStructure(sim.construction,actor)?.target:availableBeams(sim)[0];const source=point?.position||point;
   if(source)candidate=stepCraneAlignment(actor,{...source,y:source.y+CONSTRUCTION_LOAD_OFFSET,yaw:point?.rotation?.y??point?.yaw??0},dt);else candidate={...state,assist:null};
  }else{
   const axes=now-state.controlAt<MANUAL_CONTROL_LEASE_MS?state.axes:{};
   const moving=Math.abs(actor.driving?.speed||0)>.15&&constructionMachineKind(actor)!=='bulldozer';
   candidate=stepConstructionHydraulics(actor,moving?{}:axes,dt);if(moving&&Object.values(axes||{}).some(Boolean))candidate.blocked={part:'hydraulics',reason:'Park before operating this machine hydraulic attachment.'};
  }
  let blocked=constructionMovementBlocked(sim,actor,{...actor,construction:candidate},context);
  if(constructionMachineKind(actor)==='crane'&&candidate.load){const bottom=payloadPosition({...actor,construction:candidate});if(bottom.y<-.02)blocked={part:'crane-payload',reason:'The steel load has reached ground level.'};}
  if(blocked){state.blocked=blocked;state.working=false;}
  else {actor.construction=candidate;if(!candidate.blocked||candidate.blocked.part!=='hydraulics')candidate.blocked=null;if(candidate.workCycle)finishCycleEffects(sim,actor,now,context);else manualEarthworks(sim,actor,state,dt,now,context);}
  const current=actor.construction,beam=sim.actors[current.load];if(constructionMachineKind(actor)==='crane'){current.hook=craneHookPosition(actor);if(beam?.constructionBeam){beam.position=payloadPosition(actor);beam.rotation.y=current.loadYaw||0;}}
  refreshTelemetry(sim,actor,now,context);
 }
 refreshEarthworksTotals(sim.construction.earthworks,Object.values(sim.actors).filter(isConstructionMachine).map(actor=>actor.construction.cargo));
 if(availableBeams(sim).length<2&&sim.construction.tower.target)addBeam(sim,sim.construction.nextBeam++);
}
export function constructionView(sim){
 if(!sim.construction)return null;
 return {...sim.construction,beams:Object.values(sim.actors).filter(actor=>actor.constructionBeam).map(actor=>({id:actor.id,position:actor.position,rotation:actor.rotation,...actor.constructionBeam}))};
}

export function constructionCommand(sim,player,command,now,context={}){
 const actor=sim.actors[player.vehicleId];
 if(!sim.construction||!isConstructionMachine(actor)||actor.active===false||actor.holderId!==player.actorId)error('Enter an available construction machine before operating its controls.');
 if(command.entityId&&command.entityId!==actor.id)error('Those controls belong to another machine.');
 if(player.health<=0||!near(player.position,actor.position,8))error('Return to the machine operator station.');
 if(command.operation==='control'&&command.controlSequence!==undefined){
  if(!Number.isSafeInteger(command.controlSequence)||command.controlSequence<1)error('Choose a valid control sequence.',422);
  if(command.controlEpoch!==player.inputEpoch)return 'Superseded operator controls ignored.';
  const previous=actor.construction.controlPacket;
  if(previous?.epoch===player.inputEpoch&&previous.sequence>=command.controlSequence)return 'Superseded operator controls ignored.';
  actor.construction.controlPacket={epoch:player.inputEpoch,sequence:command.controlSequence};
 }
 // A seated human always replaces an autonomous lease immediately.
 delete actor.construction.crewOperator;
 const result=executeConstructionCommand(sim,actor,command,now,context,player);refreshEarthworksTotals(sim.construction.earthworks,Object.values(sim.actors).filter(isConstructionMachine).map(a=>a.construction.cargo));refreshTelemetry(sim,actor,now,context);return result;
}
/** Trusted server-only crew adapter. It does not create players or bypass any
 * mechanical readiness, cargo capacity, swept collision or transfer checks.
 */
export function constructionCrewSetOperator(sim,machineId,workerId,now,{leaseMs=1500}={}){
 const actor=sim.actors[machineId];if(!sim.construction||!isConstructionMachine(actor)||actor.active===false)error('Construction machine is unavailable.');
 if(workerId===null){if(actor.holderId){delete actor.construction.crewOperator;return false;}delete actor.construction.crewOperator;actor.construction.axes={};actor.construction.assist=null;actor.construction.working=false;delete actor.construction.workCycle;actor.driving={...actor.driving,speed:0,throttle:0,steering:0,parked:true};return true;}
 if(actor.holderId)error('A human operator has this machine.');
 const current=actor.construction.crewOperator;if(current&&current.workerId!==workerId&&current.expiresAt>now)error('Another crew member is operating this machine.');
 if(typeof workerId!=='string'||!workerId||workerId.length>100)error('Choose a valid crew operator.',422);
 actor.construction.crewOperator={workerId,expiresAt:now+clamp(leaseMs,250,3000)};return true;
}
export function constructionCrewCommand(sim,machineId,workerId,command,now,context={}){
 const actor=sim.actors[machineId],lease=actor?.construction?.crewOperator;
 if(!lease||lease.workerId!==workerId||lease.expiresAt<=now||actor.holderId)error('Crew operator lease is unavailable or has expired.');
 if(command.entityId&&command.entityId!==machineId)error('Those controls belong to another machine.');
 const result=executeConstructionCommand(sim,actor,command,now,context);refreshEarthworksTotals(sim.construction.earthworks,Object.values(sim.actors).filter(isConstructionMachine).map(a=>a.construction.cargo));refreshTelemetry(sim,actor,now,context);return result;
}
