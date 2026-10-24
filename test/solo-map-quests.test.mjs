import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloMapQuests} from '../public/js/solo-map-quests.js';

function fixture(){
 let now=10000,position={x:100,y:5,z:200},health=100;
 const resolved=[],runtime=createSoloMapQuests({getPosition:()=>position,getSpawn:()=>({x:100,y:5,z:200}),getHealth:()=>health,resolvePoint:site=>{resolved.push({...site});return {x:site.x,y:site.y,z:site.z};}});
 runtime.reset({id:'imported-gallery',name:'Imported gallery',modelUrl:'gallery.glb',spawn:{x:0,y:0,z:0}});
 const snapshot=()=>runtime.update(now),questId=()=>snapshot().questOffers[0].id;
 return {runtime,resolved,snapshot,questId,get now(){return now;},set position(value){position={...value};},set health(value){health=value;},tick(ms=250){now+=ms;return runtime.update(now);},send(operation,fields={}){return runtime.command('vehicle-mission',{operation,...fields},now);},start(){return this.send('start',{questId:questId()});},hold(){for(let i=0;i<8;i++)this.tick();}};
}
test('solo models only offer local floor practice, anchored to the measured entrance',()=>{
 const f=fixture(),initial=f.snapshot();assert.equal(initial.authoritative,false);assert.equal(initial.players.solo.localQuests,true);
 assert.ok(initial.questOffers.length>=2);assert.ok(initial.questOffers.every(offer=>offer.kind==='site-tour'&&offer.localQuests));
 const started=f.start().players.solo.vehicleMission;
 assert.deepEqual({x:started.checkpoints[0].x,y:started.checkpoints[0].y,z:started.checkpoints[0].z},{x:100,y:5,z:200});
 assert.ok(started.checkpoints.slice(1).every(point=>Math.abs(point.x-100)<=10&&Math.abs(point.z-200)<=10));
 assert.equal(started.checkpoints[0].dwell,2);
 assert.throws(()=>f.send('start',{questId:f.questId()}),/Finish or cancel/);
 assert.throws(()=>f.runtime.command('interact',{entityId:'fake'},f.now),/walking quests only/);
});
test('actual position, bounded dwell and explicit check-ins award practice once',()=>{
 const f=fixture();let mission=f.start().players.solo.vehicleMission;
 assert.throws(()=>f.send('interact'),/Reach the objective/);
 f.tick(30000);assert.equal(f.snapshot().players.solo.vehicleMission.holdSeconds,.25,'A stalled tab cannot skip dwell.');
 for(const [index,point]of mission.checkpoints.entries()){
  f.position=point;
  if(index){f.tick();assert.throws(()=>f.send('interact'),/pause/);}
  f.hold();const state=f.send('interact');mission=state.players.solo.vehicleMission;
 }
 const state=f.snapshot(),self=state.players.solo;
 assert.equal(self.vehicleMission.status,'completed');assert.equal(self.score,250);assert.match(self.vehicleMission.message,/practice score/);
 assert.equal(self.mapQuestProgress.completed[f.questId()].count,1);
 assert.throws(()=>f.send('interact'),/Accept/);f.tick();assert.equal(f.snapshot().players.solo.score,250);
});
test('walking away clears readiness, so a previous objective proof cannot be reused',()=>{
 const f=fixture();f.start();f.hold();assert.equal(f.snapshot().players.solo.vehicleMission.ready,true);
 f.position={x:150,y:5,z:250};assert.throws(()=>f.send('interact'),/pause/);assert.equal(f.snapshot().players.solo.vehicleMission.holdSeconds,0);
});
test('relocation, vehicle entry, defeat and timeout terminate practice without a reward',()=>{
 for(const reason of ['relocate','vehicle','health','timeout']){
  const f=fixture();f.start();
  if(reason==='relocate')f.runtime.relocate('Moved using map travel.',f.now);
  if(reason==='vehicle')f.runtime.update(f.now,{vehicleId:'plane'});
  if(reason==='health'){f.health=0;f.tick();}
  if(reason==='timeout')f.tick(901000);
  const self=f.snapshot().players.solo;assert.notEqual(self.vehicleMission.status,'active',reason);assert.equal(self.score,0);assert.deepEqual(self.mapQuestProgress.completed,{});
 }
});
test('floor resolution removes blocked candidates and refuses an unplayable route',()=>{
 const runtime=createSoloMapQuests({getPosition:()=>({x:0,y:0,z:0}),getSpawn:()=>({x:0,y:0,z:0}),resolvePoint:site=>site.id==='map-arrival'?{x:0,y:0,z:0}:null});
 runtime.reset({id:'tiny-model',name:'Tiny model'});const questId=runtime.update(0).questOffers[0].id;
 assert.throws(()=>runtime.command('vehicle-mission',{operation:'start',questId},0),/no clear walking route/);
 assert.equal(runtime.update(0).players.solo.vehicleMission,null);
});
test('practice results stay in their own map and accept only its generated offers',()=>{
 const f=fixture(),firstId=f.questId();f.start();const route=f.snapshot().players.solo.vehicleMission.checkpoints;
 for(const point of route){f.position=point;f.hold();f.send('interact');}
 const best=f.snapshot().players.solo.mapQuestProgress.completed[firstId].bestMs;
 f.runtime.reset({id:'second-map',name:'Another model'});assert.equal(f.snapshot().players.solo.score,0);assert.deepEqual(f.snapshot().players.solo.mapQuestProgress.completed,{});
 assert.throws(()=>f.send('start',{questId:firstId,reward:9999999}),/not available/);
 f.runtime.reset({id:'imported-gallery',name:'Imported gallery',modelUrl:'gallery.glb',spawn:{x:0,y:0,z:0}});
 assert.equal(f.snapshot().players.solo.score,250);assert.equal(f.snapshot().players.solo.mapQuestProgress.completed[firstId].bestMs,best);
});
test('challenge retains its final required Arrival when a survey resolves near the entrance',()=>{
 const runtime=createSoloMapQuests({getPosition:()=>({x:100,y:5,z:200}),getSpawn:()=>({x:100,y:5,z:200}),resolvePoint:site=>site.survey&&site.id==='floor-survey-0'?{x:100.5,y:5,z:200}:({x:site.x,y:site.y,z:site.z})});
 runtime.reset({id:'imported-return',name:'Return route',modelUrl:'return.glb',spawn:{x:0,y:0,z:0}});
 const offer=runtime.snapshot(10000).questOffers.find(quest=>quest.challenge);
 const route=runtime.command('vehicle-mission',{operation:'start',questId:offer.id},10000).players.solo.vehicleMission.checkpoints;
 assert.equal(route.at(-1).siteId,'map-arrival');assert.equal(route.filter(point=>point.siteId==='floor-survey-0').length,0);assert.ok(route.length>=2);
 assert.deepEqual({x:route.at(-1).x,y:route.at(-1).y,z:route.at(-1).z},{x:100,y:5,z:200});
});
test('pure snapshot reads do not accumulate dwell or modify update time',()=>{
 const f=fixture();f.start();const before=f.runtime.snapshot(f.now).players.solo.vehicleMission;
 for(let i=0;i<20;i++)assert.equal(f.runtime.snapshot(f.now+2000+i*100).players.solo.vehicleMission.holdSeconds,0);
 assert.equal(f.runtime.snapshot(f.now+5000).players.solo.vehicleMission.ready,false);
 assert.equal(before.holdSeconds,0);f.tick();assert.equal(f.runtime.snapshot(f.now).players.solo.vehicleMission.holdSeconds,.25);
});
