import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ARCADE_GAMES,arcadePresentation} from '../public/js/arcade-games.js';
import {newArcadeGame,arcadeMove,projectArcadeDevices,blackjackValue} from '../server-arcade-games.mjs';
import {deviceCommand} from '../server-interactive-devices.mjs';
import {GAME_ECONOMY,ownsEconomyItem} from '../game-economy.mjs';
import {marketCategory} from '../public/js/market-categories.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
const rng=max=>Math.floor(max/2);
test('all twelve new machines are priced marketplace assets with native meshes and thumbnails',async()=>{
 assert.equal(Object.keys(ARCADE_GAMES).length,12);
 for(const [id,profile]of Object.entries(ARCADE_GAMES)){
  const item=GAME_ECONOMY.find(item=>item.buildAssetId===id);assert.ok(item?.priceMzk>0,id);assert.notEqual(item.basic,true);assert.equal(marketCategory(item),'arcade');assert.equal(ownsEconomyItem({items:[]},item),false);assert.equal(ownsEconomyItem({items:[{economySku:item.sku}]},item),true);
  const model=createBuilderModel(id);assert.equal(model.userData.interactiveDevice,id);assert.equal(model.name,profile.name);await readFile('.'+item.thumbnailUrl);
 }
});
test('each game has distinct playable server actions and a useful mobile presentation',()=>{
 const actions={blackjack:{operation:'stand'},highlow:{operation:'higher'},memory:{operation:'cell',index:0},tictactoe:{operation:'cell',index:0},connect4:{operation:'column',index:0},mines:{operation:'cell',index:0},lights:{operation:'cell',index:0},rps:{operation:'rock'},snake:{operation:'down'},pong:{operation:'step'},breakout:{operation:'step'},maze:{operation:'right'}};
 for(const profile of Object.values(ARCADE_GAMES)){const game=newArcadeGame(profile.game,rng),before=structuredClone(game),next=arcadeMove(game,actions[profile.game],rng);assert.equal(next.moves,1,profile.game);assert.deepEqual(game,before,'moves never mutate the prior state');const view=arcadePresentation(next);assert.ok(view.text.length>0);assert.ok(view.cells?.length||view.buttons.length||next.done);}
});
test('card values, board wins, memory pairs and first-safe minefield use server rules',()=>{
 assert.equal(blackjackValue([12,25,8]),12);assert.equal(blackjackValue([12,9]),21);
 let game=newArcadeGame('memory',rng);for(let value=0;value<8;value++){const pair=game.board.flatMap((v,i)=>v===value?[i]:[]);for(const index of pair)game=arcadeMove(game,{operation:'cell',index},rng);}assert.equal(game.done,true);assert.equal(game.score,8);
 game=newArcadeGame('tictactoe',rng);game.board=[1,1,0,2,2,0,0,0,0];game=arcadeMove(game,{operation:'cell',index:2},rng);assert.equal(game.score,10);assert.equal(game.done,true);
 game=newArcadeGame('mines',rng);game=arcadeMove(game,{operation:'cell',index:0},rng);assert.notEqual(game.board[0],-1);assert.equal(game.board.filter(v=>v===-1).length,6);for(let i=1;i<36;i++)if(game.board[i]!==-1)game=arcadeMove(game,{operation:'cell',index:i},rng);assert.equal(game.done,true);assert.equal(game.score,30);
 assert.throws(()=>arcadeMove(newArcadeGame('lights',rng),{operation:'cell',index:-1},rng),/valid/);
});
test('maze exit is reachable and directional games reject invalid controls',()=>{
 let game=newArcadeGame('maze',rng);const queue=[[11,[]]],seen=new Set([11]);let path;while(queue.length){const [cell,steps]=queue.shift();if(cell===98){path=steps;break;}for(const [operation,delta]of Object.entries({up:-10,down:10,left:-1,right:1})){const next=cell+delta;if(next>=0&&next<100&&!game.board[next]&&!seen.has(next)){seen.add(next);queue.push([next,[...steps,operation]]);}}}assert.ok(path);for(const operation of path)game=arcadeMove(game,{operation},rng);assert.equal(game.done,true);assert.equal(game.score,25);
 assert.throws(()=>arcadeMove(newArcadeGame('snake',rng),{operation:'left'},rng),/reverse/);assert.throws(()=>arcadeMove(newArcadeGame('pong',rng),{operation:'spin'},rng),/paddle/);
});
test('room snapshots hide future cards, hidden memory pairs and mines without mutating server state',()=>{
 const devices={cards:{gamers:{a:{game:newArcadeGame('blackjack',rng)}}},memory:{gamers:{a:{game:newArcadeGame('memory',rng)}}},mines:{gamers:{a:{game:newArcadeGame('mines',rng)}}}};
 const projected=projectArcadeDevices(devices);assert.equal(projected.cards.gamers.a.game.deck,undefined);assert.equal(projected.cards.gamers.a.game.dealer[1],null);assert.ok(projected.memory.gamers.a.game.board.every(value=>value===null));assert.ok(projected.mines.gamers.a.game.board.every(value=>value===null));assert.ok(devices.cards.gamers.a.game.deck.length>0);
});
test('custom builder objects retain arcade templates and share machines with independent player rounds',()=>{
 const scene={objects:[{id:'custom',modelId:'my-drawn-cabinet',position:{x:0,y:0,z:0},functionalSettings:{behavior:'interact',device:'blackjack-cabinet'}}]},saved=JSON.parse(JSON.stringify(scene)),manifest=compileBuilderScene(saved),sim={actors:{custom:{id:'custom',position:{x:0,y:0,z:0},active:true}}},player={username:'Alice',position:{x:0,y:0,z:2},tokens:{MZK:123}};
 const run=(actorId,operation,fields={},now=10000)=>deviceCommand(sim,manifest,player,actorId,{entityId:'custom',operation,revision:sim.devices?.custom.revision||0,...fields},now);
 run('a','open');run('a','start');run('b','start',{},11000);assert.ok(sim.devices.custom.gamers.a.game);assert.ok(sim.devices.custom.gamers.b.game);const b=structuredClone(sim.devices.custom.gamers.b.game);run('a','stand',{},12000);assert.deepEqual(sim.devices.custom.gamers.b.game,b);assert.equal(player.tokens.MZK,123);
 assert.throws(()=>run('a','start',{revision:0},13000),/changed/);player.position.x=100;assert.throws(()=>run('a','start',{},14000),/reach/);
});
test('retro machines advance automatically with step commands and template changes reset the machine state',()=>{
 for(const type of ['snake','pong','breakout']){const game=newArcadeGame(type,rng),next=arcadeMove(game,{operation:'step'},rng);assert.notDeepEqual(type==='snake'?next.body:next.ball,type==='snake'?game.body:game.ball);}
 const sim={actors:{cabinet:{id:'cabinet',active:true,position:{x:0,y:0,z:0}}}},player={username:'A',position:{x:0,y:0,z:0}},manifest={actors:[{objectId:'cabinet',modelId:'blackjack-cabinet',gameplay:{device:'blackjack-cabinet'}}]};
 deviceCommand(sim,manifest,player,'a',{entityId:'cabinet',operation:'start',revision:0},10000);assert.equal(sim.devices.cabinet.game,'blackjack');manifest.actors[0].gameplay.device='retro-snake-cabinet';deviceCommand(sim,manifest,player,'a',{entityId:'cabinet',operation:'open'},11000);assert.equal(sim.devices.cabinet.game,'snake');assert.equal(sim.devices.cabinet.gamers.a.game,undefined);
});
