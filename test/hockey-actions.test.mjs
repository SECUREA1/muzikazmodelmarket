import test from 'node:test';
import assert from 'node:assert/strict';
import {createHockey,joinHockey,hockeyInput,stepHockey,attackDirection,RINK} from '../public/js/hockey-rules.js';
import {selectHockeyTriggerAction,createHockeyTrigger} from '../public/js/hockey-actions.js';

function match(){
 const state=createHockey({offside:false,aiFill:false});state.phase='playing';state.faceoffPending=false;
 for(const p of state.players)Object.assign(p,{x:p.team?24:-24,z:10,vx:0,vz:0,cooldown:5});
 const player=joinHockey(state,'you');Object.assign(player,{x:0,z:0,cooldown:0});
 state.puck={x:.5,z:0,y:.03,vx:0,vz:0,vy:0,owner:null};
 return {state,player,opponent:state.players.find(p=>p.team!==player.team&&!p.goalie)};
}

test('Auto collects a nearby loose puck without spending the cooldown needed to acquire it',()=>{
 const {state,player}=match(),choice=selectHockeyTriggerAction(state,player);
 assert.equal(choice.action,'collect');assert.deepEqual(choice.input,{});
 hockeyInput(state,'you',choice.input);stepHockey(state,.01);
 assert.equal(state.puck.owner,player.id);assert.equal(player.penalty,0);
});
test('Auto uses a legal poke against an in-range carrier and actually knocks the puck free',()=>{
 const {state,player,opponent}=match();Object.assign(opponent,{x:1.3,z:0,cooldown:0});state.puck.owner=opponent.id;
 const choice=selectHockeyTriggerAction(state,player);assert.equal(choice.action,'steal');assert.equal(choice.input.poke,true);
 hockeyInput(state,'you',choice.input);stepHockey(state,.01);
 assert.equal(state.puck.owner,null);assert.equal(player.penalty,0);assert.equal(state.delayedPenalties.length,0);assert.equal(state.stats.hits[player.team],1);
});
test('Auto body-checks a close moving carrier and switches to a safe poke near the boards',()=>{
 const {state,player,opponent}=match();Object.assign(opponent,{x:1,z:0,vx:4});state.puck.owner=opponent.id;
 assert.equal(selectHockeyTriggerAction(state,player).action,'check');
 Object.assign(player,{z:RINK.width/2-1,vx:6});Object.assign(opponent,{z:player.z});
 assert.equal(selectHockeyTriggerAction(state,player).action,'steal');
 Object.assign(player,{z:0,vx:-10});Object.assign(opponent,{z:0,vx:4});
 assert.equal(selectHockeyTriggerAction(state,player).action,'steal');
});
test('Auto does not foul a nearer noncarrier, goalie, teammate, or distant opponent',()=>{
 const {state,player,opponent}=match();Object.assign(opponent,{x:1.4,z:0});state.puck.owner=opponent.id;
 const blocker=state.players.find(p=>p.team===opponent.team&&p!==opponent&&!p.goalie);Object.assign(blocker,{x:.7,z:0});
 assert.equal(selectHockeyTriggerAction(state,player).action,'none');blocker.z=10;
 opponent.x=3;assert.equal(selectHockeyTriggerAction(state,player).action,'none');
 const goalie=state.players.find(p=>p.team!==player.team&&p.goalie);Object.assign(goalie,{x:1,z:0});state.puck.owner=goalie.id;
 assert.equal(selectHockeyTriggerAction(state,player).action,'none');
 state.puck.owner=state.players.find(p=>p.team===player.team&&p!==player&&!p.goalie).id;
 assert.equal(selectHockeyTriggerAction(state,player).action,'none');
});
test('Auto respects action recovery, penalty box, stoppages, and puck height',()=>{
 const {state,player,opponent}=match();player.cooldown=.2;assert.equal(selectHockeyTriggerAction(state,player).action,'none');
 player.cooldown=0;player.penalty=120;assert.equal(selectHockeyTriggerAction(state,player).action,'none');
 player.penalty=0;state.phase='faceoff';assert.equal(selectHockeyTriggerAction(state,player).action,'none');
 state.phase='playing';state.puck.y=1;assert.equal(selectHockeyTriggerAction(state,player).action,'none');
 Object.assign(opponent,{x:1,z:0,vx:0});state.puck.owner=opponent.id;state.puck.y=1.5;
 assert.equal(selectHockeyTriggerAction(state,player).action,'check');
 assert.equal(selectHockeyTriggerAction(state,player,{mode:'steal'}).action,'none');
});
test('Auto shoots a clear scoring chance and passes out of a poor shooting position',()=>{
 const {state,player}=match();state.puck.owner=player.id;player.x=19;
 let choice=selectHockeyTriggerAction(state,player);assert.equal(choice.action,'shoot');assert.equal(choice.input.aimX,RINK.goalX);
 hockeyInput(state,'you',choice.input);stepHockey(state,.01);assert.equal(state.puck.owner,null);assert.equal(state.stats.shots[player.team],1);
 player.cooldown=0;player.x=-12;state.puck.owner=player.id;
 const mate=state.players.find(p=>p.team===player.team&&p!==player&&!p.goalie);Object.assign(mate,{x:0,z:3});
 choice=selectHockeyTriggerAction(state,player);assert.equal(choice.action,'pass');
 hockeyInput(state,'you',choice.input);stepHockey(state,.01);assert.equal(state.puck.owner,null);assert.equal(player.animation,'pass');assert.ok(state.puck.vx>0&&state.puck.vx<15);
});
test('Auto passes a blocked shot and a pressured carrier can pass to a better placed teammate',()=>{
 const {state,player,opponent}=match();player.x=18;state.puck.owner=player.id;
 Object.assign(opponent,{x:22,z:0});assert.equal(selectHockeyTriggerAction(state,player).action,'pass');
 const mate=state.players.find(p=>p.team===player.team&&p!==player&&!p.goalie);Object.assign(mate,{x:23,z:3});
 Object.assign(opponent,{x:18,z:2});assert.equal(selectHockeyTriggerAction(state,player).action,'pass');
});
test('Auto shoots or clears instead of passing through a defender when the shooting position is poor',()=>{
 const {state,player,opponent}=match();player.x=-12;state.puck.owner=player.id;
 const mate=state.players.find(p=>p.team===player.team&&p!==player&&!p.goalie);Object.assign(mate,{x:0,z:3});
 assert.equal(selectHockeyTriggerAction(state,player).action,'pass');
 Object.assign(opponent,{x:-6,z:1.5});const choice=selectHockeyTriggerAction(state,player);
 assert.equal(choice.action,'shoot');assert.equal(choice.input.shoot,true);assert.equal(choice.input.pass,undefined);
 hockeyInput(state,'you',choice.input);stepHockey(state,.01);assert.equal(state.puck.owner,null);assert.ok(state.puck.vx>0);
});
test('Auto follows changing attacking ends and preserves an intentional shot through the goal mouth',()=>{
 const {state,player}=match();state.period=2;player.x=-19;state.puck.owner=player.id;
 const choice=selectHockeyTriggerAction(state,player,{aim:{x:-RINK.goalX,z:.6}});
 assert.equal(attackDirection(state,player.team),-1);assert.equal(choice.action,'shoot');assert.equal(choice.input.aimX,-RINK.goalX);assert.ok(Math.abs(choice.input.aimZ-.6)<1e-9);
});
test('forced trigger modes do not silently substitute a different action',()=>{
 const {state,player,opponent}=match();state.puck.owner=player.id;player.x=-12;
 assert.equal(selectHockeyTriggerAction(state,player).action,'pass');assert.deepEqual(selectHockeyTriggerAction(state,player,{mode:'shoot'}).input,{shoot:true});
 player.x=20;assert.equal(selectHockeyTriggerAction(state,player).action,'shoot');assert.equal(selectHockeyTriggerAction(state,player,{mode:'pass'}).action,'pass');
 Object.assign(opponent,{x:21,z:0});state.puck.owner=opponent.id;
 assert.equal(selectHockeyTriggerAction(state,player,{mode:'shoot'}).action,'none');assert.equal(selectHockeyTriggerAction(state,player,{mode:'collect'}).action,'none');
 assert.equal(selectHockeyTriggerAction(state,player,{mode:'check'}).action,'check');assert.equal(selectHockeyTriggerAction(state,player,{mode:'steal'}).action,'steal');
});
test('explicit action buttons override Auto and a forced trigger selection',()=>{
 const {state,player}=match();state.puck.owner=player.id;
 for(const mode of ['auto','shoot','check'])assert.deepEqual(createHockeyTrigger().read(state,player,{pressed:true,mode,manual:{pass:true}}),{pass:true});
 assert.deepEqual(createHockeyTrigger().read(state,player,{pressed:false}),{});
});
test('one trigger press cannot collect then immediately pass or shoot without another press',()=>{
 const {state,player}=match(),trigger=createHockeyTrigger();
 assert.deepEqual(trigger.read(state,player,{pressed:true}),{});state.puck.owner=player.id;
 assert.deepEqual(trigger.read(state,player,{pressed:true}),{});
 trigger.read(state,player,{pressed:false});assert.equal(trigger.read(state,player,{pressed:true}).pass,true);
 assert.deepEqual(trigger.read(state,player,{pressed:true,manual:{shoot:true}}),{shoot:true});
});
test('a held trigger waits for a legal action to recover or move into reach',()=>{
 const {state,player,opponent}=match(),trigger=createHockeyTrigger();state.puck.owner=opponent.id;
 Object.assign(opponent,{x:3,z:0});assert.deepEqual(trigger.read(state,player,{pressed:true}),{});
 opponent.x=1.4;player.cooldown=.1;assert.deepEqual(trigger.read(state,player,{pressed:true}),{});
 player.cooldown=0;assert.equal(trigger.read(state,player,{pressed:true}).poke,true);
 state.puck.owner=null;assert.deepEqual(trigger.read(state,player,{pressed:true}),{});
});
test('shootout trigger shoots with possession and cannot check the lone goalie',()=>{
 const {state,player}=match();state.phase='shootout';state.shootout={active:true,shooterId:player.id};state.puck.owner=player.id;
 for(const p of state.players)if(p!==player&&!p.goalie)p.onIce=false;
 assert.equal(selectHockeyTriggerAction(state,player).action,'shoot');
 const goalie=state.players.find(p=>p.team!==player.team&&p.goalie);Object.assign(goalie,{x:.8,z:0});state.puck.owner=goalie.id;
 assert.equal(selectHockeyTriggerAction(state,player).action,'none');
});
