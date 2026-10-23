import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureConstruction,stepConstruction} from '../server-construction.mjs';
import {ensureConstructionCrew,stepConstructionCrew,constructionCrewAction,releaseConstructionCrewMachine} from '../server-construction-crew.mjs';
import {earthworksTake,earthworksDeposit,refreshEarthworksTotals} from '../public/js/construction-earthworks.js';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {constructionCrewSetOperator} from '../server-construction.mjs';

const machine=(id,modelId,x,z)=>({id,modelId,position:{x,y:0,z},rotation:{x:0,y:0,z:0},active:true,health:100,driving:{speed:0,parked:true}});
function fixture(kind='truck'){
 const actor=machine(kind,kind==='truck'?'site-dumptruck':kind==='crane'?'tower-crane':'site-bulldozer',kind==='crane'?-18:0,kind==='crane'?-4:0);
 const environment={construction:{enabled:true,stockpile:{x:0,z:-24},crew:{muster:{x:-8,y:0,z:8},loading:{x:0,y:0,z:0},dump:{x:0,y:0,z:-24},grade:{x:0,y:0,z:-24}},earthworks:{patches:[{id:'fill-test',kind:'fill',x:0,z:-24,width:20,depth:20,maxDepth:0}]}}};
 const sim={actors:{[kind]:actor},players:{},events:[],sequence:1};let now=1000;ensureConstruction(sim,environment);const crew=ensureConstructionCrew(sim,environment,now),worker=crew.workers.find(worker=>kind==='crane'?worker.id==='crew-maya':kind==='truck'?worker.id==='crew-jules':worker.id==='crew-ellis');
 for(const member of crew.workers)member.enabled=member===worker;
 const player={actorId:'supervisor',health:100,lastSeen:now,position:{x:-8,y:0,z:8}},context={environment};
 const send=(operation,fields={})=>constructionCrewAction(sim,player,{operation,...fields},now,context);
 const tick=()=>{now+=100;player.lastSeen=now;stepConstructionCrew(sim,now,.1,context);stepConstruction(sim,now,.1,context);};
 return {sim,actor,environment,crew,worker,player,context,send,tick,get now(){return now;}};
}
function preload(f,volume=2){
 const cargo=earthworksTake(f.sim.construction.earthworks,{x:25,y:0,z:17},volume,{cutY:-8});
 f.actor.construction.cargo=cargo;f.actor.construction.load=cargo.soil+cargo.gravel;refreshEarthworksTotals(f.sim.construction.earthworks,[cargo]);
}
const total=sim=>{const earth=sim.construction.earthworks;return earth.patches.reduce((sum,patch)=>sum+patch.soil.reduce((a,b)=>a+b,0)+patch.gravel.reduce((a,b)=>a+b,0),0)+Object.values(sim.actors).reduce((sum,actor)=>sum+(actor.construction?.cargo?.soil||0)+(actor.construction?.cargo?.gravel||0),0);};

test('truck crew physically hauls finite cargo, tips it into actual terrain and clears the fill through normal driving',()=>{
 const f=fixture();preload(f);const initialTotal=total(f.sim);f.send('start');let moved=0,last={...f.actor.position},completedAt=null;
 for(let index=0;index<2200;index++){
  f.tick();const distance=Math.hypot(f.actor.position.x-last.x,f.actor.position.z-last.z);assert.ok(distance<=.81,'normal 8m/s vehicle ceiling bounds each 100ms step');moved+=distance;last={...f.actor.position};
  if(f.crew.jobs.find(job=>job.id==='haul').status==='completed'&&completedAt===null){completedAt={...f.actor.position};assert.ok(Math.hypot(completedAt.x,completedAt.z+24)<2);}
  if(f.crew.jobs.find(job=>job.id==='dump').status==='completed')break;
 }
 assert.equal(f.crew.jobs.find(job=>job.id==='haul').status,'completed',JSON.stringify(f.worker));
 assert.equal(f.crew.jobs.find(job=>job.id==='dump').status,'completed',JSON.stringify(f.worker));
 assert.ok(moved>25,'loaded outbound and empty departure both traverse real distance');assert.ok(Math.hypot(f.actor.position.x,f.actor.position.z+24)>5,'the truck drives forward clear of its actual rear discharge');assert.equal(f.actor.construction.load,0);assert.equal(f.actor.construction.bed,0);
 assert.ok(f.sim.construction.earthworks.deposited>=1.999);assert.ok(Math.abs(total(f.sim)-initialTotal)<1e-7);assert.equal(f.actor.construction.crewOperator,undefined);
});

test('an obstructed haul route brakes without teleporting, claiming completion or manufacturing material',()=>{
 const f=fixture();preload(f);const initialTotal=total(f.sim);f.sim.actors.wall={id:'wall',position:{x:0,y:0,z:-10},rotation:{y:0},active:true,constructionStructure:{kind:'wall',size:{x:40,y:8,z:1}}};f.send('start');
 for(let index=0;index<450;index++)f.tick();
 assert.notEqual(f.crew.jobs.find(job=>job.id==='haul').status,'completed');assert.equal(f.crew.jobs.find(job=>job.id==='haul').completed,0);assert.equal(f.actor.construction.load,2);assert.ok(f.actor.position.z>-10);assert.equal(f.actor.driving.speed,0);assert.equal(f.worker.enabled,false);assert.equal(f.actor.construction.crewOperator,undefined);assert.ok(Math.abs(total(f.sim)-initialTotal)<1e-7);
});

test('crew crane erects steel using actual hook alignment, attachment and validated structural release',()=>{
 const f=fixture('crane');f.worker.position={x:-12.4,y:0,z:.8};f.send('start');const job=f.crew.jobs.find(job=>job.id==='steel');job.goal=1;
 let maxHook=0;for(let index=0;index<1800&&job.status!=='completed';index++){f.tick();maxHook=Math.max(maxHook,f.actor.construction.hoist);}
 assert.equal(job.status,'completed',JSON.stringify(f.worker));assert.equal(job.completed,1);assert.equal(f.sim.construction.tower.placed,1);assert.ok(maxHook>8);assert.equal(Object.values(f.sim.actors).filter(actor=>actor.constructionBeam?.state==='placed').length,1);assert.equal(f.actor.construction.load,null);
});

test('grading crew waits on an empty pad and earns progress only by pushing existing material with its real blade',()=>{
 const f=fixture('bulldozer');f.actor.position={x:0,y:0,z:-20.85};f.worker.position={x:-3.5,y:0,z:-20.05};f.send('start');const job=f.crew.jobs.find(job=>job.id==='grade');job.goal=.5;
 for(let index=0;index<40;index++)f.tick();assert.equal(job.completed,0);assert.equal(f.actor.construction.earthMoved||0,0);
 const cargo=earthworksTake(f.sim.construction.earthworks,{x:25,y:0,z:17},2,{cutY:-8});earthworksDeposit(f.sim.construction.earthworks,{x:0,y:Infinity,z:-24},cargo,{radius:2.4});const initial=total(f.sim);
 for(let index=0;index<1200&&job.status!=='completed';index++)f.tick();
 assert.equal(job.status,'completed',JSON.stringify({worker:f.worker,position:f.actor.position,driving:f.actor.driving,telemetry:f.actor.construction.telemetry}));assert.ok(f.actor.construction.earthMoved>=.5);assert.ok(f.sim.construction.earthworks.pushed>=.5);assert.ok(Math.abs(total(f.sim)-initial)<1e-7);
});

test('crew commands validate atomically and reassigning a job leaves only one worker entitled to operate it',()=>{
 const f=fixture(),worker=f.worker,before=structuredClone(worker.appearance),name=worker.name;
 assert.throws(()=>f.send('customize',{workerId:worker.id,name:'Changed Name',appearance:{vest:'invisible'}}),/listed/);assert.equal(worker.name,name);assert.deepEqual(worker.appearance,before);
 assert.throws(()=>f.send('start',{workerId:'unknown'}),/existing/);f.player.health=0;assert.throws(()=>f.send('start'),error=>error.statusCode===403);f.player.health=100;
 f.send('assign',{workerId:worker.id,jobId:'haul',machineId:f.actor.id});f.send('assign',{workerId:'crew-maya',jobId:'haul',machineId:f.actor.id});assert.equal(worker.jobId,null);assert.equal(f.crew.jobs.find(job=>job.id==='haul').workerId,'crew-maya');assert.equal(f.crew.workers.find(member=>member.id==='crew-maya').jobId,'haul');
 f.send('start',{workerId:'crew-maya'});assert.equal(f.crew.enabled,true);
});

test('immediate machine handover clears crew work once and never cancels the new human operator input',()=>{
 const f=fixture('crane');f.worker.position={x:-12.4,y:0,z:.8};f.send('start');f.tick();assert.ok(f.actor.construction.crewOperator);
 releaseConstructionCrewMachine(f.sim,f.actor.id,'Player takeover',f.now,f.context);assert.equal(f.actor.construction.crewOperator,undefined);assert.equal(f.worker.machineId,null);assert.equal(f.actor.driving.speed,0);
 f.actor.holderId='human';f.sim.players.human={actorId:'human',vehicleId:f.actor.id,health:100,lastSeen:f.now,position:{...f.actor.position}};f.actor.construction.axes={hoist:1};f.actor.construction.controlAt=f.now;f.tick();assert.deepEqual(f.actor.construction.axes,{hoist:1});assert.equal(f.worker.machineId,null);
});

test('the authoritative drive adapter retains a real obstruction across quarter-second substeps',()=>{
 const f=fixture();Object.assign(f.environment,{proceduralLand:true,builderScene:{mapSize:120,objects:[]}});const runtime=new AuthoritativeRooms({store:{},now:()=>f.now}),context=runtime.constructionContext(f.sim,f.environment,{});
 f.sim.actors.wall={id:'wall',position:{x:0,y:0,z:-5.2},rotation:{y:0},active:true,constructionStructure:{kind:'wall',size:{x:30,y:8,z:1}}};f.actor.driving={speed:8,parked:false};constructionCrewSetOperator(f.sim,f.actor.id,f.worker.id,f.now);
 const result=context.drive(f.actor,f.worker,{forward:1,side:0},f.now,.25);
 assert.equal(result.blocked,true);assert.equal(f.actor.driving.blocked,true);assert.equal(f.actor.driving.speed,0);assert.ok(f.actor.position.z>-.6,'the blocked chassis cannot cross the wall');assert.ok(f.actor.construction.blocked?.objectId==='wall');
});

test('completed workers settle into separate muster slots without blocking each other or walking indefinitely',()=>{
 const f=fixture();for(const job of f.crew.jobs)job.status='completed';for(const worker of f.crew.workers){worker.enabled=true;worker.position={x:worker.home.x,y:0,z:worker.home.z+4};}f.send('start');
 for(let index=0;index<200;index++)f.tick();
 for(const worker of f.crew.workers){assert.ok(Math.hypot(worker.position.x-worker.home.x,worker.position.z-worker.home.z)<.65,JSON.stringify(worker));assert.equal(worker.state,'waiting');}
 const settled=f.crew.workers.map(worker=>({...worker.position}));for(let index=0;index<30;index++)f.tick();assert.deepEqual(f.crew.workers.map(worker=>worker.position),settled,'idle crews do not continuously replan or shuffle at one occupied point');
});
