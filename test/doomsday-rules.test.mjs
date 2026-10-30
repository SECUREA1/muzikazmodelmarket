import test from 'node:test';
import assert from 'node:assert/strict';
import {doomsdayCommand,doomsdayView} from '../public/js/doomsday-rules.js';

const environment={id:'test-emergency-map',spawn:{x:12,y:2,z:-4}};
function fixture(){const sim={},player={actorId:'account:responder',health:100,position:{x:0,y:0,z:0},input:{forward:1},vehicleId:'my-plane',score:12};let time=100;return {sim,player,send:command=>doomsdayCommand(sim,player,environment,command,time++),view:()=>doomsdayView(sim,environment)};}

test('response objectives drive warning, fallout, recovery and all-clear without controlling movement',()=>{
 const f=fixture(),initial=f.view();assert.equal(initial.phase,'idle');assert.equal(initial.objectives.length,3);
 assert.throws(()=>f.send({operation:'advance'}),/Complete this phase/);
 const started=f.send({operation:'start'}).doomsday;assert.equal(started.phase,'warning');assert.equal(started.active,true);
 assert.throws(()=>f.send({operation:'start'}),/already active/);
 for(const phase of ['warning','fallout','recovery']){
  const state=f.view(),objective=state.objectives.find(item=>item.phase===phase);
  assert.equal(state.phase,phase);assert.equal(state.canAdvance,false);
  assert.throws(()=>f.send({operation:'advance'}),/Complete this phase/);
  f.player.position={...objective.position};f.send({operation:'objective',objectiveId:objective.id});
  assert.equal(f.view().canAdvance,true);f.send({operation:'advance'});
 }
 assert.equal(f.view().phase,'all-clear');assert.equal(f.view().active,false);assert.equal(f.view().completedCount,3);
 assert.equal(f.player.vehicleId,'my-plane');assert.deepEqual(f.player.input,{forward:1});assert.equal(f.player.score,12);
 const replay=f.send({operation:'start'}).doomsday;assert.notEqual(replay.id,started.id);assert.equal(replay.completedCount,0);
});

test('check-ins require the right phase, physical proximity and a living player; repeated clicks are idempotent',()=>{
 const f=fixture();f.send({operation:'start'});const state=f.view(),objective=state.objectives[0],later=state.objectives[1];
 assert.throws(()=>f.send({operation:'objective',objectiveId:later.id}),/current response phase/);
 assert.throws(()=>f.send({operation:'objective',objectiveId:'missing'}),/unavailable/);
 f.player.position={...objective.position,x:objective.position.x+5};assert.throws(()=>f.send({operation:'objective',objectiveId:objective.id}),/4.5 metres/);
 f.player.position={...objective.position,y:objective.position.y+4};assert.throws(()=>f.send({operation:'objective',objectiveId:objective.id}),/4.5 metres/);
 f.player.position={...objective.position};f.player.health=0;assert.throws(()=>f.send({operation:'objective',objectiveId:objective.id}),/Respawn/);
 f.player.health=100;const checked=f.send({operation:'objective',objectiveId:objective.id}).doomsday,again=f.send({operation:'objective',objectiveId:objective.id}).doomsday;
 assert.equal(again.revision,checked.revision);assert.equal(again.completedCount,1);assert.equal(again.objectives[0].completedBy,f.player.actorId);
});

test('public views cannot mutate shared state and abort works from any phase',()=>{
 const f=fixture();f.send({operation:'start'});const publicView=f.view();publicView.objectives[0].completed=true;assert.equal(f.view().completedCount,0);
 const input=f.player.input;f.send({operation:'stop'});assert.equal(f.view().phase,'idle');assert.equal(f.view().active,false);assert.equal(f.player.input,input);
 assert.throws(()=>f.send({operation:'warp'}),/Unknown doomsday/);
});

test('server and solo can resolve authored checkpoints onto actual walkable floors',()=>{
 const sim={},player={actorId:'a',health:100,position:{x:1,y:8,z:2}};let calls=0;
 const state=doomsdayCommand(sim,player,environment,{operation:'start'},123,{resolvePoint:point=>{calls++;return {...point,y:8};}}).doomsday;
 assert.equal(calls,3);assert.ok(state.objectives.every(objective=>objective.position.y===8));
 assert.equal(doomsdayView({}, {id:'different',spawn:{x:0,y:0,z:0}}).phase,'idle');
});
