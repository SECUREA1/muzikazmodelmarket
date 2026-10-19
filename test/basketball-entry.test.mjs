import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {isBasketballFreePlay,basketballWorldModeUrl,prepareBasketballFreePlay} from '../public/js/basketball-entry.js';
import {ensureBasketballGame,assignBasketballTeam,stepBasketballGame,shootBasketball,basketballSoloSettings,configureBasketballGame,startBasketballGame} from '../public/js/basketball-rules.js';
import {basketballCatchPosition} from '../public/js/basketball.js';

test('practice mode preserves the selected court and clears server matchmaking when changing modes',()=>{
 const original='https://www.muzikaz.com/model-explorer.html?environment=custom-court&house=custom-court&meet=gate&mode=spectator&matchmaking=1';
 const practice=basketballWorldModeUrl(original,'freeplay'),url=new URL(practice);
 assert.equal(url.searchParams.get('environment'),'custom-court');assert.equal(url.searchParams.get('house'),'custom-court');
 assert.equal(url.searchParams.get('meet'),'gate');assert.equal(url.searchParams.get('autoplay'),'1');
 assert.equal(url.searchParams.has('matchmaking'),false);assert.equal(isBasketballFreePlay(practice),true);
 for(const mode of ['solo','multiplayer']){
  const next=basketballWorldModeUrl(practice,mode);
  assert.equal(new URL(next).searchParams.get('mode'),mode);assert.equal(isBasketballFreePlay(next),false);
 }
 assert.throws(()=>basketballWorldModeUrl(original,'invalid'),/Choose/);
});

test('free play releases a player beside a catchable ball and keeps clocks and AI inactive',()=>{
 let now=100000;
 const player={actorId:'local',username:'You',position:{x:8.8,y:0,z:0},lastSeen:now,health:100,inventory:[]};
 const sim={actors:{},players:{local:player},events:[]};
 ensureBasketballGame(sim,{id:'basketball-arena'},now);assignBasketballTeam(sim,player,now,'home');
 configureBasketballGame(sim,basketballSoloSettings(sim.basketball.settings),now);
 prepareBasketballFreePlay(sim,player,now);
 const ball=sim.actors[sim.basketball.ballId],clock=sim.basketball.clockMs,shot=sim.basketball.shotClockMs;
 assert.ok(basketballCatchPosition(ball,player.position,{now}));assert.equal(player.basketballRole,'player');
 for(let frame=0;frame<600;frame++){now+=100;player.lastSeen=now;stepBasketballGame(sim,now,.1);}
 assert.equal(sim.basketball.state,'ready');assert.equal(sim.basketball.clockMs,clock);assert.equal(sim.basketball.shotClockMs,shot);
 assert.equal(Object.values(sim.players).filter(member=>member.basketballAI).length,0);
 ball.holderId='local';player.heldId=ball.id;shootBasketball(sim,player,now,{angle:55,power:.7});
 assert.ok(ball.ballVelocity);assert.equal(player.heldId,null);
 const previous={...ball.position};now+=100;stepBasketballGame(sim,now,.1);
 assert.notDeepEqual(ball.position,previous,'practice shooting uses the actual ball simulation');
 startBasketballGame(sim,now,player);assert.equal(sim.basketball.state,'live');
 assert.equal(Object.values(sim.players).filter(member=>member.basketballAI).length,9,'the player can still start a solo match with AI');
 assert.throws(()=>prepareBasketballFreePlay(sim,player,now),/new practice court/);
});

test('entry selection locks movement input until a successful mode choice',async()=>{
 const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('  function inputMenuOpen(){'),source.indexOf('\n',source.indexOf('  function inputMenuOpen(){')));
 const context=vm.createContext({basketballEntryWaiting:true,rangeOpsPanel:{hidden:true},document:{querySelector:()=>null}});
 const menuOpen=vm.runInContext(`${fn}\ninputMenuOpen`,context);
 assert.equal(menuOpen(),true);context.basketballEntryWaiting=false;assert.equal(menuOpen(),false);
});

test('opening free play releases the shared player spot before navigating to practice',async()=>{
 const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('  async function openBasketballWorldMode('),source.indexOf('  function basketballAction('));
 let release;const actions=[],destinations=[];
 const client={ready:true,send(action){actions.push(action);return new Promise(resolve=>{release=resolve});}};
 const context=vm.createContext({basketballWorldModeUrl,serverHostedRoom:true,authoritativeClient:client,location:{href:'https://www.muzikaz.com/model-explorer.html?environment=my-court&mode=multiplayer',assign:url=>destinations.push(url)}});
 const open=vm.runInContext(`${fn}\nopenBasketballWorldMode`,context);
 const pending=open('freeplay');assert.deepEqual(actions,['basketball-watch']);assert.equal(destinations.length,0);
 release({});assert.equal(await pending,true);assert.equal(isBasketballFreePlay(destinations[0]),true);
 client.send=async()=>{throw Error('The server rejected the switch.');};
 await assert.rejects(open('solo'),/server rejected/);assert.equal(destinations.length,1,'a rejected role change retains the current lobby for retry');
 context.serverHostedRoom=false;await open('multiplayer');assert.equal(new URL(destinations[1]).searchParams.get('mode'),'multiplayer');
});
