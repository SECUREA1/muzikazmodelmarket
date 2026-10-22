import {constructionJointPose} from './construction-kinematics.js';
/** Shared construction dimensions and hydraulic state. All lengths are metres. */
export const CONSTRUCTION_LOAD_OFFSET=3.5;
export const CONSTRUCTION_MACHINES=Object.freeze({
 'tower-crane':'crane','site-dumptruck':'truck','site-bulldozer':'bulldozer','site-excavator':'excavator'
});
export const constructionMachineKind=actor=>CONSTRUCTION_MACHINES[actor?.asset?.buildAssetId||actor?.modelId]||null;
export const isConstructionMachine=actor=>!!constructionMachineKind(actor);
export const constructionClamp=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):0));
export function initialConstructionState(actor,supply={x:-8,y:.8,z:15}){
 const kind=constructionMachineKind(actor),dx=supply.x-actor.position.x,dz=supply.z-actor.position.z;
 return {kind,slew:Math.atan2(dx,dz)-(actor.rotation?.y||0),trolley:constructionClamp(Math.hypot(dx,dz),4,42),hoist:constructionClamp((supply.y??.8)+CONSTRUCTION_LOAD_OFFSET-actor.position.y,.8,74),boom:.7,stick:-.8,bucket:0,swing:0,blade:1,bed:0,load:kind==='crane'?null:0,loadYaw:0,precision:false,working:false,assist:null,axes:{},controlAt:0};
}
export function constructionTravelStatus(actor){
 const kind=constructionMachineKind(actor),state=actor?.construction||{};
 if(!kind)return {allowed:true,reason:'Travel ready.'};
 if(kind==='crane')return {allowed:false,reason:'Tower crane is fixed to its foundation.'};
 if(state.workCycle)return {allowed:false,reason:'Finish or park to cancel the active hydraulic cycle.'};
 if(kind==='truck'&&(state.bed||0)>.08)return {allowed:false,reason:'Lower the dump body fully before travelling.'};
 if(kind==='excavator'){const tip=constructionJointPose(actor).bucketTip;if(tip&&tip.y-actor.position.y<.75)return {allowed:false,reason:'Raise the bucket clear of the ground before travelling.'};if(state.load>0&&(state.bucket||0)>.35)return {allowed:false,reason:'Curl the loaded bucket before travelling.'};}
 return {allowed:true,reason:'Travel ready.'};
}
export function craneHookPosition(actor){
 const state=actor.construction||initialConstructionState(actor),yaw=(actor.rotation?.y||0)+state.slew;
 return {x:actor.position.x+Math.sin(yaw)*state.trolley,y:actor.position.y+state.hoist,z:actor.position.z+Math.cos(yaw)*state.trolley};
}
export function constructionTarget(tower,index=tower.placed){
 if(index>=tower.maxFloors*4)return null;
 const level=Math.floor(index/4)+1,side=index%4,halfWidth=tower.width/2,halfDepth=tower.depth/2;
 return {x:tower.x+(side===1?halfWidth:side===3?-halfWidth:0),y:tower.baseY+level*tower.floorHeight,z:tower.z+(side===0?-halfDepth:side===2?halfDepth:0),yaw:side%2?Math.PI/2:0,level,side};
}
const toward=(value,target,step)=>value+constructionClamp(target-value,-step,step);
export function stepConstructionHydraulics(actor,axes,dt){
 const state={...actor.construction},kind=constructionMachineKind(actor),axis=key=>constructionClamp(axes?.[key],-1,1);dt=constructionClamp(dt,0,.25)*(state.precision?.3:1);
 if(kind==='crane'){
  state.slew+=axis('slew')*.42*dt;
  state.trolley=constructionClamp(state.trolley+axis('trolley')*7*dt,4,42);
  state.hoist=constructionClamp(state.hoist+axis('hoist')*10*dt,.8,74);
  state.loadYaw=(state.loadYaw||0)+axis('loadYaw')*.6*dt;
 }else if(kind==='excavator'){
  state.swing-=axis('slew')*.8*dt;
  state.boom=constructionClamp(state.boom+axis('boom')*.55*dt,.3,1.3);
  state.stick=constructionClamp(state.stick+axis('stick')*.7*dt,-1.5,-.2);
  state.bucket=constructionClamp(state.bucket+axis('bucket')*1.1*dt,-1.2,1.2);
 }else if(kind==='bulldozer')state.blade=constructionClamp(state.blade+axis('blade')*.7*dt,0,1.2);
 else if(kind==='truck')state.bed=constructionClamp(state.bed+axis('bed')*.45*dt,0,.95);
 state.working=Object.values(axes||{}).some(value=>Math.abs(value)>.02);
 return state;
}
export function stepCraneAlignment(actor,target,dt){
 const state={...actor.construction},dx=target.x-actor.position.x,dz=target.z-actor.position.z;
 const heading=Math.atan2(dx,dz)-(actor.rotation?.y||0),difference=Math.atan2(Math.sin(heading-state.slew),Math.cos(heading-state.slew));
 // Raise above both the payload destination and current deck before slewing.
 const clearHeight=Math.min(74,Math.max(state.hoist,target.y-actor.position.y+6,state.assistClearance||0));
 if(state.hoist<clearHeight-.1&&!state.assistLowering)state.hoist=toward(state.hoist,clearHeight,12*dt);
 else if(Math.abs(difference)>.005||Math.abs(state.trolley-Math.hypot(dx,dz))>.1||state.load&&Math.abs(Math.atan2(Math.sin((target.yaw||0)-(state.loadYaw||0)),Math.cos((target.yaw||0)-(state.loadYaw||0))))>.01){
  state.slew+=constructionClamp(difference,-.55*dt,.55*dt);
  state.trolley=toward(state.trolley,constructionClamp(Math.hypot(dx,dz),4,42),8*dt);
  if(state.load){const yaw=(target.yaw||0)-(state.loadYaw||0);state.loadYaw=(state.loadYaw||0)+constructionClamp(Math.atan2(Math.sin(yaw),Math.cos(yaw)),-.7*dt,.7*dt);}
 }else{
  state.assistLowering=true;state.hoist=toward(state.hoist,constructionClamp(target.y-actor.position.y,.8,74),12*dt);
  if(Math.abs(state.hoist-(target.y-actor.position.y))<.1){state.assist=null;state.assistLowering=false;}
 }
 state.working=!!state.assist;return state;
}
