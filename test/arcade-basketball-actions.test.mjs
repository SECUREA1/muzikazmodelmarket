import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveArcadeBasketballAction} from '../public/js/arcade-basketball-actions.js';
import {createBasketballMatch} from '../public/js/arcade-basketball-rules.js';
import {ArcadeRooms} from '../arcade-rooms.mjs';

const player=(id,team,x,y)=>({id,team,x,y,cooldown:0});
const state=(players,extra={})=>({players,owner:0,shot:null,shotClock:20,ended:false,...extra});
const advance=(match,seconds)=>{for(let time=0;time<seconds;time+=.05)match.step(.05);};

test('auto shoots a good basket and passes a poor shot to the better open teammate',()=>{
 assert.deepEqual(resolveArcadeBasketballAction(state([player(0,0,400,150),player(1,0,500,300),player(2,1,600,350)]),0),{kind:'shoot'});
 const court=state([player(0,0,400,350),player(1,0,400,170),player(2,1,650,300)]);
 assert.deepEqual(resolveArcadeBasketballAction(court,0),{kind:'pass',target:1});
 assert.deepEqual(resolveArcadeBasketballAction({...court,shotClock:3},0),{kind:'shoot'},'an expiring clock takes priority over passing');
 court.players[2].x=400;court.players[2].y=260;
 assert.deepEqual(resolveArcadeBasketballAction(court,0),{kind:'shoot'},'a defender in the passing lane removes that pass');
});

test('auto steals only a reachable opposing ball and leaves teammate possession intact',()=>{
 const court=state([player(0,0,400,200),player(1,1,420,200)],{owner:1});
 assert.deepEqual(resolveArcadeBasketballAction(court,0),{kind:'steal'});
 court.players[1].x=450;assert.equal(resolveArcadeBasketballAction(court,0),null);
 court.players[1].team=0;assert.equal(resolveArcadeBasketballAction(court,0),null);
 assert.equal(resolveArcadeBasketballAction({...court,owner:null},0),null,'rebounds are assigned by the simulation, not invented as pickup actions');
});

test('auto respects flight, cooldown, stoppage and ended rounds; forced choices stay explicit',()=>{
 const court=state([player(0,0,400,150)]);
 for(const override of [{shot:{p:.2}},{ended:true},{stoppage:.3},{players:[{...court.players[0],cooldown:.2}]}])assert.equal(resolveArcadeBasketballAction({...court,...override},0),null);
 for(const kind of ['shoot','pass','steal'])assert.deepEqual(resolveArcadeBasketballAction(court,0,kind),{kind});
 assert.equal(resolveArcadeBasketballAction(court,0,'unknown'),null);
 assert.equal(resolveArcadeBasketballAction(court,-1),null);
});

test('shared basketball simulation executes the automatic target and preserves a forced shot',()=>{
 const auto=createBasketballMatch({teamSize:3,aiFill:false});advance(auto,1);
 assert.equal(auto.action(0,'auto'),true);assert.equal(auto.snapshot().basketball.owner,1);assert.equal(auto.snapshot().attempts,0);
 const forced=createBasketballMatch({teamSize:3,aiFill:false});advance(forced,1);
 assert.equal(forced.action(0,'shoot'),true);assert.equal(forced.snapshot().shot.shooter,0);assert.equal(forced.snapshot().attempts,1);
 const defense=createBasketballMatch({teamSize:1,aiFill:false});defense.setRoster([{actor:'home'},{actor:'away'}]);advance(defense,1);
 defense.input({moveY:1},1);advance(defense,1.15);defense.input({},1);
 assert.equal(defense.action(1,'shoot'),false,'forced shooting does not silently steal');
 assert.equal(defense.action(1,'auto'),true);assert.match(defense.snapshot().feedback,/steal/i);assert.equal(defense.snapshot().attempts,0);
});

test('live arcade room resolves auto on the server and still rejects spectator actions',()=>{
 let now=0;const rooms=new ArcadeRooms({now:()=>now}),env={arcade:{}},host={accountId:'home',username:'Home'},viewer={accountId:'viewer',username:'Viewer'};
 rooms.command('court',env,host,{action:'join',game:2,slot:0,settings:{teamSize:3,aiFill:false}});
 rooms.command('court',env,viewer,{action:'spectate',game:2});rooms.command('court',env,host,{action:'start'});
 for(let i=0;i<4;i++){now+=250;rooms.tick();}
 const result=rooms.command('court',env,host,{action:'action',kind:'auto',input:{x:685,y:350}});
 assert.equal(result.state.basketball.owner,1,'server chooses the open teammate rather than the unrelated pointer');assert.equal(result.state.attempts,0);
 assert.throws(()=>rooms.command('court',env,viewer,{action:'action',kind:'auto'}),{statusCode:403});
});
