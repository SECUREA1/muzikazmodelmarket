import {CONSTRUCTION_CREW_DEFAULTS,CONSTRUCTION_CREW_JOBS,CONSTRUCTION_CREW_PALETTES} from './public/js/construction-crew.js';
import {constructionMachineKind,constructionTravelStatus} from './public/js/construction-state.js';
import {constructionOperatorPose} from './public/js/construction-kinematics.js';
import {constructionColliderBounds,constructionGroundAt} from './public/js/construction-collision.js';
import {constructionObstacles,constructionMovementBlocked} from './server-construction-collision.mjs';
import {stepRoadVehicle} from './public/js/road-vehicles.js';
import {earthworksGroundAt} from './public/js/construction-earthworks.js';
import {constructionCrewCommand,constructionCrewSetOperator} from './server-construction.mjs';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):0));
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),angle=value=>Math.atan2(Math.sin(value),Math.cos(value));
const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const position=(value,fallback)=>({x:Number.isFinite(value?.x)?value.x:fallback.x,y:Number.isFinite(value?.y)?value.y:fallback.y||0,z:Number.isFinite(value?.z)?value.z:fallback.z,...(Number.isFinite(value?.rotationY)?{rotationY:value.rotationY}:{})});
const load=actor=>typeof actor?.construction?.load==='number'?Math.max(0,actor.construction.load):0;
const working=actor=>!!(actor?.construction?.workCycle||actor?.construction?.assist);
const configFor=environment=>(environment?.construction||environment?.builderScene?.layoutMeta?.construction||{}).crew||{};
const machineFor=(sim,kind,id)=>id?sim.actors[id]:Object.values(sim.actors).find(actor=>actor.active!==false&&constructionMachineKind(actor)===kind&&!actor.holderId);
const operator=(context)=>context.setOperator||constructionCrewSetOperator;
const operate=(context)=>context.operate||constructionCrewCommand;
const message=(worker,job,text)=>{worker.message=text;if(job)job.message=text;};
const neutral=(actor)=>{if(!actor)return;actor.driving={...actor.driving,speed:0,throttle:0,steering:0,parked:true};if(actor.construction)actor.construction.crewInput={forward:0,side:0,brake:true};};

export function ensureConstructionCrew(sim,environment,now=0){
 if(!sim.construction)return null;
 const config=configFor(environment),muster=position(config.muster,{x:-58,y:0,z:35});
 if(!sim.construction.crew){
  const workers=CONSTRUCTION_CREW_DEFAULTS.map((definition,index)=>{const home={x:muster.x+(index%2)*1.8,y:muster.y,z:muster.z+Math.floor(index/2)*1.8};return {id:definition.id,name:definition.name,role:definition.role,appearance:{...definition.appearance},position:{...home},home,heading:0,state:'paused',enabled:true,jobId:null,machineId:null,phase:'standby',progress:0,message:'Ready at the crew muster point.'};});
  const jobs=Object.entries(CONSTRUCTION_CREW_JOBS).map(([id,definition])=>({id,type:id,label:definition.label,status:'queued',workerId:CONSTRUCTION_CREW_DEFAULTS.find(worker=>worker.jobs.includes(id))?.id||null,machineId:null,progress:0,completed:0,goal:definition.goal,unit:definition.unit,message:'Waiting for the crew to start.'}));
  sim.construction.crew={version:1,enabled:config.autoStart===true,workers,jobs,muster,message:'Named crew ready. Start the crew or assign an operator to a job.',updatedAt:now};
 }
 if(config.autoStart===true&&!sim.construction.crew.dailyLifeReady){if(sim.construction.crew.message.startsWith('Named crew ready'))sim.construction.crew.enabled=true;sim.construction.crew.dailyLifeReady=true;}
 return sim.construction.crew;
}

function retireMachine(sim,worker,now,context,reason){
 const actor=sim.actors[worker.machineId];
 if(actor?.construction?.crewOperator?.workerId===worker.id){
  // The adapter also clears accepted work and axes. Never apply crew input
  // after a human has taken the holder slot.
  try{operator(context)(sim,actor.id,null,now,context);}catch{}
  if(!actor.holderId)neutral(actor);
 }
 worker.machineId=null;worker.route=null;worker.routeIndex=0;worker.phase='approach';worker.state='waiting';worker.retryAt=now+1200;
 const job=sim.construction.crew.jobs.find(job=>job.id===worker.jobId);if(job&&job.status!=='completed'){job.status='waiting';if(reason)job.message=reason;}
 if(reason)worker.message=reason;
}

export function releaseConstructionCrewMachine(sim,machineId,reason='A player has priority for this machine.',now=0,context={}){
 const crew=sim.construction?.crew;if(!crew)return false;let released=false;
 for(const worker of crew.workers)if(worker.machineId===machineId){
  const job=crew.jobs.find(job=>job.id===worker.jobId);retireMachine(sim,worker,now,context,reason);
  if(worker.demonstration?.status==='active'){worker.demonstration.status='cancelled';worker.demonstration.finishedAt=now;worker.enabled=false;}
  if(job&&job.status!=='completed'){job.status='waiting';job.message=reason;}released=true;
 }
 const machine=sim.actors[machineId];
 if(machine?.construction?.crewOperator){try{operator(context)(sim,machineId,null,now,context);}catch{}released=true;}
 return released;
}

function demoChoices(sim,crew,worker,now,machineId){
 const permitted=worker?CONSTRUCTION_CREW_DEFAULTS.find(member=>member.id===worker.id)?.jobs||Object.keys(CONSTRUCTION_CREW_JOBS):Object.keys(CONSTRUCTION_CREW_JOBS);
 return permitted.map(jobId=>{
  const definition=CONSTRUCTION_CREW_JOBS[jobId],job=crew.jobs.find(item=>item.id===jobId),assigned=worker||crew.workers.find(member=>member.id===job?.workerId)||crew.workers.find(member=>CONSTRUCTION_CREW_DEFAULTS.find(value=>value.id===member.id)?.jobs.includes(jobId));
  const candidates=Object.values(sim.actors).filter(actor=>(!machineId||actor.id===machineId)&&actor.active!==false&&actor.health!==0&&constructionMachineKind(actor)===definition.machine),machine=candidates.find(actor=>!actor.holderId&&(!actor.construction?.crewOperator||actor.construction.crewOperator.workerId===assigned?.id||actor.construction.crewOperator.expiresAt<=now));
  let reason=!candidates.length?'No '+definition.machine+' is available on this site.':!machine?'A player or another operator is using the '+definition.machine+'.':'';
  const current=crew.workers.find(member=>member.jobId===jobId&&member.demonstration?.status==='active');
  if(!reason&&current&&current!==assigned)reason=current.name+' is already demonstrating this job for a visitor.';
  if(!reason&&assigned?.demonstration?.status==='active')reason=assigned.name+' is already demonstrating '+CONSTRUCTION_CREW_JOBS[assigned.demonstration.jobId].label.toLowerCase()+'.';
  if(!reason&&jobId==='dig'&&load(machine)>.001)reason='The excavator bucket contains material. Ask for loading first.';
  if(!reason&&jobId==='load'&&load(machine)<=.001)reason='Excavate a real bucket of material before loading.';
  if(!reason&&['haul','dump'].includes(jobId)&&load(machine)<=.001)reason='Load real material into the truck before this job.';
  if(!reason&&jobId==='grade'&&!looseMaterial(sim,sim.construction.stockpile))reason='Deposit real loose material before grading.';
  if(!reason&&jobId==='steel'&&!sim.construction.tower?.target)reason='All available structural steel has already been placed.';
  return {jobId,label:definition.label,machine:definition.machine,workerId:assigned?.id||null,machineId:machine?.id||null,available:!reason,reason};
 });
}

/** Conversation requests enter the same machine scheduler and hydraulic commands
 * as the site's crew controls. They never manufacture cargo or skip work time. */
export function constructionCrewInteraction(sim,player,command,now,context={}){
 const crew=requireManager(sim,player,now),operation=command.operation||'status',worker=command.workerId?crew.workers.find(member=>member.id===command.workerId):null;
 if(command.workerId&&!worker)fail('Choose an existing site worker.',422);
 if(!['status','demonstrate','resume','stop'].includes(operation))fail('Ask for status, a demonstration, resume or stop.',422);
 const choices=demoChoices(sim,crew,worker,now,command.machineId),snapshot=member=>({workerId:member.id,name:member.name,state:member.state,jobId:member.jobId,machineId:member.machineId,progress:member.progress||0,message:member.message,demonstration:member.demonstration?{...member.demonstration}:null});
 if(operation==='status'){
  const workers=(worker?[worker]:crew.workers).map(snapshot);
  return {message:workers.map(member=>member.name+': '+member.message).join(' '),workers,choices};
 }
 if(operation==='resume'&&worker?.demonstration?.status==='active'){
  if(worker.demonstration.requestedBy!==player.actorId)fail('That worker is helping another visitor.');
  constructionCrewAction(sim,player,{operation:'start',workerId:worker.id},now,context);
  return {message:worker.name+' is continuing the live '+CONSTRUCTION_CREW_JOBS[worker.demonstration.jobId].label.toLowerCase()+' demonstration.',workers:[snapshot(worker)],choices};
 }
 if(operation==='stop'){
  const selected=worker?[worker]:crew.workers.filter(member=>member.demonstration?.status==='active'&&member.demonstration.requestedBy===player.actorId);
  if(!selected.length)fail('There is no demonstration to stop. Choose a worker to pause.');
  for(const member of selected){
   if(member.demonstration?.status==='active'&&member.demonstration.requestedBy!==player.actorId)fail('That worker is helping another visitor. Choose an available worker.');
  }
  for(const member of selected){constructionCrewAction(sim,player,{operation:'pause',workerId:member.id},now,context);if(member.demonstration?.status==='active'){member.demonstration.status='cancelled';member.demonstration.finishedAt=now;}member.message='Stopped safely at your request. Hydraulics and travel are neutral.';}
  return {message:selected.map(member=>member.name).join(', ')+' stopped safely.',workers:selected.map(snapshot),choices:demoChoices(sim,crew,worker,now)};
 }
 if(command.jobId&&!choices.some(choice=>choice.jobId===command.jobId))fail('That worker does not perform this job. Choose a listed demonstration.',422);
 let choice=command.jobId?choices.find(value=>value.jobId===command.jobId):null;
 if(!choice){const ready=choices.filter(value=>value.available),index=Math.max(0,player.constructionCrewTurn||0);choice=ready.length?ready[index%ready.length]:choices.find(value=>value.reason)||null;}
 if(!choice||!choice.available)fail(choice?.reason||'The site has no available work demonstration right now.');
 const member=crew.workers.find(value=>value.id===choice.workerId);
 if(member.demonstration?.status==='active'&&member.demonstration.requestedBy!==player.actorId)fail('That worker is helping another visitor.');
 const machine=command.machineId?sim.actors[command.machineId]:sim.actors[choice.machineId];
 if(!machine||machine.active===false||machine.health===0||constructionMachineKind(machine)!==choice.machine)fail('Choose an available '+choice.machine+' for this demonstration.',422);
 if(machine.holderId)fail('A player is using that machine. Players always have priority.');
 constructionCrewAction(sim,player,{operation:'assign',workerId:member.id,jobId:choice.jobId,machineId:machine.id},now,context);
 member.demonstration={status:'active',requestedBy:player.actorId,jobId:choice.jobId,startedAt:now};
 const job=crew.jobs.find(value=>value.id===choice.jobId);job.requestedBy=player.actorId;job.requestedAt=now;
 constructionCrewAction(sim,player,{operation:'start',workerId:member.id},now,context);player.constructionCrewTurn=(player.constructionCrewTurn||0)+1;
 member.message=member.name+' will '+choice.label.toLowerCase()+' using the live '+choice.machine+'. Follow the worker to the marked machine and keep the work area clear.';crew.message=member.message;
 return {message:member.message,workers:[snapshot(member)],choices:demoChoices(sim,crew,worker,now)};
}

function requireManager(sim,player,now){
 const crew=sim.construction?.crew;if(!crew)fail('This world has no construction crew.');
 if(!player||player.health<=0||player.replacedByRoom||now-(player.lastSeen??now)>15000)fail('Join the live site before managing its crew.',403);
 if(!player.position||gap(player.position,crew.muster)>280)fail('Return to the construction site to manage the crew.',403);
 return crew;
}
export function constructionCrewAction(sim,player,command,now,context={}){
 const crew=requireManager(sim,player,now),operation=command.operation,worker=command.workerId?crew.workers.find(worker=>worker.id===command.workerId):null;
 if(['status','demonstrate','resume','stop'].includes(operation))return constructionCrewInteraction(sim,player,command,now,context).message;
 if(command.workerId&&!worker)fail('Choose an existing site worker.',422);
 if(operation==='start'||operation==='pause'){
  if(worker){worker.enabled=operation==='start';if(operation==='start')crew.enabled=true;}else crew.enabled=operation==='start';
  for(const member of worker?[worker]:crew.workers){
   if(operation==='pause'){retireMachine(sim,member,now,context,'Crew paused. Hydraulics and travel are neutral.');member.state='paused';}
   else{member.retryAt=0;member.state='waiting';}
  }
  crew.message=operation==='start'?'Crew started. Players always have priority for machines.':'Crew paused safely.';return crew.message;
 }
 if(operation==='customize'){
  if(!worker)fail('Choose a worker to customize.',422);
  if(command.name!==undefined&& (typeof command.name!=='string'||!command.name.trim()||command.name.length>32||/[\u0000-\u001f<>]/.test(command.name)))fail('Use a worker name of 1–32 plain characters.',422);
  if(command.appearance!==undefined){
   if(!command.appearance||typeof command.appearance!=='object'||Array.isArray(command.appearance))fail('Choose valid workwear options.',422);
   for(const [key,value]of Object.entries(command.appearance))if(!CONSTRUCTION_CREW_PALETTES[key]?.includes(value))fail('Choose a listed '+key+' workwear option.',422);
  }
  if(command.name!==undefined)worker.name=command.name.trim();if(command.appearance)Object.assign(worker.appearance,command.appearance);
  return worker.name+' updated.';
 }
 if(operation==='assign'){
  const job=crew.jobs.find(job=>job.id===command.jobId),definition=CONSTRUCTION_CREW_JOBS[job?.type];
  if(!worker||!job||!definition)fail('Choose a worker and listed construction job.',422);
  const machine=command.machineId?sim.actors[command.machineId]:null;
  if(command.machineId&&(!machine||machine.active===false||constructionMachineKind(machine)!==definition.machine))fail('That machine cannot perform this job.',422);
  if(machine?.holderId)fail('A player is using that machine. Choose another machine or wait.');
  if(machine?.construction?.crewOperator&&machine.construction.crewOperator.workerId!==worker.id)fail('Another crew worker is operating that machine. Pause or reassign that worker first.');
  const previous=crew.workers.find(member=>member.jobId===job.id);if(previous){retireMachine(sim,previous,now,context,'Job reassigned.');previous.jobId=null;if(previous.demonstration?.status==='active'){previous.demonstration.status='cancelled';previous.demonstration.finishedAt=now;}}
  if(worker.demonstration?.status==='active'){worker.demonstration.status='cancelled';worker.demonstration.finishedAt=now;}
  const interrupted=crew.jobs.find(current=>current.id===worker.jobId&&current.id!==job.id);if(interrupted)interrupted.status='queued';
  retireMachine(sim,worker,now,context,'New job assigned.');worker.jobId=job.id;worker.enabled=true;worker.retryAt=0;
  Object.assign(job,{workerId:worker.id,machineId:machine?.id||null,status:'queued',completed:0,progress:0,message:'Assigned to '+worker.name+'.'});
  return job.message;
 }
 fail('Choose start, pause, assign or customize for the construction crew.',422);
}

function accessPoint(actor){
 const kind=constructionMachineKind(actor),offset=kind==='crane'?[5.6,4.8]:kind==='truck'?[-2.8,-2]:kind==='excavator'?[-2.9,0]:[-3.5,.8],yaw=actor.rotation?.y||0;
 return {x:actor.position.x+Math.cos(yaw)*offset[0]+Math.sin(yaw)*offset[1],y:actor.position.y,z:actor.position.z-Math.sin(yaw)*offset[0]+Math.cos(yaw)*offset[1]};
}
function walkPath(sim,worker,goal,context){
 const size=1.5,start=worker.position,extent=Math.min(200,Math.max(24,gap(start,goal)+12)),minX=Math.min(start.x,goal.x)-12,minZ=Math.min(start.z,goal.z)-12,maxX=Math.max(start.x,goal.x)+12,maxZ=Math.max(start.z,goal.z)+12;
 const obstacles=constructionObstacles(sim,context).map(constructionColliderBounds).filter(box=>box.max.y>start.y+.3&&box.min.y<start.y+1.8);
 for(const other of sim.construction.crew.workers)if(other!==worker&&!other.machineId)obstacles.push({min:{x:other.position.x-.42,z:other.position.z-.42},max:{x:other.position.x+.42,z:other.position.z+.42}});
 const boundedObstacles=obstacles.filter(box=>box.max.x+.38>=minX&&box.min.x-.38<=maxX&&box.max.z+.38>=minZ&&box.min.z-.38<=maxZ),blockedCache=new Map();
 const blocked=point=>{const key=point.x+','+point.z;if(blockedCache.has(key))return blockedCache.get(key);const result=point.x<minX||point.x>maxX||point.z<minZ||point.z>maxZ||boundedObstacles.some(box=>point.x>box.min.x-.38&&point.x<box.max.x+.38&&point.z>box.min.z-.38&&point.z<box.max.z+.38);blockedCache.set(key,result);return result;};
 const clearSegment=(from,to)=>{const steps=Math.max(1,Math.ceil(gap(from,to)/.2));for(let index=1;index<=steps;index++)if(blocked({x:from.x+(to.x-from.x)*index/steps,z:from.z+(to.z-from.z)*index/steps}))return false;return true;};
 const cell=point=>[Math.round(point.x/size),Math.round(point.z/size)],key=(x,z)=>x+','+z,[sx,sz]=cell(start),[gx,gz]=cell(goal),open=[{x:sx,z:sz,g:0,f:0}],visited=new Map([[key(sx,sz),{g:0,parent:null}]]);let end=null,count=0;
 while(open.length&&count++<Math.min(5000,Math.ceil(extent*extent))){
  open.sort((a,b)=>b.f-a.f);const node=open.pop();if(Math.abs(node.x-gx)<=1&&Math.abs(node.z-gz)<=1&&clearSegment({x:node.x*size,z:node.z*size},goal)){end=node;break;}
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
   const x=node.x+dx,z=node.z+dz,p={x:x*size,z:z*size};if(blocked(p)||dx&&dz&&(blocked({x:node.x*size,z:p.z})||blocked({x:p.x,z:node.z*size})))continue;
   const g=node.g+Math.hypot(dx,dz),id=key(x,z);if(g>=(visited.get(id)?.g??Infinity))continue;visited.set(id,{g,parent:key(node.x,node.z)});open.push({x,z,g,f:g+Math.hypot(gx-x,gz-z)});
  }
 }
 if(!end)return null;const path=[goal];let current=key(end.x,end.z);while(current&&current!==key(sx,sz)){const [x,z]=current.split(',').map(Number);path.push({x:x*size,y:start.y,z:z*size});current=visited.get(current)?.parent;}return path.reverse();
}
function walkTo(sim,worker,goal,now,dt,context){
 if(gap(worker.position,goal)<.65)return true;
 if(!worker.route||worker.routeGoal&&gap(worker.routeGoal,goal)>1){worker.route=walkPath(sim,worker,goal,context);worker.routeIndex=0;worker.routeGoal={...goal};}
 if(!worker.route){worker.state='waiting';worker.message='Pedestrian route is obstructed. Clear the marked access.';worker.retryAt=now+1800;return false;}
 const target=worker.route[worker.routeIndex];if(!target){worker.route=null;return false;}const distance=gap(worker.position,target),step=Math.min(distance,dt*1.4);
 if(distance<.25){worker.routeIndex++;return false;}
 const next={x:worker.position.x+(target.x-worker.position.x)/distance*step,y:worker.position.y,z:worker.position.z+(target.z-worker.position.z)/distance*step};
 const others=sim.construction.crew.workers.some(other=>other!==worker&&!other.machineId&&gap(other.position,next)<.8),humans=Object.values(sim.players||{}).some(player=>player.health>0&&!player.vehicleId&&gap(player.position,next)<.8);
 if(others||humans){worker.route=null;worker.retryAt=now+500;worker.state='waiting';worker.message='Waiting for a clear pedestrian path.';return false;}
 const floor=context.collision?.groundAt?earthworksGroundAt(sim.construction.earthworks,next,p=>context.collision.groundAt(context.environment,p,{actors:sim.actors,objects:context.objects,earthworks:sim.construction.earthworks})):next;
 const resolved=floor&&(context.collision?.resolve?context.collision.resolve(context.environment,worker.position,{...next,y:floor.y},sim.actors,context.objects,{earthworks:sim.construction.earthworks}):{...next,y:floor.y});
 if(!resolved||Math.abs(resolved.y-worker.position.y)>.5||gap(resolved,next)>.15||gap(resolved,worker.position)<step*.2){worker.route=null;worker.state='waiting';worker.retryAt=now+1000;return false;}
 worker.heading=Math.atan2(worker.position.x-resolved.x,worker.position.z-resolved.z);worker.position={x:resolved.x,y:resolved.y,z:resolved.z};worker.state='walking';return false;
}
function issue(sim,worker,job,operation,now,context,fields={}){
 try{const result=operate(context)(sim,worker.machineId,worker.id,{operation,...fields},now,context);worker.blockedAt=0;message(worker,job,result);return true;}
 catch(error){worker.state='waiting';worker.retryAt=now+1000;if(sim.actors[worker.machineId]?.construction?.blocked)worker.blockedAt||=now;else worker.blockedAt=0;message(worker,job,error.message);return false;}
}
function fallbackDrive(sim,actor,worker,input,now,dt,context){
 const before={...actor.position};let blocked=false;
 for(let remaining=dt;remaining>1e-8;remaining-=.05){Object.assign(actor,stepRoadVehicle(actor,input,Math.min(.05,remaining),{speedLimit:3.5,groundAt:point=>constructionGroundAt(actor,point,p=>earthworksGroundAt(sim.construction.earthworks,p,q=>context.collision?.groundAt?context.collision.groundAt(context.environment,q,{actors:{...sim.actors,[actor.id]:{...actor,active:false}},objects:context.objects,earthworks:sim.construction.earthworks}):q)),blocked:(from,to,yaw)=>!!constructionMovementBlocked(sim,actor,{...actor,position:to,rotation:{...actor.rotation,y:yaw}},context)}));blocked||=!!actor.driving?.blocked;}
 actor.driving.blocked=blocked;return {moved:gap(before,actor.position),blocked,position:actor.position};
}
function driveTo(sim,worker,job,target,now,dt,context,{radius=1.6,rotationY}={}){
 const actor=sim.actors[worker.machineId],distance=gap(actor.position,target),travel=constructionTravelStatus(actor);
 if(!travel.allowed){neutral(actor);message(worker,job,travel.reason);return false;}
 if(distance<radius){
  if(Math.abs(actor.driving?.speed||0)>.08){(context.drive||((a,w,i,n,d)=>fallbackDrive(sim,a,w,i,n,d,context)))(actor,worker,{forward:0,side:0,brake:true},now,dt);return false;}
  if(Number.isFinite(rotationY)&&constructionMachineKind(actor)!=='truck'){
   const difference=angle(rotationY-(actor.rotation?.y||0));if(Math.abs(difference)>.1){(context.drive||((a,w,i,n,d)=>fallbackDrive(sim,a,w,i,n,d,context)))(actor,worker,{forward:0,side:clamp(-difference*3,-1,1)},now,dt);return false;}
  }
  neutral(actor);return true;
 }
 const desired=Math.atan2(actor.position.x-target.x,actor.position.z-target.z),difference=angle(desired-(actor.rotation?.y||0)),reverse=Math.abs(difference)>(worker.travelReverse?1.35:1.8),steering=reverse?angle(difference-Math.PI):difference;worker.travelReverse=reverse;
 const input={forward:(reverse?-1:1)*Math.min(.55,Math.max(.16,distance/14))*(Math.abs(steering)>1.1?.4:1),side:clamp(-steering*2.4,-1,1)*(reverse?-1:1),brake:false};
 actor.construction.crewInput={...input};const result=(context.drive||((a,w,i,n,d)=>fallbackDrive(sim,a,w,i,n,d,context)))(actor,worker,input,now,dt);
 if(result?.blocked){worker.state='waiting';worker.blockedAt||=now;message(worker,job,'Haul route obstructed. Machine braked; clear the route to resume.');}else{worker.blockedAt=0;worker.state='operating';}return false;
}
function routeTo(sim,worker,job,target,points,now,dt,context){
 const key=job.id+':'+worker.phase;
 if(worker.driveRouteKey!==key){
  const source=sim.actors[worker.machineId].position,options=(points||[]).map(point=>position(point,source));
  worker.driveRoute=[...options,target].filter((point,index,array)=>!index||gap(point,array[index-1])>.1);worker.driveIndex=0;worker.driveRouteKey=key;
 }
 const goal=worker.driveRoute[worker.driveIndex];if(!goal)return true;
 if(driveTo(sim,worker,job,goal,now,dt,context,{radius:worker.driveIndex===worker.driveRoute.length-1?1.4:3.4,rotationY:goal.rotationY})){worker.driveIndex++;if(worker.driveIndex>=worker.driveRoute.length)return true;}return false;
}
function complete(sim,worker,job,now,context){
 job.completed=Math.min(job.goal,job.completed);job.progress=job.goal>0?clamp(job.completed/job.goal,0,1):1;job.status='completed';job.finishedAt=now;worker.progress=job.progress;message(worker,job,job.label+' complete through machine work.');retireMachine(sim,worker,now,context);worker.jobId=null;worker.phase='standby';worker.blockedAt=0;
 if(worker.demonstration?.status==='active'&&worker.demonstration.jobId===job.id){worker.demonstration.status='completed';worker.demonstration.finishedAt=now;worker.enabled=false;worker.message=worker.name+': '+job.label+' finished through real machine work. Ask me for another site task.';}
}
function cycle(sim,worker,job,now,context,metric){
 const actor=sim.actors[worker.machineId];
 if(worker.phase==='cycle'){
  if(working(actor))return;
  const actual=Math.max(0,metric(actor)-worker.workBaseline);job.completed=Math.min(job.goal,job.completed+actual);job.progress=clamp(job.completed/job.goal,0,1);worker.progress=job.progress;worker.phase='prepare';
  if(job.completed>=job.goal-.001){complete(sim,worker,job,now,context);return;}
  if(actual<.001){worker.retryAt=now+1500;message(worker,job,actor.construction.blocked?.reason||'No material moved. Check the attachment and work envelope.');}
  return;
 }
 worker.workBaseline=metric(actor);
 if(issue(sim,worker,job,'work',now,context))worker.phase='cycle';
}
function looseMaterial(sim,reference){
 const cells=[];for(const patch of sim.construction.earthworks?.patches||[]){if(!['fill','stockpile'].includes(patch.kind))continue;for(let index=0;index<patch.soil.length;index++){const volume=patch.soil[index]+patch.gravel[index]-patch.initialSoil[index];if(volume>.025)cells.push({x:patch.origin.x+(index%patch.columns+.5)*patch.cellSize,y:patch.heights[index],z:patch.origin.z+(Math.floor(index/patch.columns)+.5)*patch.cellSize,volume});}}
 return cells.sort((a,b)=>gap(a,reference)-gap(b,reference))[0]||null;
}
function executeJob(sim,worker,job,now,dt,context,config){
 const actor=sim.actors[worker.machineId],state=actor.construction,type=job.type;
 if(type==='steel'){
  if(!sim.construction.tower.target){job.goal=job.completed;job.progress=1;complete(sim,worker,job,now,context);return;}
  if(worker.phase==='prepare')worker.phase=state.load?'target':'supply';
  if(worker.phase==='supply'&&issue(sim,worker,job,'aim-supply',now,context))worker.phase='wait-supply';
  else if(worker.phase==='wait-supply'&&!working(actor)&&issue(sim,worker,job,'attach',now,context)){worker.beamId=state.load;worker.phase='target';}
  else if(worker.phase==='target'&&issue(sim,worker,job,'aim-target',now,context))worker.phase='wait-target';
  else if(worker.phase==='wait-target'&&!working(actor)&&issue(sim,worker,job,'release',now,context)){
   if(sim.actors[worker.beamId]?.constructionBeam?.state==='placed'){job.completed++;job.progress=clamp(job.completed/job.goal,0,1);worker.progress=job.progress;}
   worker.phase='supply';if(job.completed>=job.goal)complete(sim,worker,job,now,context);
  }
 }else if(type==='dig'){
  if(worker.phase!=='cycle'&&load(actor)>.001){message(worker,job,'Bucket already contains material. Assign loading before another dig.');worker.retryAt=now+1000;return;}
  cycle(sim,worker,job,now,context,a=>load(a));
 }else if(type==='load'){
  if(worker.phase!=='cycle'&&load(actor)<=.001){message(worker,job,'Waiting for an excavated bucket to load.');worker.retryAt=now+1000;return;}
  cycle(sim,worker,job,now,context,a=>-load(a));
 }else if(type==='haul'){
  const loading=position(config.loading,{x:30,y:0,z:17}),dump=position(config.dump,{x:sim.construction.stockpile.x,y:0,z:sim.construction.stockpile.z});
  if(!worker.phase.startsWith('haul-'))worker.phase=load(actor)>.001?'haul-out':'haul-loading';
  if(worker.phase==='haul-loading'){
   if(routeTo(sim,worker,job,loading,config.approachWaypoints,now,dt,context)){worker.phase='haul-wait';message(worker,job,'Parked in the actual excavator loading envelope.');}
  }else if(worker.phase==='haul-wait'){neutral(actor);if(load(actor)>.001){worker.phase='haul-out';worker.haulStartDistance=actor.driving?.distance||0;}else message(worker,job,'Waiting for the excavator to transfer its real bucket.');}
  else if(routeTo(sim,worker,job,dump,[...(config.approachWaypoints||[]).slice().reverse(),...(config.haulWaypoints||[]).slice(0,3),...(config.dumpApproachWaypoints||[])],now,dt,context)){
   job.completed=Math.min(job.goal,load(actor));if(job.completed>=job.goal-.001)complete(sim,worker,job,now,context);else message(worker,job,'Delivered a partial load; more material is needed for this job.');
  }
 }else if(type==='dump'){
  const dump=position(config.dump,sim.construction.stockpile);
  if(worker.phase==='dump-clear'){
   const yaw=actor.rotation?.y||0;worker.clearanceTarget||={x:actor.position.x-Math.sin(yaw)*8,y:actor.position.y,z:actor.position.z-Math.cos(yaw)*8};message(worker,job,'Body lowered and material delivered. Moving forward clear of the rear discharge.');if(routeTo(sim,worker,job,worker.clearanceTarget,[],now,dt,context))complete(sim,worker,job,now,context);return;
  }
  if(gap(actor.position,dump)>12){worker.phase='dump-approach';routeTo(sim,worker,job,dump,[...(config.haulWaypoints||[]).slice(0,3),...(config.dumpApproachWaypoints||[])],now,dt,context);return;}
  if(worker.phase==='cycle'&&!working(actor)){
   const actual=Math.max(0,worker.workBaseline-load(actor));job.completed=Math.min(job.goal,job.completed+actual);job.progress=clamp(job.completed/job.goal,0,1);worker.progress=job.progress;
   if(job.completed>=job.goal-.001){const yaw=actor.rotation?.y||0;worker.clearanceTarget={x:actor.position.x-Math.sin(yaw)*8,y:actor.position.y,z:actor.position.z-Math.cos(yaw)*8};worker.travelReverse=false;worker.phase='dump-clear';return;}worker.phase='prepare';
  }
  if(worker.phase!=='cycle'&&load(actor)>.001){worker.workBaseline=load(actor);if(issue(sim,worker,job,'work',now,context))worker.phase='cycle';}
  else if(!load(actor)&&worker.phase!=='cycle'){message(worker,job,'Waiting for a loaded truck at a real fill or stockpile patch.');worker.retryAt=now+1000;}
 }else if(type==='grade'){
  if(worker.phase==='cycle'){cycle(sim,worker,job,now,context,a=>a.construction.earthMoved||0);return;}
  if(state.telemetry?.canWork&&Math.abs(actor.driving?.speed||0)<.15){cycle(sim,worker,job,now,context,a=>a.construction.earthMoved||0);return;}
  const cell=looseMaterial(sim,position(config.grade,sim.construction.stockpile));
  if(!cell){neutral(actor);message(worker,job,'Waiting for actual deposited soil or gravel to grade.');worker.retryAt=now+1200;return;}
  const target={x:cell.x,y:actor.position.y,z:cell.z+3.15,rotationY:0};
  if(!driveTo(sim,worker,job,target,now,dt,context,{radius:.65,rotationY:0}))return;
  cycle(sim,worker,job,now,context,a=>a.construction.earthMoved||0);
 }
}

export function stepConstructionCrew(sim,now,dt,context={}){
 const crew=sim.construction?.crew;if(!crew)return;dt=clamp(dt,0,.25);const config=configFor(context.environment);crew.updatedAt=now;
 for(const worker of crew.workers){
  if(worker.demonstration?.status==='active'){
   const requester=sim.players[worker.demonstration.requestedBy];
   if(!requester||requester.health<=0||requester.replacedByRoom||now-(requester.lastSeen??0)>15000){retireMachine(sim,worker,now,context,'Demonstration stopped after its visitor left the live site.');worker.enabled=false;worker.demonstration.status='cancelled';worker.demonstration.finishedAt=now;}
  }
  const owned=sim.actors[worker.machineId],lease=owned?.construction?.crewOperator;
  if(owned?.holderId||owned?.active===false||lease&&lease.workerId!==worker.id){retireMachine(sim,worker,now,context,'A human operator or another worker has priority.');if(worker.demonstration?.status==='active'){worker.enabled=false;worker.demonstration.status='cancelled';worker.demonstration.finishedAt=now;}}
  if(owned?.construction?.blocked&&working(owned))worker.blockedAt||=now;
  if(!crew.enabled||!worker.enabled){if(worker.machineId)retireMachine(sim,worker,now,context);worker.state='paused';continue;}
  if(worker.blockedAt&&now-worker.blockedAt>12000){retireMachine(sim,worker,now,context,'Work stalled. Machine released safely; clear the obstruction and restart this worker.');worker.enabled=false;continue;}
  if(now<(worker.retryAt||0)){if(worker.machineId)try{operator(context)(sim,worker.machineId,worker.id,now,context);}catch{}continue;}
  let job=crew.jobs.find(job=>job.id===worker.jobId&&job.workerId===worker.id&&job.status!=='completed');
  if(!job){
   job=crew.jobs.find(job=>job.workerId===worker.id&&job.status!=='completed');
   if(!job){const index=crew.workers.indexOf(worker),home=worker.home||{x:crew.muster.x+(index%2)*1.8,y:crew.muster.y,z:crew.muster.z+Math.floor(index/2)*1.8};worker.jobId=null;worker.progress=0;worker.phase='standby';if(gap(worker.position,home)<.65){worker.state='waiting';worker.route=null;}else walkTo(sim,worker,home,now,dt,context);continue;}
   worker.jobId=job.id;worker.phase='approach';worker.progress=job.progress;worker.role=CONSTRUCTION_CREW_JOBS[job.type].role;
  }
  const kind=CONSTRUCTION_CREW_JOBS[job.type].machine;
  if(!worker.machineId){
   const machine=machineFor(sim,kind,job.machineId);if(!machine||machine.holderId||machine.construction?.crewOperator&&machine.construction.crewOperator.workerId!==worker.id&&machine.construction.crewOperator.expiresAt>now){worker.state='waiting';job.status='waiting';message(worker,job,'Waiting for a free '+kind+'. Players have priority.');worker.retryAt=now+1000;continue;}
   const access=accessPoint(machine);if(!walkTo(sim,worker,access,now,dt,context)){job.status='walking';continue;}
   try{if(!operator(context)(sim,machine.id,worker.id,now,context)){worker.retryAt=now+1000;continue;}}catch(error){message(worker,job,error.message);worker.retryAt=now+1000;continue;}
   worker.machineId=machine.id;job.machineId=machine.id;worker.phase='prepare';worker.route=null;worker.driveRouteKey=null;worker.workBaseline=0;
  }
  const machine=sim.actors[worker.machineId];
  try{operator(context)(sim,machine.id,worker.id,now,context);}catch(error){retireMachine(sim,worker,now,context,error.message);continue;}
  worker.state='operating';job.status='active';executeJob(sim,worker,job,now,dt,context,config);
  if(worker.machineId){const seat=constructionOperatorPose(machine);worker.position=accessPoint(machine);if(seat)worker.heading=seat.yaw;}
  worker.progress=job.progress;
 }
}
