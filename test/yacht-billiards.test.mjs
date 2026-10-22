import test from 'node:test';
import assert from 'node:assert/strict';
import {createYachtBilliards,shootYachtBilliards,stepYachtBilliards} from '../public/js/yacht-billiards.js';
import {yachtGameCommand,yachtTableWorldPoint,stepYachtGames} from '../server-yacht-games.mjs';
import {watercraftInteractionPoint,watercraftInteractionReach} from '../public/js/harbor-water.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {projectServerActor} from '../public/js/server-scene-projection.js';
import * as THREE from '../public/vendor/three/three.module.min.js';
test('billiards collisions, cushions and pockets run to rest with serializable shared state',()=>{
 const game=createYachtBilliards();shootYachtBilliards(game,0,.7);assert.throws(()=>shootYachtBilliards(game,0,.5),/Wait/);
 for(let i=0;i<800&&game.moving;i++)stepYachtBilliards(game,1/60);
 assert.equal(game.moving,false);assert.equal(game.shots,1);assert.ok(game.balls.slice(1).some(ball=>ball.x!==2.24||ball.z!==6.9));assert.deepEqual(JSON.parse(JSON.stringify(game)),game);
 game.balls[1]={...game.balls[1],x:1.16,z:8,vx:0,vz:0};game.moving=true;stepYachtBilliards(game,.1);assert.equal(game.balls[1].sunk,true);assert.equal(game.score>=100,true);
});
test('table commands validate location, deck, speed, inputs and revision and move the rendered balls',()=>{
 const boat={id:'yacht',modelId:'harbor-yacht',position:{x:200,y:0,z:80},rotation:{y:.8},active:true,boating:{speed:0}},sim={actors:{yacht:boat}},point=yachtTableWorldPoint(boat),player={position:{x:point.x,y:1.97,z:point.z+1}};
 const command={entityId:boat.id,operation:'shoot',revision:0,angle:0,power:.6};
 assert.throws(()=>yachtGameCommand(sim,{position:{x:0,y:0,z:0}},command),/Walk/);
 assert.throws(()=>yachtGameCommand(sim,{position:{...point,y:0}},command),/Walk/);
 boat.boating.speed=1;assert.throws(()=>yachtGameCommand(sim,player,command),/Anchor/);boat.boating.speed=0;
 assert.throws(()=>yachtGameCommand(sim,player,{...command,angle:NaN}),/valid/);
 yachtGameCommand(sim,player,command);assert.equal(boat.yachtBilliards.shots,1);assert.throws(()=>yachtGameCommand(sim,player,command),/changed/);
 const before=boat.yachtBilliards.balls[0].z;stepYachtGames(sim.actors,.25);assert.ok(boat.yachtBilliards.balls[0].z<before);
 const root=createBuilderModel('harbor-yacht'),group=new THREE.Group();group.add(root);projectServerActor(root,boat);updateBuilderModels(group,1);
 assert.equal(root.userData.boatRig.billiardBalls[0].position.z,boat.yachtBilliards.balls[0].z);
 for(let i=0;i<100;i++)stepYachtGames(sim.actors,.1);
 yachtGameCommand(sim,player,{entityId:'yacht',operation:'rack',revision:boat.yachtBilliards.revision});assert.equal(boat.yachtBilliards.shots,0);
});
test('boarding from pier and taking the upstairs helm have separate reach',()=>{
 const boat={modelId:'harbor-yacht',position:{x:141,y:0,z:99},rotation:{y:0}};
 assert.equal(watercraftInteractionReach(boat,{x:141,y:0,z:116},24),24);
 const inside={x:141,y:1.97,z:111},helm=watercraftInteractionPoint(boat,inside);assert.deepEqual(helm,{x:141,y:5.025,z:90});assert.equal(watercraftInteractionReach(boat,inside,24),3);
});
