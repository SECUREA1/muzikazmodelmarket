import test from 'node:test';
import assert from 'node:assert/strict';
import {stepForestSnake,forestSnakeTalk} from '../server-forest-snake.mjs';
import {FOREST_SNAKE_ID,FOREST_SNAKE_MODEL_ID,FOREST_SNAKE_ROUTE,FOREST_SNAKE_SPEED,FOREST_SNAKE_LOOP_MS,FOREST_SNAKE_REMARKS,FOREST_SNAKE_SPEECH_MS,FOREST_SNAKE_REMARK_INTERVAL_MS,forestSnakePose} from '../public/js/forest-snake-config.js';

const environment={id:'forest-harvest',game:'forest-harvest'};
const start=()=>({x:FOREST_SNAKE_ROUTE[0].x,y:.02,z:FOREST_SNAKE_ROUTE[0].z});
function fixture(){
 const now=1_000_000,player={actorId:'player',position:{...start(),z:start().z+9},health:100,grounded:true,lastSeen:now};
 const actor={id:FOREST_SNAKE_ID,modelId:FOREST_SNAKE_MODEL_ID,position:start(),rotation:{x:0,y:0,z:0},active:true};
 const sim={forestHarvest:{instanceId:'test-forest'},actors:{[actor.id]:actor},players:{player}};
 return {now,sim,player,actor};
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

test('the shared patrol follows a smooth closed path at a bounded walking speed',()=>{
 const origin={x:20,y:.02,z:-13},epoch=1_000_000;
 const initial=forestSnakePose(epoch,epoch,origin),lap=forestSnakePose(epoch+FOREST_SNAKE_LOOP_MS,epoch,origin);
 assert.ok(distance(initial.position,lap.position)<1e-8,'closed loop has no seam teleport');
 for(let elapsed=0;elapsed<FOREST_SNAKE_LOOP_MS;elapsed+=750){
  const before=forestSnakePose(epoch+elapsed,epoch,origin),after=forestSnakePose(epoch+elapsed+100,epoch,origin);
  assert.ok(distance(before.position,after.position)<=FOREST_SNAKE_SPEED*.1001);
  assert.ok(Object.values(after.position).every(Number.isFinite));assert.ok(Object.values(after.rotation).every(Number.isFinite));
  const turn=Math.atan2(Math.sin(after.rotation.y-before.rotation.y),Math.cos(after.rotation.y-before.rotation.y));assert.ok(Math.abs(turn)<.25,'turns continuously');
 }
 assert.deepEqual(forestSnakePose(epoch-500,epoch,origin).position,initial.position,'clock rollback does not run backwards');
});

test('only an existing authored forest snake is moved and saved room timing survives reload',()=>{
 const f=fixture(),before=structuredClone(f.sim);
 assert.equal(stepForestSnake(f.sim,{id:'public-commons'},f.now),null);assert.deepEqual(f.sim,before);
 delete f.sim.actors[FOREST_SNAKE_ID];assert.equal(stepForestSnake(f.sim,environment,f.now),null);assert.equal(f.sim.forestHarvest.snake,undefined);
 f.sim.actors[FOREST_SNAKE_ID]=f.actor;stepForestSnake(f.sim,environment,f.now);
 const saved=structuredClone(f.sim);stepForestSnake(f.sim,environment,f.now+50_000);stepForestSnake(saved,environment,f.now+50_000);
 assert.deepEqual(saved.forestHarvest.snake,f.sim.forestHarvest.snake);assert.deepEqual(saved.actors[FOREST_SNAKE_ID].position,f.actor.position);
 assert.equal(f.actor.destructible,false);assert.equal(f.actor.forestSnakeManaged,true);
 const state=f.sim.forestHarvest.snake;assert.ok(Number.isFinite(state.headPosition.x));assert.equal(state.headPosition.y,.87);
});

test('passing remarks wait for a nearby live player and cannot overlap or repeat on network ticks',()=>{
 const f=fixture();stepForestSnake(f.sim,environment,f.now);assert.equal(f.sim.forestHarvest.snake.speech,null);
 stepForestSnake(f.sim,environment,f.now+2999);assert.equal(f.sim.forestHarvest.snake.speech,null);
 f.player.lastSeen=f.now+3000;let state=stepForestSnake(f.sim,environment,f.now+3000);assert.equal(state.speech.text,FOREST_SNAKE_REMARKS[0]);
 const first=structuredClone(state.speech);stepForestSnake(f.sim,environment,f.now+3100);assert.deepEqual(state.speech,first);assert.equal(state.utteranceSequence,1);
 f.player.position={...forestSnakePose(f.now+3000+FOREST_SNAKE_SPEECH_MS,f.now,state.origin).position};f.player.lastSeen=f.now+3000+FOREST_SNAKE_SPEECH_MS;state=stepForestSnake(f.sim,environment,f.player.lastSeen);assert.equal(state.speech,null,'expired subtitle clears');
 // Follow the patrol to prove proximity, rather than merely a running timer, opens its next remark.
 f.player.position={...forestSnakePose(f.now+3000+FOREST_SNAKE_REMARK_INTERVAL_MS,f.now,state.origin).position};f.player.lastSeen=f.now+3000+FOREST_SNAKE_REMARK_INTERVAL_MS;
 state=stepForestSnake(f.sim,environment,f.player.lastSeen);assert.equal(state.speech.text,FOREST_SNAKE_REMARKS[1]);assert.notEqual(state.speech.id,first.id);
 f.player.position={x:1000,y:0,z:1000};f.player.lastSeen+=30_000;state=stepForestSnake(f.sim,environment,f.player.lastSeen);assert.equal(state.speech,null);assert.equal(state.utteranceSequence,2);
});

test('dead, absent, AI and travelling players do not trigger automatic snake chatter',()=>{
 for(const patch of [{health:0},{lastSeen:0},{isAI:true},{replacedByRoom:'other'}]){
  const f=fixture();Object.assign(f.player,patch);stepForestSnake(f.sim,environment,f.now);stepForestSnake(f.sim,environment,f.now+3500);assert.equal(f.sim.forestHarvest.snake.speech,null);
 }
});

test('direct conversation validates real proximity including the head and shares the active utterance',()=>{
 const f=fixture();let state=stepForestSnake(f.sim,environment,f.now);
 f.player.position={...state.headPosition,x:state.headPosition.x-Math.sin(state.rotation.y)*6,z:state.headPosition.z-Math.cos(state.rotation.y)*6};
 assert.ok(distance(f.player.position,state.position)>8,'head interaction extends beyond body center');
 const reply=forestSnakeTalk(f.sim,f.player,environment,f.now);assert.match(reply.message,/Mossback:/);assert.equal(reply.snakeSpeech.text,FOREST_SNAKE_REMARKS[0]);
 const repeat=forestSnakeTalk(f.sim,f.player,environment,f.now+100);assert.equal(repeat.snakeSpeech.id,reply.snakeSpeech.id);assert.equal(f.sim.forestHarvest.snake.utteranceSequence,1);
 f.player.position={x:1000,y:0,z:1000};assert.throws(()=>forestSnakeTalk(f.sim,f.player,environment,f.now+200),/Walk closer/);
 f.player.position={...state.position};f.player.health=0;assert.throws(()=>forestSnakeTalk(f.sim,f.player,environment,f.now+300),/Stand nearby/);
 assert.throws(()=>forestSnakeTalk(f.sim,f.player,{id:'public-commons'},f.now),/not in this forest/);
});
