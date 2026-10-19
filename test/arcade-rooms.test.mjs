import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ArcadeRooms} from '../arcade-rooms.mjs';
import {createArcadeMatch} from '../public/js/arcade-match.js';
const env={arcade:{roundSeconds:45,basketballMode:'shooting'}},a={accountId:'a',username:'Alice'},b={accountId:'b',username:'Bob'},v={accountId:'v',username:'Viewer'};
test('join waits for start, shared scores and read-only spectators',()=>{let now=0;const rooms=new ArcadeRooms({now:()=>now});let s=rooms.command('park',env,a,{action:'join',game:2,slot:0});assert.equal(s.started,false);now=1000;rooms.tick();assert.equal(rooms.command('park',env,a,{action:'watch'}).state.remaining,45);rooms.command('park',env,b,{action:'join',game:2,slot:1});rooms.command('park',env,v,{action:'spectate',game:2});assert.throws(()=>rooms.command('park',env,v,{action:'start'}),{statusCode:403});assert.throws(()=>rooms.command('park',env,v,{action:'input',input:{x:400}}),{statusCode:403});assert.throws(()=>rooms.command('park',env,b,{action:'start'}),{statusCode:403});rooms.command('park',env,a,{action:'start'});rooms.command('park',env,a,{action:'action',input:{x:400,y:370}});now=2000;rooms.tick();now=2500;rooms.tick();s=rooms.command('park',env,v,{action:'watch'});assert.equal(s.state.score,150);assert.equal(s.role,'spectator');assert.equal(s.slots.length,2);assert.ok(s.state.remaining<45);});
test('take over AI, reject occupied slots, leave restores AI and limits one player game',()=>{const rooms=new ArcadeRooms({now:()=>0});rooms.command('one',env,a,{action:'join',game:3,slot:0});assert.throws(()=>rooms.command('one',env,b,{action:'join',game:3,slot:0}),{statusCode:409});rooms.command('one',env,b,{action:'join',game:3,slot:1});rooms.command('one',env,v,{action:'spectate',game:3});rooms.command('one',env,b,{action:'leave'});const s=rooms.command('one',env,v,{action:'join',game:3,slot:1});assert.equal(s.slots[1].actor,'account:v');rooms.command('two',env,a,{action:'join',game:2});assert.equal(rooms.rooms.get('one').slots[0].actor,null);assert.throws(()=>rooms.command('one',env,a,{action:'join',game:2}),{statusCode:409});});
test('all five games use finite shared simulation and stale players return to AI',()=>{for(let game=0;game<5;game++){const match=createArcadeMatch(game,{roundSeconds:15,difficulty:'easy',basketballMode:'shooting'});for(let i=0;i<200;i++){match.input({x:400,y:150});if(i%15===0)match.action();match.step(.1);}const s=match.snapshot();assert.equal(s.ended,true);assert.equal(s.remaining,0);assert.ok(Number.isFinite(s.score));}let now=0;const rooms=new ArcadeRooms({now:()=>now});rooms.command('one',env,a,{action:'join',game:2});rooms.command('one',env,v,{action:'spectate',game:2});now=14000;rooms.command('one',env,v,{action:'watch'});now=16000;rooms.tick();assert.equal(rooms.rooms.get('one').slots[0].actor,null);});
test('full billiards reserves seats before start and keeps the shooting turn until physics settles',()=>{
 let now=0;const rooms=new ArcadeRooms({now:()=>now});
 const joined=rooms.command('pool',env,a,{action:'join',game:4,settings:{roundSeconds:180}});
 assert.equal(joined.state.balls.length,16);assert.equal(joined.started,false);
 rooms.command('pool',env,b,{action:'join',game:4,slot:1});now=1000;rooms.tick();
 let state=rooms.command('pool',env,a,{action:'watch'});assert.equal(state.state.remaining,180);assert.equal(state.state.attempts,0);
 assert.throws(()=>rooms.command('pool',env,b,{action:'start'}),{statusCode:403});
 rooms.command('pool',env,a,{action:'start'});
 state=rooms.command('pool',env,a,{action:'action',input:{x:220,y:90,power:.5}});
 assert.equal(state.turn,0);assert.equal(state.state.attempts,1);assert.equal(state.state.billiards.moving,true);
 state=rooms.command('pool',env,b,{action:'action',input:{x:500,y:230,power:1}});
 assert.equal(state.state.attempts,1,'the other player cannot shoot into moving balls');
 for(let step=0;step<100&&state.state.billiards.moving;step++){now+=100;rooms.tick();state=rooms.command('pool',env,a,{action:'watch'});}
 assert.equal(state.state.billiards.moving,false);assert.equal(state.turn,1);assert.equal(state.state.billiards.ballInHand,true);
 state=rooms.command('pool',env,a,{action:'action',input:{x:500,y:230}});assert.equal(state.state.attempts,1,'the previous player no longer controls the turn');
 state=rooms.command('pool',env,b,{action:'action',kind:'place',input:{x:180,y:200}});assert.equal(state.state.balls[0].x,180);assert.equal(state.state.balls[0].y,200);
});
test('target practice awards each competitor their own score and initializes hittable targets',()=>{
 const match=createArcadeMatch(1,{roundSeconds:30,difficulty:'easy'}),target=match.snapshot().targets[0];
 assert.ok(Number.isFinite(target.dx)&&Number.isFinite(target.dy));
 match.input({x:target.dx,y:target.dy});match.action(0);match.action(1);
 assert.deepEqual(match.snapshot().playerScores,[80,80]);assert.equal(match.snapshot().score,160);
});
