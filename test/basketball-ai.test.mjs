import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureBasketballGame,configureBasketballGame,startBasketballGame,assignBasketballTeam,stepBasketballGame,basketballGameBall} from '../public/js/basketball-rules.js';
function fixture(){
 const now=100000,player={actorId:'human',username:'Human',health:100,lastSeen:now,position:{x:0,y:0,z:0}};
 const sim={players:{human:player},actors:{},events:[]};ensureBasketballGame(sim,{id:'basketball-arena'},now);assignBasketballTeam(sim,player,now,'home');return {sim,player,now};
}
const bots=sim=>Object.values(sim.players).filter(p=>p.basketballAI);
test('solo tip-off fills equal teams in jerseys, including unoccupied human reservations',()=>{
 const {sim,now}=fixture();configureBasketballGame(sim,{teamSize:3,homeHumans:2,awayHumans:1,aiDifficulty:5},now);startBasketballGame(sim,now);
 assert.equal(bots(sim).length,5);
 for(const team of ['home','away'])assert.equal(Object.values(sim.players).filter(p=>p.basketballTeam===team).length,3);
 assert.ok(bots(sim).every(p=>p.basketballJersey===p.basketballTeam&&p.username.includes('AI')));
 assert.throws(()=>configureBasketballGame(sim,{aiDifficulty:1},now),/before|buzzer/);
});
test('roster settings reject impossible sizes, zero humans and invalid tiers atomically',()=>{
 const {sim,now}=fixture(),before=structuredClone(sim.basketball.settings);
 for(const settings of [{teamSize:0},{teamSize:1},{homeHumans:0,awayHumans:0},{aiDifficulty:6},{aiDifficulty:1.5},{homeHumans:-1}]){
  assert.throws(()=>configureBasketballGame(sim,settings,now));assert.deepEqual(sim.basketball.settings,before);
 }
});
test('AI catches, advances and scores through the shared ball physics without fabricated points',()=>{
 const {sim,player,now}=fixture();configureBasketballGame(sim,{teamSize:1,homeHumans:1,awayHumans:0,aiDifficulty:5},now);startBasketballGame(sim,now);
 player.position={x:7,y:0,z:12};
 const bot=bots(sim)[0];bot.position={x:0,y:0,z:0};bot.aiNextAction=now;
 let released=false;
 for(let i=1;i<=1200;i++){const time=now+i*50;player.lastSeen=time;stepBasketballGame(sim,time,.05);if(basketballGameBall(sim).basketballShot?.playerId===bot.actorId)released=true;if(sim.basketball.awayScore>0)break;}
 assert.ok(released,'AI released a real shot');assert.ok(sim.basketball.awayScore>=2,'rim crossing credited the AI basket');
 assert.equal(sim.basketball.lastScore.playerId,bot.actorId);
});
test('disconnected humans are replaced without enlarging teams, late arrivals cannot take a live slot',()=>{
 const {sim,player,now}=fixture();const friend={...player,actorId:'friend',position:{x:0,y:0,z:0},basketballTeam:'away'};sim.players.friend=friend;
 configureBasketballGame(sim,{teamSize:2,homeHumans:1,awayHumans:1},now);startBasketballGame(sim,now);
 player.lastSeen=now+16000;stepBasketballGame(sim,now+16000,0);
 assert.equal(friend.basketballRole,'spectator');assert.equal(bots(sim).length,3);
 for(const team of ['home','away'])assert.equal(Object.values(sim.players).filter(p=>p.basketballTeam===team).length,2);
 friend.lastSeen=now+16000;assert.throws(()=>assignBasketballTeam(sim,friend,now+16000,'away'),/Spectators|Late/);
});
test('restarting a finished match recreates exactly one roster and pauses when humans leave',()=>{
 const {sim,player,now}=fixture();startBasketballGame(sim,now);assert.equal(bots(sim).length,9);sim.basketball.state='finished';startBasketballGame(sim,now+1);assert.equal(bots(sim).length,9);
 const clock=sim.basketball.clockMs;stepBasketballGame(sim,now+20000,.05);assert.equal(sim.basketball.clockMs,clock);
 assert.equal(player.lastSeen,now);
});
