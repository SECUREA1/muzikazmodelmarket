import test from 'node:test';
import assert from 'node:assert/strict';
import {constructionWorld} from '../construction-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {constructionMachineChoices,constructionStructure} from '../public/js/construction-workplans.js';
import {constructionAccessPoint} from '../public/js/construction-access.js';
import {sharedNearbyActions} from '../public/js/gameplay-actions.js';
import {constructionCommand,stepConstruction,constructionCrewSetOperator,constructionTelemetry} from '../server-construction.mjs';
import {constructionCrewAction,constructionCrewInteraction,stepConstructionCrew} from '../server-construction-crew.mjs';
import {earthworksTake,earthworksDeposit,earthCargoVolume,refreshEarthworksTotals} from '../public/js/construction-earthworks.js';
import {constructionJointPose} from '../public/js/construction-kinematics.js';

function fixture(){
 let now=1000;const environment=constructionWorld(),runtime=new AuthoritativeRooms({now:()=>now}),room={objects:{}},sim=runtime.initialize(room,environment).sim;sim.construction.crew.enabled=false;
 const player={actorId:'operator',id:'operator',health:100,lastSeen:now,position:{x:-20,y:.02,z:23},input:{}};sim.players.operator=player;
 const manifest=runtime.initialize(room,environment).manifest;const context=runtime.constructionContext(sim,environment,room.objects),board=id=>{const previous=sim.actors[player.vehicleId];if(previous)previous.holderId=null;const actor=sim.actors[id];player.vehicleId=id;actor.holderId=player.actorId;player.position={...actor.position};};
 const command=(operation,fields={})=>constructionCommand(sim,player,{operation,...fields},now,context);
 const tick=()=>{now+=100;player.lastSeen=now;stepConstruction(sim,now,.1,context);};
 const finish=()=>{for(let i=0;i<2000&&(sim.actors[player.vehicleId].construction.assist||sim.actors[player.vehicleId].construction.workCycle);i++)tick();const state=sim.actors[player.vehicleId].construction;assert.ok(!state.assist&&!state.workCycle,JSON.stringify(state.blocked));};
 return {sim,environment,context,manifest,player,board,command,tick,finish,get now(){return now;}};
}
const mass=sim=>{const e=sim.construction.earthworks;return e.patches.reduce((sum,p)=>sum+p.soil.reduce((a,b)=>a+b,0)+p.gravel.reduce((a,b)=>a+b,0),0)+Object.values(sim.actors).reduce((sum,a)=>sum+earthCargoVolume(a.construction?.cargo),0);};

test('machine list and nearby vehicle action agree at real cab access, including human and AI ownership',()=>{
 const f=fixture();for(const id of ['construction-excavator','construction-crane','construction-truck','construction-dozer']){
  const actor=f.sim.actors[id];f.player.position={...constructionAccessPoint(actor),y:.02};const snapshot={...f.sim,selfId:'operator'};
  let choice=constructionMachineChoices(snapshot).find(choice=>choice.id===id);assert.ok(choice.available,id);assert.ok(sharedNearbyActions(f.player,f.sim.actors,f.manifest,'f').some(choice=>choice.entityId===id));
  actor.holderId='other';choice=constructionMachineChoices(snapshot).find(choice=>choice.id===id);assert.equal(choice.available,false);assert.ok(!sharedNearbyActions(f.player,f.sim.actors,f.manifest,'f').some(choice=>choice.entityId===id));actor.holderId=null;
  constructionCrewSetOperator(f.sim,id,'crew-maya',f.now);choice=constructionMachineChoices(snapshot).find(choice=>choice.id===id);assert.equal(choice.operator,'Maya Chen');assert.ok(choice.available,'a nearby player may take over AI machinery');constructionCrewSetOperator(f.sim,id,null,f.now);
 }
 f.player.position={x:240,y:.02,z:220};assert.ok(constructionMachineChoices({...f.sim,selfId:'operator'}).every(choice=>!choice.available));
});

test('player erects all twelve facility beams through real collision, without advancing the skyscraper',()=>{
 const f=fixture();f.board('construction-crane');f.command('structure-target',{structureId:'facility'});assert.equal(constructionStructure(f.sim.construction,f.sim.actors[f.player.vehicleId]),f.sim.construction.facility);
 for(let index=0;index<12;index++){
  f.command('aim-supply');f.finish();f.command('attach');f.command('aim-target');f.finish();f.command('release');assert.equal(f.sim.construction.facility.placed,index+1);
 }
 assert.equal(f.sim.construction.facility.floors,3);assert.equal(f.sim.construction.tower.placed,0);assert.ok(f.sim.actors['construction-facility-floor-3']);assert.equal(Object.values(f.sim.actors).filter(a=>a.constructionStructure?.structureId==='facility'&&a.constructionStructure.kind==='facade').length,0);
 assert.throws(()=>f.command('aim-target'),/complete/);f.command('structure-target',{structureId:'tower'});assert.equal(f.sim.construction.tower.target.level,1);
});

test('AI steel assignment uses the selected facility through the same crane commands',()=>{
 const f=fixture(),crew=f.sim.construction.crew,maya=crew.workers.find(w=>w.id==='crew-maya');for(const worker of crew.workers)worker.enabled=worker===maya;maya.position=constructionAccessPoint(f.sim.actors['construction-crane']);
 constructionCrewAction(f.sim,f.player,{operation:'assign',workerId:maya.id,jobId:'steel',machineId:'construction-crane',workArea:'facility'},f.now,f.context);constructionCrewInteraction(f.sim,f.player,{operation:'demonstrate',workerId:maya.id,jobId:'steel'},f.now,f.context);assert.equal(crew.jobs.find(j=>j.id==='steel').workArea,'facility','demonstration keeps the selected work area');
 for(let i=0;i<2500&&crew.jobs.find(j=>j.id==='steel').status!=='completed';i++){stepConstructionCrew(f.sim,f.now,.1,f.context);f.tick();}
 assert.equal(crew.jobs.find(j=>j.id==='steel').status,'completed',maya.message);assert.equal(f.sim.construction.facility.placed,4);assert.equal(f.sim.construction.tower.placed,0);
});

test('finished-grade dozer transfers finite soil into low cells, retaining the specified surface',()=>{
 const f=fixture(),actor=f.sim.actors['construction-dozer'];actor.position={x:197,y:0,z:95.15};actor.rotation.y=0;f.board(actor.id);
 const earth=f.sim.construction.earthworks,p=earth.patches.find(p=>p.id==='new-road'),index=5*p.columns+14,source={x:p.origin.x+(index%p.columns+.5)*2,y:Infinity,z:p.origin.z+(Math.floor(index/p.columns)+.5)*2};
 const cargo=earthworksTake(earth,{x:122,y:Infinity,z:12},8,{radius:4,looseOnly:true});earthworksDeposit(earth,source,cargo,{radius:0});const before=mass(f.sim);
 actor.position.x=source.x;actor.position.z=source.z+3.15;f.player.position={...actor.position};f.command('grade-target',{height:.2});
 const ready=constructionTelemetry(f.sim,actor,f.now,f.context);assert.ok(ready.canWork,ready.workReason);f.command('work');f.finish();
 assert.ok(earth.pushed>0);assert.ok(Math.abs(mass(f.sim)-before)<1e-6);assert.ok(p.heights[index]>=.2-1e-6,'the source cannot be cut below finished grade');
 assert.throws(()=>f.command('grade-target',{height:Infinity}),/grade/);f.command('grade-target',{height:null});assert.equal(actor.construction.gradeTarget,null);
});

test('work area assignment validates before releasing an AI machine or changing a job',()=>{
 const f=fixture(),worker=f.sim.construction.crew.workers.find(w=>w.id==='crew-ellis'),before=structuredClone(f.sim.construction.crew);
 assert.throws(()=>constructionCrewAction(f.sim,f.player,{operation:'assign',workerId:worker.id,jobId:'grade',workArea:'not-a-patch'},f.now,f.context),/work area/);assert.deepEqual(f.sim.construction.crew,before);
 constructionCrewAction(f.sim,f.player,{operation:'assign',workerId:worker.id,jobId:'grade',workArea:'new-road'},f.now,f.context);assert.equal(f.sim.construction.crew.jobs.find(j=>j.id==='grade').workArea,'new-road');
 constructionCrewAction(f.sim,f.player,{operation:'assign',workerId:'crew-jules',jobId:'haul',machineId:'construction-truck',workArea:'recycled-aggregate'},f.now,f.context);assert.equal(f.sim.construction.crew.jobs.find(j=>j.id==='dump').workArea,'recycled-aggregate','tip job follows its haul destination');
});

test('AI digs the assigned pavement and a second operator tips its real cargo onto the selected road',()=>{
 const f=fixture(),crew=f.sim.construction.crew,excavator=f.sim.actors['construction-excavator'],truck=f.sim.actors['construction-truck'],noor=crew.workers.find(w=>w.id==='crew-noor'),jules=crew.workers.find(w=>w.id==='crew-jules');
 for(const worker of crew.workers)worker.enabled=false;
 excavator.position={x:198,y:.24,z:16};noor.position=constructionAccessPoint(excavator);
 constructionCrewAction(f.sim,f.player,{operation:'assign',workerId:noor.id,jobId:'dig',machineId:excavator.id,workArea:'pavement-reclamation'},f.now,f.context);constructionCrewAction(f.sim,f.player,{operation:'start',workerId:noor.id},f.now,f.context);
 for(let i=0;i<250&&crew.jobs.find(j=>j.id==='dig').status!=='completed';i++){stepConstructionCrew(f.sim,f.now,.1,f.context);f.tick();}
 assert.equal(crew.jobs.find(j=>j.id==='dig').status,'completed',noor.message);assert.ok(excavator.construction.cargo.gravel>0);
 const original=mass(f.sim),cargo={...excavator.construction.cargo};excavator.construction.cargo={soil:0,gravel:0};excavator.construction.load=0;truck.construction.cargo=cargo;truck.construction.load=earthCargoVolume(cargo);noor.enabled=false;
 truck.position={x:198,y:0,z:88};jules.position=constructionAccessPoint(truck);
 constructionCrewAction(f.sim,f.player,{operation:'assign',workerId:jules.id,jobId:'dump',machineId:truck.id,workArea:'new-road'},f.now,f.context);constructionCrewAction(f.sim,f.player,{operation:'start',workerId:jules.id},f.now,f.context);
 for(let i=0;i<500&&crew.jobs.find(j=>j.id==='dump').status!=='completed';i++){stepConstructionCrew(f.sim,f.now,.1,f.context);f.tick();}
 assert.equal(crew.jobs.find(j=>j.id==='dump').status,'completed',jules.message);assert.equal(truck.construction.load,0);assert.ok(f.sim.construction.earthworks.patches.find(p=>p.id==='new-road').gravel.some(v=>v>0));assert.ok(Math.abs(mass(f.sim)-original)<1e-6);
});

test('AI grade assignment actually spreads its selected road to the shared 20 cm grade',()=>{
 const f=fixture(),crew=f.sim.construction.crew,dozer=f.sim.actors['construction-dozer'],worker=crew.workers.find(w=>w.id==='crew-ellis');for(const member of crew.workers)member.enabled=false;
 const earth=f.sim.construction.earthworks,cargo=earthworksTake(earth,{x:122,y:Infinity,z:12},8,{radius:4,looseOnly:true});earthworksDeposit(earth,{x:197,y:Infinity,z:94},cargo,{radius:0});dozer.position={x:197,y:0,z:97.15};dozer.rotation.y=0;worker.position=constructionAccessPoint(dozer);const original=mass(f.sim);
 constructionCrewAction(f.sim,f.player,{operation:'assign',workerId:worker.id,jobId:'grade',machineId:dozer.id,workArea:'new-road'},f.now,f.context);constructionCrewAction(f.sim,f.player,{operation:'start',workerId:worker.id},f.now,f.context);
 for(let i=0;i<350&&crew.jobs.find(j=>j.id==='grade').status!=='completed';i++){stepConstructionCrew(f.sim,f.now,.1,f.context);f.tick();}
 assert.equal(crew.jobs.find(j=>j.id==='grade').status,'completed',worker.message);assert.equal(dozer.construction.gradeTarget,.2);assert.ok(earth.pushed>=1);assert.ok(Math.abs(mass(f.sim)-original)<1e-6);
});

test('crew controls remain available in the far yard while off-site requests are rejected',()=>{
 const f=fixture();f.player.position={x:230,y:.02,z:214};assert.doesNotThrow(()=>constructionCrewAction(f.sim,f.player,{operation:'status'},f.now,f.context));
 f.player.position={x:500,y:0,z:500};assert.throws(()=>constructionCrewAction(f.sim,f.player,{operation:'status'},f.now,f.context),/Return to the construction site/);
});
