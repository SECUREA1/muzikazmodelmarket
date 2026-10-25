import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {populateMapMachine} from '../server-map-machine.mjs';
import {hasMapMachine} from '../public/js/map-machine.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {deviceCommand} from '../server-interactive-devices.mjs';
test('every repository map and empty builder map gets exactly one playable floor-supported arcade',async()=>{
 const maps=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));maps.push({id:'aligned-base-map',builderScene:{layout:'repository-base',baseEnvironment:maps[0],baseTransform:{x:120,y:5,z:-80,rotation:90,scale:1.1},mapSize:80,objects:[]}});maps.push({id:'empty-map',builderScene:{layout:'grand-floor',mapSize:80,objects:[]}});
 const collision=new ServerBuilderCollision();
 for(const map of maps){const sim={actors:{}},manifest=compileBuilderScene(map.builderScene||{}),before=JSON.stringify(map);
  populateMapMachine(sim,manifest,map,collision,100000);const machines=Object.values(sim.actors);assert.equal(machines.length,1,map.id);const actor=machines[0];assert.ok(actor.runtimeMachine);assert.ok(collision.groundAt(map,actor.position));
  populateMapMachine(sim,manifest,map,collision,100100);assert.equal(Object.keys(sim.actors).length,1);assert.equal(JSON.stringify(map),before,'authored maps stay unchanged');
  const gameplay={actors:[actor.definition]},player={username:'Test',position:{...actor.position}};
  deviceCommand(sim,gameplay,player,'test',{entityId:actor.id,operation:'open'},100000);deviceCommand(sim,gameplay,player,'test',{entityId:actor.id,operation:'start',revision:0},100100);
  assert.equal(sim.devices[actor.id].gamers.test.game.type,'tictactoe');deviceCommand(sim,gameplay,player,'test',{entityId:actor.id,operation:'cell',index:0,revision:1},100300);assert.equal(sim.devices[actor.id].gamers.test.game.moves,1);
 }
});
test('existing authored or player-deployed machines prevent and replace the automatic fixture',()=>{
 const collision=new ServerBuilderCollision(),map={id:'has-machine',builderScene:{layout:'grand-floor',objects:[]}},sim={actors:{}},manifest=compileBuilderScene({objects:[]});
 populateMapMachine(sim,manifest,map,collision,100000);const fallback=Object.values(sim.actors)[0];assert.ok(fallback);
 sim.actors.owned={id:'owned',active:true,spawned:true,asset:{buildAssetId:'retro-pong-cabinet'},position:{x:8,y:0,z:8}};populateMapMachine(sim,manifest,map,collision,100100);
 assert.equal(sim.actors[fallback.id],undefined);assert.ok(sim.actors.owned);
 assert.ok(hasMapMachine([{modelId:'custom',functionalSettings:{device:'retro-pong-cabinet'}}]));
});
test('moving irrelevant loot never rebuilds placed solid collision geometry',()=>{
 const collision=new ServerBuilderCollision(),actors={chair:{id:'chair',spawned:true,active:true,asset:{buildAssetId:'armchair'},position:{x:4,y:0,z:0}},coin:{id:'coin',spawned:true,active:true,position:{x:0,y:0,z:0},loot:{currency:'MZK'}}};
 const before=collision.placedWorld(actors),geometry=collision.placedCache.world;assert.ok(before.meshes.length,'include solid geometry in the cache check');
 actors.coin.position.x=1;const after=collision.placedWorld(actors);assert.equal(collision.placedCache.world,geometry);assert.equal(after.root,before.root);assert.equal(after.meshes.length,before.meshes.length);assert.ok(after.meshes.every((mesh,index)=>mesh===before.meshes[index]));
});

test('an existing authored arcade machine suppresses fallback placement',()=>{const environment={id:'authored',builderScene:{layout:'grand-floor'}},manifest=compileBuilderScene({objects:[{id:'pong',modelId:'retro-pong-cabinet',position:{x:0,y:0,z:0},functionalSettings:{behavior:'interact'}}]}),sim={actors:{pong:{id:'pong',modelId:'retro-pong-cabinet',active:true,position:{x:0,y:0,z:0}}}};populateMapMachine(sim,manifest,environment,{},100000);assert.deepEqual(Object.keys(sim.actors),['pong']);});

test('audio and market devices preserve access to a playable automatic arcade',()=>{
 for(const modelId of ['shared-jukebox','market-atm']){const environment={id:modelId,builderScene:{layout:'grand-floor'}},sim={actors:{authored:{id:'authored',modelId,active:true,position:{x:8,y:0,z:8}}}};populateMapMachine(sim,compileBuilderScene({objects:[]}),environment,new ServerBuilderCollision(),100000);assert.equal(sim.actors.authored.modelId,modelId);assert.equal(Object.values(sim.actors).filter(actor=>actor.runtimeMachine).length,1);}
});
