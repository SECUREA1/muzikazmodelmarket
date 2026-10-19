import test from 'node:test';
import assert from 'node:assert/strict';
import {basketballScoreboardState} from '../public/js/basketball-hud.js';
import {ensureBasketballGame,assignBasketballTeam,configureBasketballGame,startBasketballGame,stepBasketballGame} from '../public/js/basketball-rules.js';

test('broadcast scoreboard reports supplied scores, quarter and both independent countdowns',()=>{
 const game={state:'live',homeScore:103,awayScore:98,quarter:4,clockMs:125000,shotClockMs:17000,possession:'away',settings:{quarters:4}};
 const before=structuredClone(game);
 assert.deepEqual(basketballScoreboardState(game),{home:103,away:98,phase:'Q4',gameClock:'2:05',shotClock:'17',possession:'away'});
 assert.deepEqual(game,before,'rendering never changes the authoritative match');
 assert.deepEqual(basketballScoreboardState({...game,clockMs:42150,shotClockMs:4350}),{home:103,away:98,phase:'Q4',gameClock:'0:42.2',shotClock:'4.4',possession:'away'});
});

test('scoreboard stays pregame until tip-off and follows the actual configured overtime transition',()=>{
 let now=100000;const player={actorId:'host',username:'Host',health:100,lastSeen:now,position:{x:0,y:0,z:0}};
 const sim={players:{host:player},actors:{},events:[]};ensureBasketballGame(sim,{id:'basketball-arena'},now);assignBasketballTeam(sim,player,now,'home');
 configureBasketballGame(sim,{quarterMinutes:1,quarters:2,shotClockSeconds:60,teamSize:1,homeHumans:1,awayHumans:0},now);
 assert.equal(basketballScoreboardState(sim.basketball).phase,'PRE GAME');assert.equal(basketballScoreboardState(sim.basketball).gameClock,'1:00');
 now+=5000;player.lastSeen=now;stepBasketballGame(sim,now,0);assert.equal(basketballScoreboardState(sim.basketball).gameClock,'1:00');
 startBasketballGame(sim,now,player);assert.equal(basketballScoreboardState(sim.basketball).phase,'Q1');
 now+=60000;player.lastSeen=now;stepBasketballGame(sim,now,0);assert.equal(basketballScoreboardState(sim.basketball).phase,'Q2');
 now+=60000;player.lastSeen=now;stepBasketballGame(sim,now,0);
 const overtime=basketballScoreboardState(sim.basketball);assert.equal(overtime.phase,'OT 1');assert.equal(overtime.gameClock,'5:00');
});

test('basketball scoreboard distinguishes final regulation and overtime with stopped clocks',()=>{
 const game={state:'finished',homeScore:77,awayScore:79,quarter:4,clockMs:0,shotClockMs:0,settings:{quarters:4}};
 assert.deepEqual(basketballScoreboardState(game),{home:77,away:79,phase:'FINAL',gameClock:'0:00',shotClock:'0',possession:null});
 assert.equal(basketballScoreboardState({...game,quarter:6}).phase,'FINAL · OT 2');
});

test('clock boundaries never display a sixty-second fraction or negative time',()=>{
 const live={state:'live',quarter:1};
 assert.equal(basketballScoreboardState({...live,clockMs:60000}).gameClock,'1:00');
 assert.equal(basketballScoreboardState({...live,clockMs:59999}).gameClock,'0:59.9');
 assert.equal(basketballScoreboardState({...live,clockMs:1,shotClockMs:1}).gameClock,'0:00.1');
 assert.equal(basketballScoreboardState({...live,clockMs:-20,shotClockMs:-1}).shotClock,'0');
 assert.deepEqual(basketballScoreboardState({...live,clockMs:NaN,shotClockMs:Infinity,homeScore:NaN,awayScore:-1}),{home:0,away:0,phase:'Q1',gameClock:'0:00',shotClock:'0',possession:null});
});
