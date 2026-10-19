import test from 'node:test';
import assert from 'node:assert/strict';
import {createBilliardsMatch} from '../public/js/arcade-billiards-rules.js';

function settle(match){for(let frame=0;frame<300&&match.snapshot().billiards.moving;frame++)match.step(.05);assert.equal(match.snapshot().billiards.moving,false,'shot must reach rest');return match.snapshot();}
function scratch(match){const slot=match.snapshot().billiards.turn;match.input({x:80,y:70,power:.7},slot);assert.equal(match.action(slot),true);return settle(match);}

test('8-ball racks all 15 numbered objects, the centered 8 and a separate cue ball',()=>{
 const match=createBilliardsMatch(),state=match.snapshot();
 assert.equal(state.game,4);assert.equal(state.balls.length,16);assert.deepEqual(state.balls.map(ball=>ball.id),Array.from({length:16},(_,id)=>id));
 assert.equal(state.balls.filter(ball=>ball.group==='solids').length,7);assert.equal(state.balls.filter(ball=>ball.group==='stripes').length,7);
 assert.equal(state.balls[8].y,230);assert.deepEqual(state.billiards.groups,[null,null]);assert.equal(state.billiards.turn,0);assert.equal(state.billiards.ballInHand,false);
 assert.equal(state.balls[0].x,220);assert.equal(state.balls[0].y,240);assert.equal(state.billiards.pockets.length,6);
 for(const ball of state.balls)for(const other of state.balls)if(ball.id!==other.id)assert.ok(Math.hypot(ball.x-other.x,ball.y-other.y)>=24);
 state.balls[0].x=600;assert.equal(match.snapshot().balls[0].x,220,'snapshots cannot mutate the table');
});

test('shots require the active seat and resting table; aim and power control cue launch',()=>{
 const soft=createBilliardsMatch(),hard=createBilliardsMatch();
 assert.equal(soft.action(1),false);assert.equal(soft.action(0,'place'),false);
 soft.input({x:500,y:240,power:.2});hard.input({x:500,y:240,power:1});assert.equal(soft.action(),true);assert.equal(hard.action(),true);
 const first=soft.snapshot(),second=hard.snapshot();assert.ok(second.balls[0].vx>first.balls[0].vx*1.5);assert.equal(first.balls[0].vy,0);
 assert.equal(soft.action(),false);assert.equal(soft.action(1),false);assert.equal(soft.snapshot().attempts,1);
 soft.step(.1);assert.equal(soft.snapshot().billiards.turn,0,'turn remains with shooter until balls settle');assert.ok(soft.snapshot().balls[0].x>220);
});

test('scratch switches the turn after settling and permits only legal ball-in-hand positions',()=>{
 const match=createBilliardsMatch({roundSeconds:180}),state=scratch(match);
 assert.equal(state.billiards.turn,1);assert.equal(state.billiards.ballInHand,true);assert.match(state.feedback,/Scratch/);assert.equal(state.balls[0].sunk,false);
 match.input({x:500,y:230},1);assert.equal(match.action(1,'place'),false,'cue cannot overlap a racked ball');
 match.input({x:80,y:70},1);assert.equal(match.action(1,'place'),false,'cue cannot be placed inside a pocket');
 match.input({x:300,y:120},1);assert.equal(match.action(1,'place'),true);assert.equal(match.snapshot().balls[0].x,300);assert.equal(match.snapshot().balls[0].y,120);
 match.input({x:400,y:120},1);assert.equal(match.action(1),true);assert.equal(match.snapshot().billiards.ballInHand,false);
 assert.equal(match.action(1,'place'),false,'placement is unavailable after the shot');
});

test('finite clamped input cannot poison physics and resting turns do not silently advance',()=>{
 const match=createBilliardsMatch({roundSeconds:180});match.input({x:NaN,y:Infinity,power:Infinity});match.action();
 for(let i=0;i<100;i++)match.step(.1);
 const state=match.snapshot();for(const ball of state.balls)assert.ok([ball.x,ball.y,ball.vx,ball.vy].every(Number.isFinite));
 const turn=state.billiards.turn,attempts=state.attempts;for(let i=0;i<20;i++)match.step(.1);
 assert.equal(match.snapshot().billiards.turn,turn);assert.equal(match.snapshot().attempts,attempts);
 const elapsed=match.snapshot().gameElapsed;for(const dt of [NaN,Infinity,-1])match.step(dt);assert.equal(match.snapshot().gameElapsed,elapsed);
});

test('unoccupied configured seats use AI; disabled AI leaves the same turns for players',()=>{
 const ai=createBilliardsMatch({roundSeconds:180}),manual=createBilliardsMatch({roundSeconds:180,aiFill:false});
 ai.setRoster([]);manual.setRoster([]);for(let i=0;i<20;i++){ai.step(.1);manual.step(.1);}
 assert.ok(ai.snapshot().attempts>0);assert.equal(manual.snapshot().attempts,0);
});

test('a full deterministic AI match assigns opposing groups, retains legal turns and wins on the 8 after clearing a group',()=>{
 const match=createBilliardsMatch({roundSeconds:180,difficulty:'normal'});match.setRoster([]);
 let sawGroups=false,sawRetainedTurn=false;
 for(let i=0;i<1800&&!match.snapshot().ended;i++){
  match.step(.1);const state=match.snapshot();if(state.billiards.groups[0]){sawGroups=true;assert.notEqual(state.billiards.groups[0],state.billiards.groups[1]);}
  if(/shoots again/.test(state.feedback))sawRetainedTurn=true;
  for(const ball of state.balls)assert.ok([ball.x,ball.y,ball.vx,ball.vy].every(Number.isFinite));
 }
 const end=match.snapshot();assert.equal(sawGroups,true);assert.equal(sawRetainedTurn,true);assert.equal(end.ended,true);assert.ok(end.billiards.winner===0||end.billiards.winner===1);
 assert.match(end.feedback,/8-ball pocketed/);assert.equal(end.balls[8].sunk,true);assert.equal(end.playerScores[end.billiards.winner],7);assert.equal(end.billiards.moving,false);
 assert.equal(match.action(end.billiards.winner),false);
});

test('a player who deliberately pockets the 8 before clearing their group loses',()=>{
 const match=createBilliardsMatch({roundSeconds:180,difficulty:'normal'});match.setRoster([]);
 // Play the rack through the public simulation until a foul exposes the 8.
 for(let i=0;i<1000;i++){match.step(.1);const state=match.snapshot();if(state.gameElapsed>30&&state.billiards.ballInHand&&!state.billiards.moving)break;}
 match.setRoster([{actor:'player-one'},{actor:'player-two'}]);
 const state=match.snapshot(),slot=state.billiards.turn,eight=state.balls[8],pocket=state.billiards.pockets[0],d=Math.hypot(pocket.x-eight.x,pocket.y-eight.y);
 assert.equal(state.billiards.ballInHand,true);assert.ok(state.playerScores[slot]<7);
 match.input({x:eight.x-(pocket.x-eight.x)/d*45,y:eight.y-(pocket.y-eight.y)/d*45},slot);assert.equal(match.action(slot,'place'),true);
 match.input({...pocket,power:.65},slot);assert.equal(match.action(slot),true);const end=settle(match);
 assert.equal(end.balls[8].sunk,true);assert.equal(end.ended,true);assert.equal(end.billiards.winner,1-slot);assert.match(end.feedback,/8 early/);
});

test('short rounds finish once at zero with a draw when no player has pocketed a ball',()=>{
 const match=createBilliardsMatch({roundSeconds:15});for(let i=0;i<15;i++)match.step(1);
 const end=match.snapshot();assert.equal(end.ended,true);assert.equal(end.remaining,0);assert.equal(end.billiards.winner,null);assert.deepEqual(end.playerScores,[0,0]);
 match.step(1);assert.deepEqual(match.snapshot(),end);
});
