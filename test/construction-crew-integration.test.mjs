import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureConstruction,constructionCommand,stepConstruction} from '../server-construction.mjs';
import {ensureConstructionCrew,constructionCrewAction,stepConstructionCrew} from '../server-construction-crew.mjs';
import {earthCargoVolume} from '../public/js/construction-earthworks.js';

function fixture(){
 const machine=(id,modelId,x,z)=>({id,modelId,position:{x,y:0,z},rotation:{x:0,y:0,z:0},active:true,health:100,driving:{speed:0,parked:true}}),actors={excavator:machine('excavator','site-excavator',0,0),truck:machine('truck','site-dumptruck',5,0)},sim={actors,players:{},events:[],sequence:1};
 const environment={id:'crew-integration',construction:{enabled:true,excavation:{x:.7,z:-3.69,width:4,depth:4,radius:2,maxDepth:2},stockpile:{x:20,z:0,width:8,depth:8},crew:{muster:{x:-7,y:0,z:0}}}};
 let now=1000;ensureConstruction(sim,environment);ensureConstructionCrew(sim,environment,now);const crew=sim.construction.crew,worker=crew.workers.find(w=>w.id==='crew-noor'),player={actorId:'manager',health:100,lastSeen:now,vehicleId:null,position:{x:-15,y:0,z:-15},input:{}};sim.players.manager=player;
 for(const member of crew.workers)member.enabled=member===worker;
 const context={environment},action=(operation,fields={})=>constructionCrewAction(sim,player,{operation,...fields},now,context);
 const tick=(count=1)=>{for(let i=0;i<count;i++){now+=100;player.lastSeen=now;stepConstructionCrew(sim,now,.1,context);stepConstruction(sim,now,.1,context);}};
 const until=(condition,budget=500)=>{for(let i=0;i<budget&&!condition();i++)tick();assert.ok(condition(),'physical crew workflow completes: '+JSON.stringify({worker,jobs:crew.jobs.map(j=>({id:j.id,status:j.status,completed:j.completed,message:j.message})),blocked:actors.excavator.construction.blocked}));};
 return {sim,actors,environment,crew,worker,player,action,tick,until,get now(){return now;}};
}
const total=sim=>sim.construction.earthworks.patches.reduce((sum,p)=>sum+p.soil.reduce((a,b)=>a+b,0)+p.gravel.reduce((a,b)=>a+b,0),0)+Object.values(sim.actors).reduce((sum,a)=>sum+earthCargoVolume(a.construction?.cargo),0);

test('a customized named worker walks to the excavator and completes dig and load through real hydraulic cargo transfers',()=>{
 const f=fixture(),initial=total(f.sim),job=id=>f.crew.jobs.find(j=>j.id===id);f.action('customize',{workerId:f.worker.id,name:'Alex Builder',appearance:{hardHat:'blue',vest:'lime',skin:'deep',shirt:'teal'}});assert.equal(f.worker.name,'Alex Builder');assert.equal(f.worker.appearance.hardHat,'blue');
 f.action('start');const start={...f.worker.position};let walkingFrames=0;
 while(!f.worker.machineId&&walkingFrames++<300){const previous={...f.worker.position};f.tick();if(!f.worker.machineId)assert.ok(Math.hypot(f.worker.position.x-previous.x,f.worker.position.z-previous.z)<=.141,'worker approaches at walking speed without teleporting');}
 assert.ok(walkingFrames>1&&f.worker.machineId==='excavator','the named worker physically reaches and boards its machine');assert.ok(Math.hypot(f.worker.position.x-start.x,f.worker.position.z-start.z)>1);assert.equal(f.actors.excavator.holderId,undefined,'AI workers do not impersonate human players');assert.equal(f.actors.excavator.construction.crewOperator.workerId,f.worker.id);
 f.until(()=>job('dig').status==='completed');assert.equal(job('dig').completed,2);assert.equal(f.actors.excavator.construction.load,2,'digging progress corresponds to real bucket cargo');assert.equal(total(f.sim),initial);
 f.until(()=>job('load').status==='completed');assert.equal(job('load').completed,2);assert.equal(f.actors.excavator.construction.load,0);assert.equal(f.actors.truck.construction.load,2,'loading progress corresponds to real material received in the truck');assert.equal(total(f.sim),initial,'the entire AI mechanical workflow conserves earth');
});

test('a human taking over an AI machine retains fresh hydraulic input through subsequent scheduler ticks',()=>{
 const f=fixture();f.action('start');f.until(()=>f.worker.machineId==='excavator'&&f.actors.excavator.construction.workCycle);const actor=f.actors.excavator;
 actor.holderId=f.player.actorId;f.player.vehicleId=actor.id;f.player.position={...actor.position};constructionCommand(f.sim,f.player,{operation:'control',axes:{boom:1}},f.now);assert.equal(actor.construction.crewOperator,undefined,'the human command immediately revokes the trusted AI lease');const before=actor.construction.boom;
 f.tick();assert.equal(f.worker.machineId,null,'the scheduler releases its worker bookkeeping');assert.equal(actor.holderId,f.player.actorId);assert.equal(actor.construction.axes.boom,1,'old worker cleanup cannot neutralize a new human command');assert.ok(actor.construction.boom>before,'the seated human actually moves the mechanism');
 f.tick(10);assert.equal(actor.construction.crewOperator,undefined);assert.equal(f.player.vehicleId,actor.id,'an active crew never steals a held machine');
});

test('pausing crew cancels unfinished work, clears leases and applies a real travel brake without awarding soil',()=>{
 const f=fixture(),initial=total(f.sim);f.action('start');f.until(()=>f.worker.machineId==='excavator'&&f.actors.excavator.construction.workCycle);f.tick(3);f.action('pause');f.tick(50);
 const actor=f.actors.excavator;assert.equal(actor.construction.workCycle,undefined);assert.equal(actor.construction.crewOperator,undefined);assert.deepEqual(actor.construction.axes,{});assert.equal(actor.driving.speed,0);assert.equal(actor.driving.parked,true);assert.equal(actor.construction.load,0);assert.equal(total(f.sim),initial);assert.equal(f.crew.jobs.find(j=>j.id==='dig').completed,0,'job progress requires completed physical work');
});

test('crew assignments reject the wrong machine, an occupied machine and invalid workwear',()=>{
 const f=fixture();assert.throws(()=>f.action('assign',{workerId:f.worker.id,jobId:'dig',machineId:'truck'}),/cannot perform/i);f.actors.excavator.holderId='other-player';assert.throws(()=>f.action('assign',{workerId:f.worker.id,jobId:'dig',machineId:'excavator'}),/player/i);delete f.actors.excavator.holderId;
 const old=structuredClone(f.worker.appearance);assert.throws(()=>f.action('customize',{workerId:f.worker.id,appearance:{hardHat:'invisible'}}),/listed|workwear/i);assert.deepEqual(f.worker.appearance,old);assert.throws(()=>f.action('customize',{workerId:f.worker.id,name:'<script>'}),/plain/i);
});
