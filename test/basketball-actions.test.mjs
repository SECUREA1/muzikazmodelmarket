import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBasketballAction} from '../public/js/basketball-actions.js';
import {stealBasketball} from '../public/js/basketball-rules.js';
import {tossBasketball,stepBasketball} from '../public/js/basketball.js';

function fixture(){
 const player={actorId:'you',basketballTeam:'home',basketballRole:'player',health:100,position:{x:0,y:0,z:0}};
 const opponent={actorId:'other',basketballTeam:'away',basketballRole:'player',health:100,position:{x:1,y:0,z:0}};
 const teammate={actorId:'friend',basketballTeam:'home',basketballRole:'player',health:100,position:{x:8,y:0,z:0}};
 const ball={id:'ball',modelId:'basketball',basketballMatchBall:true,active:true,position:{x:1,y:0,z:0}};
 const game={state:'live',ballId:'ball',settings:{shotClockSeconds:24}};
 const players={you:player,other:opponent,friend:teammate};
 const state={game,player,players,balls:[ball],direction:[0,0,-1],now:1000};
 return {state,player,opponent,teammate,ball,game,players,resolve:fields=>resolveBasketballAction({...state,...fields})};
}

test('empty trigger grabs a reachable loose ball instead of attempting a shot',()=>{
 const f=fixture();
 assert.deepEqual(f.resolve(),{action:'catch',fields:{entityId:'ball'},label:'Grab / catch'});
 f.ball.position.x=3.1;
 assert.equal(f.resolve().action,null);
 f.ball.position.x=1;
 assert.equal(f.resolve({visible:()=>false}).action,null);
});

test('trigger steals only an eligible opposing possession, using the same range and recovery as the rules',()=>{
 const f=fixture();f.ball.holderId='other';f.opponent.heldId='ball';
 assert.equal(f.resolve().action,'basketball-steal');
 f.opponent.position.x=1.71;assert.equal(f.resolve().action,null);
 f.opponent.position.x=1;f.opponent.position.y=1.51;assert.equal(f.resolve().action,null);
 f.opponent.position.y=0;assert.equal(f.resolve({visible:()=>false}).action,null);
 f.player.basketballStealAt=201;assert.equal(f.resolve().action,null);
 f.player.basketballStealAt=200;assert.equal(f.resolve().action,'basketball-steal');
 f.opponent.basketballTeam='home';assert.equal(f.resolve().action,null);
});

test('eligible steal actually transfers the ball and the next press uses the new possession',()=>{
 const f=fixture();f.ball.holderId='other';f.opponent.heldId='ball';
 assert.equal(f.resolve().action,'basketball-steal');
 stealBasketball({basketball:f.game,actors:{ball:f.ball},players:f.players},f.player,1000);
 assert.equal(f.resolve().action,'basketball-shoot');
 assert.equal(f.ball.holderId,'you');
});

test('possession selects a lined-up shot, an aimed safe pass, or a toss when neither is suitable',()=>{
 const f=fixture();f.player.heldId='ball';f.ball.holderId='you';
 assert.equal(f.resolve().action,'basketball-shoot');
 f.opponent.position.z=3;
 assert.equal(f.resolve({direction:[1,0,0]}).label,'Pass');
 f.opponent.position.x=4;f.opponent.position.z=0;
 assert.equal(f.resolve({direction:[1,0,0]}).label,'Toss','defender blocks the passing lane');
 f.teammate.position.x=-8;
 assert.equal(f.resolve({direction:[1,0,0]}).label,'Toss','do not send an unhelpful pass behind the aim');
 f.player.position.x=9;
 assert.notEqual(f.resolve().action,'basketball-shoot','off-court trigger does not attempt an invalid shot');
});

test('automatic pass calibration reaches the actual teammate using the existing physics',()=>{
 const f=fixture();f.player.heldId='ball';f.ball.holderId='you';f.opponent.position.z=3;
 const choice=f.resolve({direction:[1,0,0]});assert.equal(choice.label,'Pass');
 tossBasketball(f.ball,f.player.position,choice.fields.direction,choice.fields);
 const flight=8/f.ball.ballVelocity.x;
 for(let elapsed=0;elapsed<flight-1e-8;){const dt=Math.min(1/60,flight-elapsed);stepBasketball(f.ball,dt);elapsed+=dt;}
 assert.ok(Math.abs(f.ball.position.x-8)<1e-6);
 assert.ok(Math.abs(f.ball.position.y-.88)<1e-6);
});

test('forced actions take precedence and invalid forced actions are left to sport validation',()=>{
 const f=fixture();
 assert.equal(f.resolve({forced:'shoot'}).action,'basketball-shoot');
 f.ball.holderId='other';f.opponent.heldId='ball';
 assert.equal(f.resolve({forced:'pass'}).action,'toss');
 f.ball.holderId='you';f.player.heldId='ball';
 assert.equal(f.resolve({forced:'steal'}).action,'basketball-steal');
 assert.equal(f.resolve({forced:'toss'}).label,'Toss');
 assert.equal(f.resolve({forced:'catch'}).action,'catch');
});

test('spectators, finished games and unrelated held items do not get automatic ball actions',()=>{
 const f=fixture();f.player.basketballRole='spectator';assert.equal(f.resolve().action,null);
 f.player.basketballRole='player';f.game.state='finished';assert.equal(f.resolve().action,null);
 f.game.state='live';f.player.heldId='crate';assert.equal(f.resolve().action,null);
});

test('malformed launch input is rejected before possession changes',()=>{
 const f=fixture();
 for(const direction of [[NaN,0,-1],[0,0,Infinity],[0,-1]])assert.throws(()=>f.resolve({direction}),/direction|aim/);
 assert.throws(()=>f.resolve({options:{power:1.1}}),/power/);
});
