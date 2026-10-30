import test from 'node:test';
import assert from 'node:assert/strict';
import {DOOMSDAY_TIMING as T,doomsdayCommand,doomsdayView,stepDoomsday} from '../public/js/doomsday-rules.js';

const environment={id:'test-emergency-map',spawn:{x:12,y:2,z:-4}};
function fixture({random=()=>0}={}){
 const sim={},player={actorId:'account:responder',health:100,position:{x:100,y:0,z:100},input:{forward:1},vehicleId:'my-plane',score:12};let now=100;
 const f={sim,player,get now(){return now;},tick:(time=now,extra={})=>{now=time;return stepDoomsday(sim,environment,now,{players:[player],random,...extra});},send:command=>doomsdayCommand(sim,player,environment,command,now),view:()=>doomsdayView(sim,environment)};
 f.begin=()=>{const armed=f.tick();return f.tick(armed.nextEventAt);};return f;
}

test('the first warning is sampled once within 15–90 seconds and fallout occurs within the first two minutes',()=>{
 for(const sample of [0,.5,1]){
  let samples=0;const f=fixture({random:()=>{samples++;return sample;}}),armed=f.tick(),due=armed.nextEventAt;
  assert.equal(armed.phase,'idle');assert.equal(armed.active,false);assert.equal(armed.startedAt,null);
  assert.ok(due-f.now>=T.initialMinMs&&due-f.now<=T.initialMaxMs);assert.equal(samples,1);
  for(let i=1;i<20;i++){const waiting=f.tick(100+i*100);assert.equal(waiting.nextEventAt,due);assert.equal(waiting.phase,'idle');}
  assert.equal(samples,1,'frame updates never resample the timer');
  assert.equal(f.tick(due-1).phase,'idle');const started=f.tick(due);
  assert.equal(started.phase,'warning');assert.equal(started.startedAt,due);assert.equal(started.cycle,1);assert.equal(samples,2,'only event start samples the following interval');
  assert.ok(started.falloutAt-100<=120000);assert.equal(f.tick(started.detonationAt).phase,'detonation');assert.equal(f.tick(started.falloutAt).phase,'fallout');
 }
});

test('recurrences use stable independent 3–20 minute warning-start intervals and reset each run',()=>{
 const values=[0,1,0],f=fixture({random:()=>values.shift()??.5});let state=f.begin(),first=state.startedAt,next=state.nextEventAt;
 assert.equal(next-first,T.repeatMaxMs);f.player.position={...state.objectives[0].position};state=f.tick(first+1);assert.equal(state.completedCount,1);
 f.player.position={x:100,y:0,z:100};state=f.tick(state.clearAt);assert.equal(state.phase,'all-clear');assert.equal(state.nextEventAt,next);
 for(const time of [first+100000,next-1]){state=f.tick(time);assert.equal(state.phase,'all-clear');assert.equal(state.nextEventAt,next);}
 state=f.tick(next);assert.equal(state.phase,'warning');assert.equal(state.cycle,2);assert.equal(state.startedAt,next);assert.equal(state.nextEventAt-next,T.repeatMinMs);assert.equal(state.completedCount,0);
 assert.notEqual(state.id,environment.id+':'+first+':1');
});

test('ignored quests cannot hold the event open: fallout, recovery and clearing have bounded deadlines',()=>{
 const f=fixture();let state=f.begin();const started=state.startedAt;
 for(const [deadline,before,after] of [[state.detonationAt,'warning','detonation'],[state.falloutAt,'detonation','fallout'],[state.recoveryAt,'fallout','recovery'],[state.clearingAt,'recovery','clearing'],[state.clearAt,'clearing','all-clear']]){
  state=f.tick(deadline-1);assert.equal(state.phase,before);assert.equal(state.phaseEndsAt,deadline);
  state=f.tick(deadline);assert.equal(state.phase,after);
 }
 assert.equal(state.active,false);assert.equal(state.completedCount,0);assert.equal(state.clearAt-started,T.warningMs+T.detonationMs+T.falloutMaxMs+T.recoveryMaxMs+T.clearingMs);
 assert.equal(f.player.vehicleId,'my-plane');assert.deepEqual(f.player.input,{forward:1});assert.equal(f.player.score,12);
 assert.doesNotMatch(state.message,/relay restored|supplies secured/i,'timeout cannot claim that unfinished quests succeeded');
});

test('proximity quests accelerate recovery but preserve the sampled recurrence and the clearing animation',()=>{
 const f=fixture();let state=f.begin(),next=state.nextEventAt;
 f.player.position={...state.objectives[0].position};state=f.tick(f.now+1);assert.equal(state.objectives[0].completed,true);
 f.player.position={...state.objectives[1].position};state=f.tick(state.falloutAt);assert.equal(state.phase,'fallout');assert.equal(state.objectives[1].completed,false);
 state=f.tick(state.suppliesReadyAt-1);assert.equal(state.phase,'fallout');state=f.tick(state.suppliesReadyAt);assert.equal(state.phase,'recovery');
 f.player.position={...state.objectives[2].position};state=f.tick(f.now+1);assert.equal(state.phase,'clearing');assert.equal(state.completedCount,3);assert.equal(state.nextEventAt,next);assert.equal(state.phaseEndsAt,f.now+T.clearingMs);
 state=f.tick(state.clearAt-1);assert.equal(state.phase,'clearing');state=f.tick(state.clearAt);assert.equal(state.phase,'all-clear');assert.equal(state.nextEventAt,next);
});

test('empty prefetches and ineligible occupants never arm the first warning',()=>{
 for(const players of [[],[{health:0,position:{x:0,y:0,z:0}}],[{health:100,basketballAI:true,position:{x:0,y:0,z:0}}],[{health:100,lastSeen:0,position:{x:0,y:0,z:0}}]]){
  const state=stepDoomsday({},environment,20000,{players});assert.equal(state.phase,'idle');assert.equal(state.nextEventAt,null);
 }
 const f=fixture();let state=f.begin();f.player.position={...state.objectives[0].position};f.player.health=0;state=f.tick(f.now+1);assert.equal(state.completedCount,0);
 f.player.health=100;f.player.position.y+=4;state=f.tick(f.now+1);assert.equal(state.completedCount,0,'another floor cannot complete an objective');
});

test('leaving an inactive room rearms for a fresh arrival, while reconnects and other arrivals do not reroll an occupied room',()=>{
 const f=fixture();let state=f.tick(),original=state.nextEventAt;
 state=f.tick(f.now+100,{players:[f.player,{id:'visitor',health:100,position:{x:100,y:0,z:100}}]});assert.equal(state.nextEventAt,original);
 state=f.tick(f.now+100,{players:[]});assert.equal(state.nextEventAt,null);assert.equal(state.awaitingArrival,true);
 state=f.tick(f.now+10000);assert.equal(state.nextEventAt,f.now+T.initialMinMs);assert.notEqual(state.nextEventAt,original);
 state=f.tick(state.nextEventAt);const next=state.nextEventAt;f.player.health=0;state=f.tick(state.clearAt);assert.equal(state.nextEventAt,next,'defeated connected players still occupy a room');
 f.player.health=100;state=f.tick(f.now+1,{players:[]});assert.equal(state.nextEventAt,null);state=f.tick(f.now+1);assert.equal(state.nextEventAt,f.now+T.initialMinMs);assert.equal(state.phase,'all-clear','a fresh visit arms rather than instantly detonates');
});

test('late snapshots catch up to a completed event without emitting a burst of missed repetitions',()=>{
 const f=fixture();const started=f.begin();let state=f.tick(started.clearAt+1000);assert.equal(state.phase,'all-clear');assert.equal(state.cycle,1);
 state=f.tick(started.nextEventAt+1000000);assert.equal(state.phase,'warning');assert.equal(state.cycle,2);assert.equal(state.startedAt,f.now);assert.equal(state.phaseElapsedMs,0);
 const repeated=f.tick(f.now+1);assert.equal(repeated.id,state.id);assert.equal(repeated.nextEventAt,state.nextEventAt);
});

test('manual progression remains unavailable and explicit check-ins preserve proximity, phase and health validation',()=>{
 const f=fixture();let state=f.begin();const objective=state.objectives[0];
 for(const operation of ['start','advance','stop'])assert.throws(()=>f.send({operation}),/automatically/);
 assert.throws(()=>f.send({operation:'objective',objectiveId:'missing'}),/unavailable/);assert.throws(()=>f.send({operation:'objective',objectiveId:'supplies'}),/current response/);
 assert.throws(()=>f.send({operation:'objective',objectiveId:objective.id}),/4.5 metres/);f.player.position={...objective.position};f.player.health=0;assert.throws(()=>f.send({operation:'objective',objectiveId:objective.id}),/Respawn/);
 f.player.health=100;const checked=f.send({operation:'objective',objectiveId:objective.id}).doomsday,again=f.send({operation:'objective',objectiveId:objective.id}).doomsday;
 assert.equal(checked.revision,again.revision);assert.equal(again.objectives[0].completedBy,f.player.actorId);
});

test('saved old sessions migrate to scheduled standby and public snapshots cannot modify state',()=>{
 const sim={doomsday:{version:2,phase:'fallout',id:'legacy',objectives:[]}};let state=doomsdayView(sim,environment);assert.equal(state.phase,'idle');assert.equal(state.version,3);assert.equal(state.nextEventAt,null);
 const f=fixture();state=f.begin();state.objectives[0].completed=true;state.nextEventAt=0;assert.equal(f.view().completedCount,0);assert.notEqual(f.view().nextEventAt,0);
});

test('authored checkpoint floors resolve once per actual event, never during idle scheduling or ordinary frames',()=>{
 const f=fixture();let calls=0;const options={resolvePoint:point=>{calls++;return {...point,y:8};}};
 let state=f.tick(100,options);assert.equal(calls,0);state=f.tick(state.nextEventAt,options);assert.equal(calls,3);assert.ok(state.objectives.every(o=>o.position.y===8));
 f.tick(f.now+1,options);assert.equal(calls,3);f.tick(state.clearAt,options);f.tick(state.nextEventAt,options);assert.equal(calls,6);
});
