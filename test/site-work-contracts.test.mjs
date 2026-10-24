import test from 'node:test';
import assert from 'node:assert/strict';
import {siteWorkOffers} from '../public/js/site-work-contracts.js';
import {prepareSiteWorkQuest,stepSiteWorkQuest} from '../server-site-work-contracts.mjs';
import {fitnessWorld} from '../fitness-world.mjs';
import {casinoWorld} from '../casino-world.mjs';
import {fitnessCommand,stepFitness} from '../server-fitness.mjs';
import {FITNESS_STATIONS} from '../public/js/fitness-config.js';
import {casinoTaskCommand,sampleCasinoTaskMovement} from '../server-casino-tasks.mjs';
import {startExpandedQuest,stepExpandedQuests} from '../server-expanded-quests.mjs';

function fixture(type='fitness-set'){
 const world=type==='fitness-set'?fitnessWorld():casinoWorld(),player={actorId:'p',username:'Player',health:100,position:{x:0,y:0,z:0},score:0,lastSeen:100000,grounded:true},sim={players:{p:player},actors:{host:{id:'host',active:true,position:{x:2,y:0,z:2},resident:{casino:true,duty:'host'}}}},q={...siteWorkOffers(world).find(offer=>offer.siteWork===type),worldId:world.id,startedAt:100000};
 return {world,player,sim,q,prepare(){return prepareSiteWorkQuest(sim,player,q,world,100000);},step(now=200000){return stepSiteWorkQuest(sim,player,q,now);}};
}

test('work contracts match their real activity maps and never offer passive construction credit',()=>{
 assert.deepEqual(siteWorkOffers({id:'site',game:'construction'}),[]);
 assert.deepEqual(siteWorkOffers({id:'plain'}),[]);
 assert.equal(siteWorkOffers(fitnessWorld())[0].siteWork,'fitness-set');
 const casino=siteWorkOffers(casinoWorld())[0];assert.equal(casino.siteWork,'casino-favor');assert.match(casino.description,/No wager or purchase/);assert.equal(casino.mode,'foot');
});

test('fitness excludes prior totals, a set started before accept, poor timing and unconfirmed results',()=>{
 const f=fixture();f.player.fitnessProgress={completedSets:20};f.prepare();assert.equal(f.q.work.baseline,20);assert.equal(f.step().completed,false);
 f.player.fitnessProgress.completedSets=21;f.player.fitness={id:'set',environmentId:f.world.id,status:'complete',createdAt:99999,finishedAt:150000,score:1200};assert.equal(f.step().completed,false);
 f.player.fitness.createdAt=100001;f.player.fitness.status='active';assert.equal(f.step().completed,false);
 f.player.fitness.status='complete';f.player.fitness.score=479;assert.equal(f.step().completed,false);
 f.player.fitness.score=480;f.player.fitness.environmentId='another-gym';assert.equal(f.step().completed,false);
 f.player.fitness.environmentId=f.world.id;f.player.fitness.finishedAt=200001;assert.equal(f.step().completed,false);
 f.player.fitness.finishedAt=150000;assert.equal(f.step().completed,true);
 f.q.worldId='another-map';assert.equal(f.step().completed,false);
});

test('an actual new authoritative timed workout completes the contract after confirmed cues',()=>{
 const f=fixture(),station=FITNESS_STATIONS.find(value=>value.kind==='bench-press');f.player.position={...station.position};f.prepare();
 fitnessCommand(f.sim,f.player,f.world,{action:'fitness-start',stationId:station.id},100001,{integer:()=>0});const round=f.player.fitness;
 assert.equal(f.step(round.startedAt).completed,false);
 for(const [cueIndex,cue]of round.cues.entries()){f.player.lastSeen=cue.at;fitnessCommand(f.sim,f.player,f.world,{action:'fitness-input',roundId:round.id,cueIndex,input:cue.input},cue.at);}
 assert.equal(f.step(round.endsAt-1).completed,false);f.player.lastSeen=round.endsAt;stepFitness(f.sim,f.world,round.endsAt);
 assert.equal(f.player.fitness.status,'complete');assert.equal(f.player.fitness.score,1200);assert.equal(f.player.fitnessProgress.completedSets,1);
 const result=f.step(round.endsAt);assert.equal(result.progress,1);assert.equal(result.goal,1);assert.equal(result.completed,true);assert.match(result.message,/1200/);
 // Reading a completed contract never grants score or any wallet reward.
 const score=f.player.score;f.step(round.endsAt+1);assert.equal(f.player.score,score);
});

test('casino counts only a new fully completed staff favor and follows its actual live checkpoint',()=>{
 const f=fixture('casino-favor');f.player.casinoProgress={completedTasks:8};f.prepare();assert.equal(f.q.work.baseline,8);assert.equal(f.step().completed,false);
 f.player.casinoProgress.completedTasks=9;f.player.casinoTask={status:'completed',startedAt:99999,completedAt:120000};assert.equal(f.step().completed,false);
 f.player.casinoTask={status:'active',startedAt:100001,index:0,title:'Service round',checkpoints:[{name:'Speak with guest',actorId:'guest'}]};f.sim.actors.guest={position:{x:25,y:.02,z:-12}};
 const active=f.step();assert.equal(active.completed,false);assert.equal(f.q.checkpoints[0].x,25);assert.match(active.message,/Speak with guest/);
 f.sim.actors.guest.position.z=4;f.step();assert.equal(f.q.checkpoints[0].z,4);
 f.player.casinoTask.status='cancelled';assert.equal(f.step().completed,false);
 f.player.casinoTask.status='completed';f.player.casinoTask.completedAt=210000;assert.equal(f.step().completed,false);
 f.player.casinoTask.completedAt=180000;assert.equal(f.step().completed,true);
});

test('a new native casino favor must walk and confirm its real route before the hospitality contract completes',()=>{
 const f=fixture('casino-favor'),host=f.sim.actors.host;host.resident.name='Welcome Host';f.prepare();let now=100001;
 casinoTaskCommand(f.sim,f.player,host,'casino-accept',now);const task=f.player.casinoTask;
 assert.equal(f.step(now).completed,false);
 while(task.status==='active'){
  const point=task.checkpoints[task.index],target=point.actorId?f.sim.actors[point.actorId].position:point;
  while(Math.hypot(f.player.position.x-target.x,f.player.position.z-target.z)>.05){
   const dx=target.x-f.player.position.x,dz=target.z-f.player.position.z,span=Math.hypot(dx,dz),fraction=Math.min(1,.7/span);
   f.player.position.x+=dx*fraction;f.player.position.z+=dz*fraction;now+=200;f.player.lastSeen=now;sampleCasinoTaskMovement(f.sim,f.player,now);
  }
  for(let index=0;index<8;index++){now+=200;f.player.lastSeen=now;sampleCasinoTaskMovement(f.sim,f.player,now);}
  casinoTaskCommand(f.sim,f.player,host,'casino-confirm',now);
 }
 assert.equal(task.status,'completed');assert.equal(f.player.casinoProgress.completedTasks,1);assert.equal(f.step(now).completed,true);assert.equal(f.player.score,0,'the native favor cannot grant contract score itself');
});

test('missing native staff and map-mismatched offers fail before creating a contract',()=>{
 const f=fixture('casino-favor');f.sim.actors={};assert.throws(()=>f.prepare(),/staff are unavailable/);
 const gym=fixture();assert.throws(()=>prepareSiteWorkQuest(gym.sim,gym.player,gym.q,casinoWorld(),100000),/not available/);
});

test('specialist work completes through the common quest engine with one server reward and result',()=>{
 for(const type of ['fitness-set','casino-favor']){
  const f=fixture(type);f.sim.events=[];
  startExpandedQuest(f.sim,f.player,f.world,f.q.id,100000);const q=f.player.vehicleMission;
  f.player.lastSeen=100100;stepExpandedQuests(f.sim,f.world,100100,.1);assert.equal(q.status,'active');assert.equal(q.activityProgress,0);
  if(type==='fitness-set'){f.player.fitnessProgress={completedSets:1};f.player.fitness={id:'fresh-set',status:'complete',environmentId:f.world.id,createdAt:100001,finishedAt:105000,score:480};}
  else{f.player.casinoProgress={completedTasks:1};f.player.casinoTask={id:'fresh-favor',status:'completed',startedAt:100001,completedAt:105000};}
  f.player.lastSeen=105100;stepExpandedQuests(f.sim,f.world,105100,.1);
  assert.equal(q.status,'completed');assert.equal(f.player.score,q.reward);assert.equal(f.sim.questResults.length,1);assert.equal(f.sim.questResults[0].questId,q.id);
  stepExpandedQuests(f.sim,f.world,105200,.1);assert.equal(f.player.score,q.reward);assert.equal(f.sim.questResults.length,1);
 }
});
