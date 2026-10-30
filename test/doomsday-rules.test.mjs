import test from 'node:test';
import assert from 'node:assert/strict';
import {DOOMSDAY_TIMING as T,doomsdayCommand,doomsdayView,stepDoomsday} from '../public/js/doomsday-rules.js';

const environment={id:'test-emergency-map',spawn:{x:12,y:2,z:-4}};
function fixture({random=()=>0}={}){
 const sim={},player={actorId:'account:responder',health:100,position:{x:100,y:0,z:100},input:{forward:1},vehicleId:'my-plane',score:12};let now=100;
 const f={sim,player,get now(){return now;},tick:(time=now,extra={})=>{now=time;return stepDoomsday(sim,environment,now,{players:[player],random,...extra});},send:command=>doomsdayCommand(sim,player,environment,command,now,{random}),view:()=>doomsdayView(sim,environment)};
 f.begin=()=>{const armed=f.tick();return f.tick(armed.nextEventAt);};
 f.finish=()=>{let state=f.view();f.player.position={...state.objectives.find(o=>o.id==='supplies').position};state=f.tick(Math.max(f.now,state.suppliesReadyAt));f.player.position={...state.objectives.find(o=>o.id==='recovery').position};state=f.tick(f.now+1);return f.tick(state.clearAt);};
 return f;
}

test('the first warning is sampled once within 15–90 seconds and fallout occurs within the first two minutes',()=>{
 for(const sample of [0,.5,1]){
  let samples=0;const f=fixture({random:()=>{samples++;return sample;}}),armed=f.tick(),due=armed.nextEventAt;
  assert.equal(armed.phase,'idle');assert.equal(armed.active,false);assert.equal(armed.startedAt,null);
  assert.ok(due-f.now>=T.initialMinMs&&due-f.now<=T.initialMaxMs);assert.equal(samples,1);
  for(let i=1;i<20;i++){const waiting=f.tick(100+i*100);assert.equal(waiting.nextEventAt,due);assert.equal(waiting.phase,'idle');}
  assert.equal(samples,1,'frame updates never resample the timer');
  assert.equal(f.tick(due-1).phase,'idle');const started=f.tick(due);
  assert.equal(started.phase,'warning');assert.equal(started.startedAt,due);assert.equal(started.cycle,1);assert.equal(samples,1,'no repeat is sampled before the challenge finishes');
  assert.equal(started.nextEventAt,null);assert.ok(started.falloutAt-100<=120000);
  assert.equal(f.tick(started.detonationAt).phase,'detonation');assert.equal(f.tick(started.falloutAt).phase,'fallout');
 }
});

test('recurrences use stable independent 3–20 minute quiet breaks after all-clear and reset each run',()=>{
 const values=[0,1,0],f=fixture({random:()=>values.shift()??.5});let state=f.begin(),first=state.startedAt;
 assert.equal(state.nextEventAt,null);f.player.position={...state.objectives[0].position};state=f.tick(first+1);assert.equal(state.completedCount,1);
 state=f.finish();const clearAt=state.clearAt,next=state.nextEventAt;assert.equal(state.phase,'all-clear');assert.equal(next-clearAt,T.repeatMaxMs);
 f.player.position={x:100,y:0,z:100};
 for(const time of [clearAt+100000,next-1]){state=f.tick(time);assert.equal(state.phase,'all-clear');assert.equal(state.nextEventAt,next);}
 state=f.tick(next);assert.equal(state.phase,'warning');assert.equal(state.cycle,2);assert.equal(state.startedAt,next);assert.equal(state.nextEventAt,null);assert.equal(state.completedCount,0);
 state=f.finish();assert.equal(state.nextEventAt-state.clearAt,T.repeatMinMs);assert.notEqual(state.id,environment.id+':'+first+':1');
});

test('fallout and recovery keep the original quest-led length without timeouts or overlapping repeats',()=>{
 const f=fixture();let state=f.begin();const firstId=state.id;
 state=f.tick(state.falloutAt);assert.equal(state.phase,'fallout');assert.equal(state.phaseEndsAt,null);
 state=f.tick(f.now+40*60*1000);assert.equal(state.phase,'fallout');assert.equal(state.id,firstId);assert.equal(state.nextEventAt,null);assert.equal(state.recoveryAt,null);assert.equal(state.clearAt,null);
 f.player.position={...state.objectives.find(o=>o.id==='supplies').position};state=f.tick(f.now+1);assert.equal(state.phase,'recovery');assert.equal(state.recoveryAt,f.now);assert.equal(state.phaseEndsAt,null);
 f.player.position={x:100,y:0,z:100};state=f.tick(f.now+50*60*1000);assert.equal(state.phase,'recovery');assert.equal(state.cycle,1);assert.equal(state.nextEventAt,null);assert.equal(state.clearAt,null);
 assert.equal(f.player.vehicleId,'my-plane');assert.deepEqual(f.player.input,{forward:1});assert.equal(f.player.score,12);
 f.player.position={...state.objectives.find(o=>o.id==='recovery').position};state=f.tick(f.now+1);assert.equal(state.phase,'clearing');assert.equal(state.phaseEndsAt,f.now+T.clearingMs);assert.equal(state.nextEventAt,null);
 state=f.tick(state.clearAt);assert.equal(state.phase,'all-clear');assert.equal(state.nextEventAt,f.now+T.repeatMinMs,'a long challenge still receives a full quiet break');
});

test('proximity quests respect the initial fallout settle time and preserve the clearing animation',()=>{
 const f=fixture();let state=f.begin();f.player.position={...state.objectives[0].position};state=f.tick(f.now+1);assert.equal(state.objectives[0].completed,true);
 f.player.position={...state.objectives[1].position};state=f.tick(state.falloutAt);assert.equal(state.phase,'fallout');assert.equal(state.objectives[1].completed,false);
 state=f.tick(state.suppliesReadyAt-1);assert.equal(state.phase,'fallout');state=f.tick(state.suppliesReadyAt);assert.equal(state.phase,'recovery');
 f.player.position={...state.objectives[2].position};state=f.tick(f.now+1);assert.equal(state.phase,'clearing');assert.equal(state.completedCount,3);assert.equal(state.nextEventAt,null);assert.equal(state.phaseEndsAt,f.now+T.clearingMs);
 state=f.tick(state.clearAt-1);assert.equal(state.phase,'clearing');state=f.tick(state.clearAt);assert.equal(state.phase,'all-clear');assert.equal(state.nextEventAt,f.now+T.repeatMinMs);
});

test('empty prefetches and ineligible occupants never arm the first warning or complete objectives',()=>{
 for(const players of [[],[{health:0,position:{x:0,y:0,z:0}}],[{health:100,basketballAI:true,position:{x:0,y:0,z:0}}],[{health:100,lastSeen:0,position:{x:0,y:0,z:0}}]]){
  const state=stepDoomsday({},environment,20000,{players});assert.equal(state.phase,'idle');assert.equal(state.nextEventAt,null);
 }
 const f=fixture();let state=f.begin();f.player.position={...state.objectives[0].position};f.player.health=0;state=f.tick(f.now+1);assert.equal(state.completedCount,0);
 f.player.health=100;f.player.position.y+=4;state=f.tick(f.now+1);assert.equal(state.completedCount,0,'another floor cannot complete an objective');
});

test('inactive empty rooms rearm for fresh arrivals while occupied reconnects preserve the sampled break',()=>{
 const f=fixture();let state=f.tick(),original=state.nextEventAt;
 state=f.tick(f.now+100,{players:[f.player,{id:'visitor',health:100,position:{x:100,y:0,z:100}}]});assert.equal(state.nextEventAt,original);
 state=f.tick(f.now+100,{players:[]});assert.equal(state.nextEventAt,null);assert.equal(state.awaitingArrival,true);
 state=f.tick(f.now+10000);assert.equal(state.nextEventAt,f.now+T.initialMinMs);assert.notEqual(state.nextEventAt,original);
 f.tick(state.nextEventAt);state=f.finish();const next=state.nextEventAt;f.player.health=0;state=f.tick(f.now+100);assert.equal(state.nextEventAt,next,'defeated connected players still occupy a room');
 f.player.health=100;state=f.tick(f.now+1,{players:[]});assert.equal(state.nextEventAt,null);state=f.tick(f.now+1);assert.equal(state.nextEventAt,f.now+T.initialMinMs);assert.equal(state.phase,'all-clear');
});

test('late snapshots cannot auto-finish quests or emit a burst of missed repetitions',()=>{
 const f=fixture();const started=f.begin();let state=f.tick(started.falloutAt+1000000);assert.equal(state.phase,'fallout');assert.equal(state.cycle,1);
 state=f.finish();const next=state.nextEventAt;f.player.position={x:100,y:0,z:100};state=f.tick(next+1000000);assert.equal(state.phase,'warning');assert.equal(state.cycle,2);assert.equal(state.startedAt,f.now);assert.equal(state.phaseElapsedMs,0);
 const repeated=f.tick(f.now+1);assert.equal(repeated.id,state.id);assert.equal(repeated.nextEventAt,null);
});

test('manual progression remains unavailable and explicit check-ins preserve proximity, phase and health validation',()=>{
 const f=fixture();let state=f.begin();const objective=state.objectives[0];
 for(const operation of ['start','advance','stop'])assert.throws(()=>f.send({operation}),/automatically/);
 assert.throws(()=>f.send({operation:'objective',objectiveId:'missing'}),/unavailable/);assert.throws(()=>f.send({operation:'objective',objectiveId:'supplies'}),/current response/);
 assert.throws(()=>f.send({operation:'objective',objectiveId:objective.id}),/4.5 metres/);f.player.position={...objective.position};f.player.health=0;assert.throws(()=>f.send({operation:'objective',objectiveId:objective.id}),/Respawn/);
 f.player.health=100;const checked=f.send({operation:'objective',objectiveId:objective.id}).doomsday,again=f.send({operation:'objective',objectiveId:objective.id}).doomsday;
 assert.equal(checked.revision,again.revision);assert.equal(again.objectives[0].completedBy,f.player.actorId);
});

test('version3 active sessions preserve their quests and discard timer-only phase progression',()=>{
 const f=fixture();let state=f.begin();state=f.tick(state.falloutAt);f.sim.doomsday.version=3;f.sim.doomsday.recoveryAt=f.now+40000;f.sim.doomsday.clearingAt=f.now+60000;f.sim.doomsday.clearAt=f.now+68000;f.sim.doomsday.nextEventAt=f.now+180000;
 const migrated=f.view();assert.equal(migrated.version,4);assert.equal(migrated.id,state.id);assert.equal(migrated.phase,'fallout');assert.equal(migrated.nextEventAt,null);assert.equal(migrated.clearAt,null);assert.deepEqual(migrated.objectives,state.objectives);
 f.sim.doomsday.version=3;f.sim.doomsday.phase='clearing';f.sim.doomsday.phaseStartedAt=f.now+60000;assert.equal(f.view().phase,'fallout','unfinished supplies cannot be cleared by the old timer');
 f.sim.doomsday.version=3;f.sim.doomsday.phase='clearing';f.sim.doomsday.objectives.find(o=>o.id==='supplies').completed=true;f.sim.doomsday.objectives.find(o=>o.id==='supplies').completedAt=f.now+1;
 const recovery=f.view();assert.equal(recovery.phase,'recovery');assert.equal(recovery.clearAt,null);
});

test('completed version3 schedules keep their sampled delay but move it after actual all-clear',()=>{
 const f=fixture();f.begin();const finished=f.finish(),sampled=700000;
 f.sim.doomsday.version=3;f.sim.doomsday.nextEventAt=finished.startedAt+sampled;
 const migrated=f.view();assert.equal(migrated.phase,'all-clear');assert.equal(migrated.nextEventAt,finished.clearAt+sampled);
 const sim={doomsday:{version:2,phase:'fallout',id:'legacy',objectives:[]}};assert.equal(doomsdayView(sim,environment).phase,'idle');assert.equal(sim.doomsday.version,4);
 migrated.objectives[0].completed=true;migrated.nextEventAt=0;assert.notEqual(f.view().nextEventAt,0);
});

test('authored checkpoint floors resolve once per actual event, never during idle scheduling or ordinary frames',()=>{
 const f=fixture();let calls=0;const options={resolvePoint:point=>{calls++;return {...point,y:8};}};
 let state=f.tick(100,options);assert.equal(calls,0);state=f.tick(state.nextEventAt,options);assert.equal(calls,3);assert.ok(state.objectives.every(o=>o.position.y===8));
 f.tick(f.now+1,options);assert.equal(calls,3);state=f.finish();f.tick(state.nextEventAt,options);assert.equal(calls,6);
});
