import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureConstruction,stepConstruction,constructionCommand} from '../server-construction.mjs';
import {ensureConstructionCrew,constructionCrewInteraction,stepConstructionCrew,releaseConstructionCrewMachine} from '../server-construction-crew.mjs';
import {earthCargoVolume} from '../public/js/construction-earthworks.js';

function fixture(){
 const machine=(id,modelId,x,z)=>({id,modelId,position:{x,y:0,z},rotation:{x:0,y:0,z:0},active:true,health:100,driving:{speed:0,parked:true}});
 const sim={actors:{excavator:machine('excavator','site-excavator',0,0),truck:machine('truck','site-dumptruck',5,0)},players:{},events:[],sequence:1};
 const environment={id:'crew-conversations',construction:{enabled:true,excavation:{x:.7,z:-3.69,width:4,depth:4,radius:2,maxDepth:2},stockpile:{x:20,z:0,width:8,depth:8},crew:{muster:{x:-7,y:0,z:0}}}};
 let now=1000;ensureConstruction(sim,environment);const crew=ensureConstructionCrew(sim,environment,now),worker=crew.workers.find(member=>member.id==='crew-noor');
 for(const member of crew.workers)member.enabled=member===worker;
 const player=sim.players.visitor={actorId:'visitor',health:100,lastSeen:now,position:{x:-12,y:0,z:-12},input:{},score:12,tokens:{MZK:60}},context={environment};
 const send=(operation,fields={})=>constructionCrewInteraction(sim,player,{operation,workerId:worker.id,...fields},now,context);
 const tick=(count=1,{refresh=true}={})=>{for(let index=0;index<count;index++){now+=100;if(refresh)player.lastSeen=now;stepConstructionCrew(sim,now,.1,context);stepConstruction(sim,now,.1,context);}};
 const until=(condition,budget=500)=>{for(let index=0;index<budget&&!condition();index++)tick();assert.ok(condition(),JSON.stringify({worker,jobs:crew.jobs,excavator:sim.actors.excavator.construction}));};
 return {sim,environment,crew,worker,player,context,send,tick,until,get now(){return now;},skip(milliseconds){now+=milliseconds;}};
}
const volume=sim=>sim.construction.earthworks.patches.reduce((sum,patch)=>sum+patch.soil.reduce((a,b)=>a+b,0)+patch.gravel.reduce((a,b)=>a+b,0),0)+Object.values(sim.actors).reduce((sum,actor)=>sum+earthCargoVolume(actor.construction?.cargo),0);

test('a visitor asks the named operator for real excavation then loading, with live results and no synthetic rewards',()=>{
 const f=fixture(),initial=volume(f.sim),account=structuredClone({score:f.player.score,tokens:f.player.tokens}),before={...f.worker.position};
 const offer=f.send('status');assert.deepEqual(offer.choices.map(choice=>[choice.jobId,choice.available]),[['dig',true],['load',false]]);
 assert.equal(f.send('demonstrate').workers[0].demonstration.jobId,'dig');assert.equal(f.sim.actors.excavator.construction.load,0,'conversation acceptance alone cannot excavate');
 f.until(()=>f.worker.machineId==='excavator');assert.ok(Math.hypot(f.worker.position.x-before.x,f.worker.position.z-before.z)>1,'operator actually walks to the machine');
 f.until(()=>f.worker.demonstration.status==='completed');assert.equal(f.sim.actors.excavator.construction.load,2);assert.equal(f.crew.jobs.find(job=>job.id==='dig').completed,2);assert.equal(f.worker.enabled,false,'a demonstration ends at its requested job');
 assert.equal(f.send('demonstrate').workers[0].demonstration.jobId,'load','next request chooses material transfer because the bucket is full');
 f.until(()=>f.worker.demonstration.status==='completed');assert.equal(f.sim.actors.excavator.construction.load,0);assert.equal(f.sim.actors.truck.construction.load,2);assert.equal(volume(f.sim),initial,'the same finite material is transferred through hydraulics');
 assert.deepEqual({score:f.player.score,tokens:f.player.tokens},account,'AI work is not a wallet transaction or a score grant');
 const status=f.send('status');assert.match(status.message,/finished through real machine work/);assert.equal(status.workers[0].demonstration.status,'completed');
});

test('stop and requester disconnect neutralize unfinished live hydraulics without material or completion credit',()=>{
 for(const reason of ['stop','disconnect']){
  const f=fixture(),initial=volume(f.sim);f.send('demonstrate',{jobId:'dig'});f.until(()=>!!f.sim.actors.excavator.construction.workCycle);f.tick(2);
  if(reason==='stop')f.send('stop');else{f.skip(16000);f.tick(1,{refresh:false});}
  f.tick(40);assert.equal(f.worker.demonstration.status,'cancelled');assert.equal(f.worker.enabled,false);assert.equal(f.sim.actors.excavator.construction.crewOperator,undefined);assert.equal(f.sim.actors.excavator.construction.workCycle,undefined);assert.deepEqual(f.sim.actors.excavator.construction.axes,{});assert.equal(f.sim.actors.excavator.driving.speed,0);assert.equal(f.sim.actors.excavator.construction.load,0);assert.equal(f.crew.jobs.find(job=>job.id==='dig').completed,0);assert.equal(volume(f.sim),initial);
 }
});

test('human priority cancels the demonstration and its cleanup preserves fresh human hydraulic input',()=>{
 const f=fixture();f.send('demonstrate',{jobId:'dig'});f.until(()=>!!f.sim.actors.excavator.construction.workCycle);const actor=f.sim.actors.excavator;
 releaseConstructionCrewMachine(f.sim,actor.id,'Player took over',f.now,f.context);actor.holderId=f.player.actorId;f.player.vehicleId=actor.id;f.player.position={...actor.position};constructionCommand(f.sim,f.player,{operation:'control',axes:{boom:1}},f.now);
 const boom=actor.construction.boom;f.tick();assert.equal(f.worker.demonstration.status,'cancelled');assert.equal(f.worker.machineId,null);assert.equal(actor.holderId,f.player.actorId);assert.equal(actor.construction.axes.boom,1);assert.ok(actor.construction.boom>boom);
});

test('conversation rejects unavailable material, occupied machines, unsupported skills and another visitor’s active operator',()=>{
 const f=fixture();assert.throws(()=>f.send('demonstrate',{jobId:'load'}),/Excavate a real bucket/);assert.throws(()=>f.send('demonstrate',{jobId:'steel'}),/does not perform/);
 f.sim.actors.excavator.holderId='someone';const before=structuredClone(f.worker);assert.throws(()=>f.send('demonstrate',{jobId:'dig'}),/player|operator/i);assert.deepEqual(f.worker,before);delete f.sim.actors.excavator.holderId;
 f.send('demonstrate',{jobId:'dig'});const other={actorId:'other',health:100,lastSeen:f.now,position:{...f.player.position}};f.sim.players.other=other;
 assert.throws(()=>constructionCrewInteraction(f.sim,other,{operation:'stop',workerId:f.worker.id},f.now,f.context),/another visitor/);
 assert.match(f.send('resume').message,/continuing/);assert.equal(f.worker.demonstration.startedAt,1000,'resume does not restart or credit the job');
});
