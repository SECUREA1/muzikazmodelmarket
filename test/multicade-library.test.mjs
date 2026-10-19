import {createDeviceDemo} from '../public/js/device-demos.js';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {populateMapMachine} from '../server-map-machine.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCADE_LIBRARY} from '../public/js/arcade-library.js';
import {EXTRA_ARCADE_GAMES,newExtraGame,moveExtraGame,projectExtraGame} from '../public/js/extra-arcade-games.js';
import {newArcadeGame,arcadeMove,projectArcadeDevices} from '../public/js/arcade-rules.js';
import {arcadePresentation} from '../public/js/arcade-games.js';
import {defaultMachineObject,hasMapMachine} from '../public/js/map-machine.js';
import {deviceCommand} from '../server-interactive-devices.mjs';
const rng=n=>0;
test('fallback cabinet has 30 unique selectable games, including exactly 15 new games',()=>{
 assert.equal(EXTRA_ARCADE_GAMES.length,15);assert.equal(ARCADE_LIBRARY.length,30);assert.equal(new Set(ARCADE_LIBRARY.map(g=>g.id)).size,30);
 const machine=defaultMachineObject({x:0,y:0,z:0});assert.equal(machine.functionalSettings.device,'commons-arcade');assert.equal(hasMapMachine([machine]),true);
 assert.equal(hasMapMachine([{modelId:'shared-video-player'},{modelId:'market-atm'}]),false);assert.equal(hasMapMachine([{modelId:'video-poker-table'}]),true);
 for(const entry of EXTRA_ARCADE_GAMES){const game=newArcadeGame(entry.game,rng),view=arcadePresentation(projectExtraGame(game));assert.equal(game.type,entry.game);assert.equal(game.done,false);assert.ok(view.text);assert.ok(Array.isArray(view.buttons));if(view.cells)assert.ok(view.columns>0);}
});
test('all fifteen added games have working server-validated completion paths',()=>{
 const cases={
 merge2048:{patch:{board:[1024,1024,...Array(14).fill(0)]},command:{operation:'left'}},
 sliding8:{patch:{board:[1,2,3,4,5,6,7,0,8]},command:{operation:'cell',index:8}},
 reversi:{patch:{board:[0,2,...Array(62).fill(1)]},command:{operation:'cell',index:0}},
 mancala:{patch:{board:[0,0,0,0,0,1,20,0,0,0,0,0,0,15]},command:{operation:'cell',index:5}},
 nim:{patch:{board:[1,0,0]},command:{operation:'take',index:0}},
 hangman:{patch:{word:'NEON',guesses:['N','E']},command:{operation:'guess',text:'O'}},
 scramble:{patch:{word:'NEON'},command:{operation:'guess',text:'NEON'}},
 codebreaker:{patch:{code:'1234'},command:{operation:'guess',text:'1234'}},
 battleship:{patch:{ships:[0,1,2,3,4,5,6],shots:[0,1,2,3,4,5],hits:[0,1,2,3,4,5]},command:{operation:'cell',index:6}},
 peg:{patch:{board:[1,1,0,...Array(46).fill(-1)],selected:0},command:{operation:'cell',index:2}},
 sudoku4:{patch:{board:[1,2,3,4,3,4,1,2,2,3,4,1,4,1,2,3],givens:[]},command:{operation:'check'}},
 dicepoker:{patch:{board:[6,6,6,6,6]},command:{operation:'bank'}},
 shutbox:{patch:{board:[1,2,0,0,0,0,0,0,0],target:3,selected:[0,1]},command:{operation:'close'}},
 dotsboxes:{patch:{board:[0,...Array(11).fill(1)],boxes:[0,1,2,2]},command:{operation:'cell',index:0}},
 simon:{patch:{sequence:Array(8).fill(0),stage:8,cursor:7,phase:'repeat'},command:{operation:'cell',index:0}}
 };
 for(const [type,{patch,command}]of Object.entries(cases)){const game={...newExtraGame(type,rng),...patch},before=structuredClone(game),next=arcadeMove(game,command,rng);assert.equal(next.done,true,type);assert.deepEqual(game,before,'input game remains unchanged: '+type);assert.equal(arcadePresentation(projectExtraGame(next)).buttons.length,0,type);}
});
test('secret words, codes, ship positions and repeat-stage sequence stay off public snapshots',()=>{
 for(const type of ['hangman','scramble','codebreaker','battleship','simon']){const game=newExtraGame(type,rng);if(type==='simon')game.phase='repeat';const result=projectArcadeDevices({cabinet:{gamers:{alice:{game}}}}).cabinet.gamers.alice.game;for(const key of ['word','code','ships'])assert.equal(result[key],undefined,type);if(type==='simon')assert.equal(result.sequence,undefined);if(type==='hangman')assert.equal(result.masked.length,game.word.length);assert.equal(game.done,false);}
});
test('multicade selection is shared, checks proximity and ownership, and supports existing practice games',()=>{
 const object=defaultMachineObject({x:0,y:0,z:0}),manifest={actors:[{objectId:object.id,modelId:object.modelId,gameplay:object.functionalSettings}]},sim={actors:{[object.id]:{...object,active:true}},players:{alice:{username:'Alice',position:{x:0,y:0,z:1},health:100,lastSeen:1000},bob:{username:'Bob',position:{x:0,y:0,z:1},health:100,lastSeen:1000}}};let now=1000;
 const send=(actor,operation,extra={})=>deviceCommand(sim,manifest,sim.players[actor],actor,{entityId:object.id,requestId:'r-'+now,operation,revision:sim.devices?.[object.id]?.revision||0,...extra},now+=200);
 send('alice','open');assert.equal(sim.devices[object.id].multiGame,true);
 for(const entry of ARCADE_LIBRARY){send('alice','select-game',{gameId:entry.id});const state=sim.devices[object.id];assert.equal(state.selectedGame,entry.id);const op=entry.kind==='arcade'?'start':entry.kind==='poker'?'deal':entry.kind==='slots'?'spin':'answer';send('alice',op,{answer:0});if(entry.kind==='arcade')assert.equal(state.gamers.alice.game.type,entry.id);}
 send('alice','select-game',{gameId:'memory'});send('alice','start');sim.players.alice.lastSeen=now;assert.throws(()=>send('bob','select-game',{gameId:'nim'}),/in use/);
 assert.throws(()=>send('alice','select-game',{gameId:'invented'}),/library/);sim.players.alice.position.x=20;assert.throws(()=>send('alice','start'),/within reach/);
});
test('sliding puzzles are reachable and malformed moves do not mutate sessions',()=>{
 for(let seed=1;seed<=12;seed++){let n=seed;const game=newExtraGame('sliding8',max=>{n=(n*1664525+1013904223)>>>0;return n%max;});const values=game.board.filter(Boolean);let inversions=0;for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)if(values[i]>values[j])inversions++;assert.equal(inversions%2,0);}
 const game=newExtraGame('codebreaker',rng),before=structuredClone(game);assert.throws(()=>moveExtraGame(game,{operation:'guess',text:'9999'},rng),/four digits/);assert.deepEqual(game,before);
});

test('a map with only media receives exactly one compiled multi-game cabinet',()=>{
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshBasicMaterial());floor.rotation.x=-Math.PI/2;floor.updateMatrixWorld(true);
 const collision={safeSpawn:()=>({x:0,y:0,z:0}),world:()=>({floors:[floor]}),placedWorld:()=>({meshes:[]}),groundAt:(_environment,p)=>({...p,y:0}),blocksShot:()=>false};
 const sim={actors:{video:{id:'video',modelId:'shared-video-player',active:true,position:{x:20,y:0,z:20}}}},manifest={actors:[]},environment={id:'test-world'};
 populateMapMachine(sim,manifest,environment,collision,1000);const machine=Object.values(sim.actors).find(actor=>actor.runtimeMachine);assert.ok(machine);assert.equal(machine.definition.gameplay.device,'commons-arcade');
 populateMapMachine(sim,manifest,environment,collision,2000);assert.equal(Object.values(sim.actors).filter(actor=>actor.runtimeMachine).length,1);
 sim.actors.authored={id:'authored',modelId:'retro-snake-cabinet',active:true,position:{x:10,y:0,z:10}};populateMapMachine(sim,manifest,environment,collision,3000);assert.equal(Object.values(sim.actors).filter(actor=>actor.runtimeMachine).length,0);assert.ok(sim.actors.authored);
 floor.geometry.dispose();floor.material.dispose();
});

test('the same complete game library remains playable in explicitly local solo previews',()=>{
 for(const profile of ARCADE_LIBRARY){const demo=createDeviceDemo(profile,rng);assert.ok(demo.view().text,profile.id);demo.reset();assert.ok(demo.view().text,profile.id);}
 const word=createDeviceDemo(ARCADE_LIBRARY.find(item=>item.id==='hangman'),rng);assert.ok(!word.view().text.includes('RHYTHM'));word.move('guess',undefined,'R');assert.ok(word.view().text.includes('R'));
});
