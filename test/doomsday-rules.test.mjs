import test from 'node:test';
import assert from 'node:assert/strict';
import {DOOMSDAY_TIMING,doomsdayCommand,doomsdayView,stepDoomsday} from '../public/js/doomsday-rules.js';

const environment={id:'test-emergency-map',spawn:{x:12,y:2,z:-4}};
function fixture(){const sim={},player={actorId:'account:responder',health:100,position:{x:100,y:0,z:100},input:{forward:1},vehicleId:'my-plane',score:12};let now=100;return {sim,player,get now(){return now;},tick:(time=now)=>{now=time;return stepDoomsday(sim,environment,now,{players:[player]});},send:command=>doomsdayCommand(sim,player,environment,command,now),view:()=>doomsdayView(sim,environment)};}

test('warning starts on arrival and detonations/fallout happen on the clock without a menu or shelter gate',()=>{
 const f=fixture();assert.equal(f.view().phase,'idle');let state=f.tick();const started=state.startedAt;
 assert.equal(state.phase,'warning');assert.equal(state.automatic,true);assert.equal(state.currentObjectiveId,'shelter');
 assert.equal(state.phaseEndsAt,started+DOOMSDAY_TIMING.warningMs);
 state=f.tick(started+DOOMSDAY_TIMING.warningMs-1);assert.equal(state.phase,'warning');
 state=f.tick(started+DOOMSDAY_TIMING.warningMs);assert.equal(state.phase,'detonation');assert.equal(state.phaseElapsedMs,0);
 assert.equal(state.objectives[0].completed,false,'missing shelter never prevents the animation');
 state=f.tick(started+DOOMSDAY_TIMING.warningMs+DOOMSDAY_TIMING.detonationMs);assert.equal(state.phase,'fallout');assert.equal(state.currentObjectiveId,'supplies');
 assert.equal(f.player.vehicleId,'my-plane');assert.deepEqual(f.player.input,{forward:1});assert.equal(f.player.score,12);
 for(const operation of ['start','advance','stop'])assert.throws(()=>f.send({operation}),/automatically/);
});

test('walking to objective positions completes quests and recovery automatically, even without guide interaction',()=>{
 const f=fixture();let state=f.tick(),start=state.startedAt;
 f.player.position={...state.objectives[0].position};state=f.tick(start+100);assert.equal(state.objectives[0].completed,true);assert.equal(state.phase,'warning');
 f.player.position={x:100,y:0,z:100};state=f.tick(start+DOOMSDAY_TIMING.warningMs+DOOMSDAY_TIMING.detonationMs);assert.equal(state.phase,'fallout');
 f.player.position={...state.objectives[1].position};state=f.tick(f.now+DOOMSDAY_TIMING.falloutSettleMs+1);assert.equal(state.phase,'recovery');assert.equal(state.currentObjectiveId,'recovery');
 f.player.position={...state.objectives[2].position};state=f.tick(f.now+1);assert.equal(state.phase,'all-clear');assert.equal(state.active,false);assert.equal(state.completedCount,3);
 const revision=state.revision;state=f.tick(f.now+1000000);assert.equal(state.phase,'all-clear');assert.equal(state.revision,revision,'completion never loops/restarts without a new map visit');
 assert.equal(f.player.score,12);
});

test('empty rooms, stale connections, dead players and AI cannot initiate or complete a response',()=>{
 const sim={};for(const players of [[],[{health:0,position:{x:0,y:0,z:0}}],[{health:100,basketballAI:true,position:{x:0,y:0,z:0}}],[{health:100,lastSeen:0,position:{x:0,y:0,z:0}}]])assert.equal(stepDoomsday(sim,environment,20000,{players}).phase,'idle');
 const f=fixture();let state=f.tick();f.player.position={...state.objectives[0].position};f.player.health=0;state=f.tick(f.now+1);assert.equal(state.completedCount,0);
 f.player.health=100;f.player.position.y+=4;state=f.tick(f.now+1);assert.equal(state.completedCount,0,'a marker on another floor cannot complete');
});

test('lag catch-up lands on the shared fallout timeline, and late arrivals cannot restart it',()=>{
 const f=fixture();const started=f.tick();const state=f.tick(started.startedAt+60000);assert.equal(state.phase,'fallout');assert.equal(state.phaseStartedAt,started.falloutAt);assert.equal(state.detonationAt,started.detonationAt);
 const again=f.tick(f.now+1);assert.equal(again.id,state.id);assert.equal(again.revision,state.revision);
});

test('check-in commands retain server proximity, phase and health validation',()=>{
 const f=fixture();const state=f.tick(),objective=state.objectives[0];
 assert.throws(()=>f.send({operation:'objective',objectiveId:'missing'}),/unavailable/);
 assert.throws(()=>f.send({operation:'objective',objectiveId:'supplies'}),/current response/);
 assert.throws(()=>f.send({operation:'objective',objectiveId:objective.id}),/4.5 metres/);
 f.player.position={...objective.position};f.player.health=0;assert.throws(()=>f.send({operation:'objective',objectiveId:objective.id}),/Respawn/);
 f.player.health=100;const checked=f.send({operation:'objective',objectiveId:objective.id}).doomsday,again=f.send({operation:'objective',objectiveId:objective.id}).doomsday;
 assert.equal(checked.revision,again.revision);assert.equal(again.objectives[0].completedBy,f.player.actorId);
});

test('public snapshots are detached and manual saved sessions migrate to automatic standby',()=>{
 const f=fixture(),state=f.tick();state.objectives[0].completed=true;assert.equal(f.view().completedCount,0);
 const sim={doomsday:{phase:'fallout',id:'legacy-manual',objectives:[]}};assert.equal(doomsdayView(sim,environment).phase,'idle');assert.equal(stepDoomsday(sim,environment,10,{players:[f.player]}).automatic,true);
});

test('authored checkpoints resolve to their actual floors only once when the room event starts',()=>{
 const sim={},player={id:'a',health:100,position:{x:100,y:8,z:100}};let calls=0;const options={players:[player],resolvePoint:point=>{calls++;return {...point,y:8};}};
 let state=stepDoomsday(sim,environment,123,options);assert.equal(calls,3);assert.ok(state.objectives.every(objective=>objective.position.y===8));
 stepDoomsday(sim,environment,124,options);assert.equal(calls,3);assert.equal(doomsdayView({}, {id:'different'}).phase,'idle');
});


test('fallout is visible before a nearby supply cache can automatically advance recovery',()=>{
 const f=fixture();let state=f.tick();f.player.position={...state.objectives[1].position};
 state=f.tick(state.falloutAt);assert.equal(state.phase,'fallout');assert.equal(state.objectives[1].completed,false);
 state=f.tick(state.suppliesReadyAt-1);assert.equal(state.phase,'fallout');
 state=f.tick(state.suppliesReadyAt);assert.equal(state.phase,'recovery');
});


test('finished rooms restart only after the last human leaves or expires, never while occupied',()=>{
 const f=fixture();let state=f.tick();f.player.position={...state.objectives[1].position};state=f.tick(state.falloutAt+DOOMSDAY_TIMING.falloutSettleMs);
 f.player.position={...state.objectives[2].position};state=f.tick(f.now+1);assert.equal(state.phase,'all-clear');const previousId=state.id;
 f.player.health=0;state=f.tick(f.now+1);assert.equal(state.phase,'all-clear','a defeated connected visitor is still an occupant');
 f.player.health=100;const visitor={id:'visitor',health:100,position:{x:100,y:0,z:100}};
 state=stepDoomsday(f.sim,environment,f.now+1,{players:[f.player,visitor]});assert.equal(state.phase,'all-clear','new arrivals do not interrupt existing occupants');
 state=stepDoomsday(f.sim,environment,f.now+2,{players:[]});assert.equal(state.phase,'all-clear','empty prefetch never starts the warning');
 assert.equal(state.awaitingArrival,true);state=stepDoomsday(f.sim,environment,f.now+3,{players:[visitor]});assert.equal(state.phase,'warning');assert.notEqual(state.id,previousId);
 assert.equal(state.completedCount,0);
});
