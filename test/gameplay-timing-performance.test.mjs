import test from 'node:test';
import assert from 'node:assert/strict';
import {WalkingMotion} from '../public/js/walking-motion.js';
import {stepBasketball} from '../public/js/basketball.js';
import {ensureBasketballGame,assignBasketballTeam,configureBasketballGame,startBasketballGame,stepBasketballGame,basketballGameBall} from '../public/js/basketball-rules.js';
import {basketballHudRevision} from '../public/js/basketball-hud.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} differs from ${expected}`);
test('walking preserves its intended elapsed distance through slow render frames',()=>{
 const positions=[];
 for(const fps of [10,15,30,60,120]){
  const motion=new WalkingMotion(),target={};motion.reconcile({x:0,z:0},{serverTime:0,receivedAt:0});
  for(let frame=1;frame<=fps/5;frame++)motion.sample(frame*1000/fps,1/fps,{side:1},4,target);
  positions.push(target.x);
 }
 for(const position of positions)near(position,4*(.2-(1-Math.exp(-35*.2))/35));
 const motion=new WalkingMotion(),target={};motion.reconcile({x:0,z:0},{serverTime:0,receivedAt:0});
 motion.sample(0,30,{side:1},4,target);
 assert.ok(target.x>.8&&target.x<1,'a resumed tab catches up at most a quarter second, not thirty seconds');
 const before={...target};motion.sample(0,NaN,{side:1},4,target);assert.deepEqual(target,before);
});

test('ball bounces and settling agree across slow and high refresh displays',()=>{
 const results=[];
 for(const fps of [10,15,30,60,120,144]){
  const actor={modelId:'basketball',position:{x:0,y:1.47,z:0},ballVelocity:{x:3,y:3.2,z:2}};
  for(let frame=0;frame<fps*3;frame++)stepBasketball(actor,1/fps,0);
  results.push(structuredClone(actor));
  for(let frame=0;frame<fps*12;frame++)stepBasketball(actor,1/fps,0);
  assert.equal(actor.position.y,0);assert.equal(actor.ballVelocity,undefined);
 }
 for(const actor of results)for(const axis of ['x','y','z']){near(actor.position[axis],results[0].position[axis]);near(actor.ballVelocity[axis],results[0].ballVelocity[axis]);}
 const actor={modelId:'basketball',position:{x:0,y:10,z:0},ballVelocity:{x:3,y:0,z:2}};
 let steps=0;stepBasketball(actor,10,0,()=>steps++);
 assert.ok(steps<=16,'hitch recovery cannot schedule an unbounded number of ball sweeps');near(actor.position.x,.75);
});

test('basketball AI keeps its configured speed at 10 through 120 FPS',()=>{
 const positions=[];
 for(const fps of [10,15,30,60,120]){
  const start=100000,player={actorId:'human',username:'Human',health:100,lastSeen:start,position:{x:0,y:0,z:0}};
  const sim={players:{human:player},actors:{},events:[]};
  ensureBasketballGame(sim,{id:'basketball-arena'},start);assignBasketballTeam(sim,player,start,'home');
  configureBasketballGame(sim,{teamSize:1,homeHumans:1,awayHumans:0,aiDifficulty:3},start);startBasketballGame(sim,start);
  const bot=Object.values(sim.players).find(member=>member.basketballAI),ball=basketballGameBall(sim);
  player.position={x:0,y:0,z:-10};bot.position={x:0,y:0,z:0};ball.holderId=player.actorId;player.heldId=ball.id;
  for(let frame=1;frame<=fps;frame++){const now=start+frame*1000/fps;player.lastSeen=now;stepBasketballGame(sim,now,1/fps);}
  positions.push(bot.position.z);
 }
 for(const position of positions)near(position,-3.4);
});

test('basketball HUD invalidates visible results and actions without invalidating on athlete movement',()=>{
 const player={actorId:'alice',username:'Alice',basketballTeam:'home'},players={alice:player};
 const game={matchId:'match-1',state:'live',homeScore:3,awayScore:2,quarter:1,clockMs:720000,shotClockMs:24000,hostId:'alice'};
 const ui={selected:'basketball-shoot',entryPending:false};
 const revision=()=>basketballHudRevision(game,player,true,players,ui),before=revision();
 player.position={x:3,y:0,z:4};game.clockMs-=16;game.shotClockMs-=16;
 assert.equal(revision(),before,'sub-frame clock changes and actor movement do not rewrite the HUD');
 game.homeScore++;assert.notEqual(revision(),before);game.homeScore--;
 game.shotClockMs=23000;assert.notEqual(revision(),before);game.shotClockMs=24000;
 ui.entryPending=true;assert.notEqual(revision(),before);ui.entryPending=false;
 players.bob={actorId:'bob',username:'Bob',basketballTeam:'away'};assert.notEqual(revision(),before);delete players.bob;
 ui.selected='toss';assert.notEqual(revision(),before);
});
