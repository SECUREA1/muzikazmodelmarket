import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {layoutHeight} from '../public/js/environments/layout-terrain.js';
import {FIRING_RANGE_TARGETS,FIRING_RANGE_LANES,firingRangeLocations,firingRangeTargetOffset,rangeLocalToWorld} from '../public/js/firing-range.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const environment={id:'firing-range',spawn:{x:0,y:0,z:16.2},builderScene:{layout:'firing-range',mapSize:40,objects:[]}};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.00001,`${actual} is ${expected}`);
const targetRoot=(root,id)=>root.getObjectByName(`RANGE_TARGET_${id}`);

test('authored range targets share exact server dimensions and a flat floor',()=>{
 const range=createBuilderLand(environment);range.updateMatrixWorld(true);
 assert.equal(range.userData.firingRange.targets.length,10);
 for(const {x}of FIRING_RANGE_LANES)for(const z of [-15.45,-13.72,0,13.8,16.2])near(layoutHeight('firing-range',x,z),0);
 for(const definition of FIRING_RANGE_TARGETS){
  const target=targetRoot(range,definition.id);assert.ok(target);near(target.position.x,definition.position.x);near(target.position.y,definition.position.y);near(target.position.z,definition.position.z);
  assert.equal(target.userData.collisionDisabled,true);
  if(definition.kind==='paper'){near(target.children[0].geometry.parameters.radius,definition.radius);const bullseye=target.children.find(part=>part.userData.hitZone==='bullseye');near(bullseye.geometry.parameters.radius,.09);}
  else{const head=target.children.find(part=>part.userData.hitZone==='bullseye');near(head.position.y,2.18);near(head.geometry.parameters.radius,.3);}
 }
 assert.equal(range.getObjectByName('RANGE_LIVE_SCOREBOARD').userData.liveScoreboard,true);
 assert.equal(range.getObjectByName('RANGE_LOBBY_LIVE_SCOREBOARD').userData.liveScoreboard,true);
 const mannequins=[];range.traverse(part=>{if(part.userData.rangeTrainee)mannequins.push(part);});assert.equal(mannequins.length,0);
});

test('scoreboard canvases show server scores, clocks and live spectators',()=>{
 const previous=globalThis.document,labels=[];
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(value){labels.push(value);}})})};
 try{
  const range=createBuilderLand(environment),board=range.getObjectByName('RANGE_LIVE_SCOREBOARD'),version=board.material.map.version;
  range.userData.setFiringRangeState({state:'live',settings:{mode:'moving',rounds:3},round:2,endsAt:62000,remainingMs:57000,participants:{a:{role:'player'},b:{role:'spectator'}},leaderboard:[{id:'a',name:'Live shooter',rank:1,score:760,accuracy:80}]},{locationId:'main',serverTime:5000});
  assert.deepEqual(range.userData.rangeDisplay,{state:'LIVE',mode:'MOVING',clock:'00:57',round:2,rounds:3,players:1,spectators:1,leaders:[{rank:1,name:'Live shooter',score:760,accuracy:80}],locationId:'main'});
  assert.ok(labels.includes('0760'));assert.ok(labels.some(label=>label.includes('Live shooter')));assert.ok(labels.includes('00:57'));assert.ok(!labels.includes('0840'));
  assert.ok(board.material.map.version>version);
  range.userData.updateFiringRangeEffects(6100);assert.equal(range.userData.rangeDisplay.clock,'00:56');
  assert.equal(board.material.map,range.getObjectByName('RANGE_LOBBY_LIVE_SCOREBOARD').material.map);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('open practice displays an unlimited clock while countdowns and tournaments keep real timers',()=>{
 const range=createBuilderLand(environment);
 range.userData.setFiringRangeState({state:'live',settings:{mode:'freeplay'},remainingMs:0,endsAt:0},{serverTime:5000});
 assert.equal(range.userData.rangeDisplay.clock,'OPEN');
 range.userData.updateFiringRangeEffects(125000);assert.equal(range.userData.rangeDisplay.clock,'OPEN');
 range.userData.setFiringRangeState({state:'countdown',settings:{mode:'freeplay'},startsAt:128000,remainingMs:3000},{serverTime:125000});
 assert.equal(range.userData.rangeDisplay.clock,'00:03');
 range.userData.updateFiringRangeEffects(126100);assert.equal(range.userData.rangeDisplay.clock,'00:02');
 range.userData.setFiringRangeState({state:'live',settings:{mode:'precision'},endsAt:187000,remainingMs:60000},{serverTime:127000});
 assert.equal(range.userData.rangeDisplay.clock,'01:00');
 range.userData.updateFiringRangeEffects(128100);assert.equal(range.userData.rangeDisplay.clock,'00:59');
});

test('moving targets and shot flashes follow the authoritative clock without moving paper targets',()=>{
 const range=createBuilderLand(environment),settings={mode:'moving',targetSpeed:1.4};
 range.userData.setFiringRangeState({state:'live',settings,remainingMs:45000,lastShot:{targetId:'silhouette-2',locationId:'main',at:1800}},{serverTime:2000});
 for(const definition of FIRING_RANGE_TARGETS){const expected=firingRangeTargetOffset(definition,2000,settings),actual=targetRoot(range,definition.id).position;near(actual.x,expected.x);near(actual.y,expected.y);near(actual.z,expected.z);}
 assert.equal(targetRoot(range,'silhouette-2').userData.lastHit,true);
 assert.equal(targetRoot(range,'paper-2').userData.lastHit,false);
 range.userData.updateFiringRangeEffects(2401);assert.equal(targetRoot(range,'silhouette-2').userData.lastHit,false);
 const moving=targetRoot(range,'silhouette-2').position.x;range.userData.updateFiringRangeEffects(3200);assert.notEqual(targetRoot(range,'silhouette-2').position.x,moving);near(targetRoot(range,'paper-2').position.x,0);
});

test('embedded transformed firing-range scenes keep their target origins in sync with server locations',()=>{
 const module=createBuilderModel('scene-firing-range');assert.ok(module);
 const placement={id:'placed-range',modelId:'scene-firing-range',position:{x:47,y:2,z:-31},rotation:{x:0,y:.68,z:0},scale:{x:1.3,y:1.3,z:1.3}};
 module.position.set(...Object.values(placement.position));module.rotation.set(...Object.values(placement.rotation));module.scale.set(...Object.values(placement.scale));module.updateMatrixWorld(true);
 const location=firingRangeLocations({builderScene:{objects:[placement]}})[0],scene=module.children[0];
 assert.equal(typeof scene.userData.setFiringRangeState,'function');
 scene.userData.setFiringRangeState({state:'live',settings:{mode:'moving',targetSpeed:1.1}},{locationId:placement.id,serverTime:2000});module.updateMatrixWorld(true);
 for(const definition of FIRING_RANGE_TARGETS){const point=rangeLocalToWorld(location,firingRangeTargetOffset(definition,2000,{mode:'moving',targetSpeed:1.1})),actual=targetRoot(module,definition.id).getWorldPosition(new THREE.Vector3());near(actual.x,point.x);near(actual.y,point.y);near(actual.z,point.z);}
});

test('lobby arrivals and shooting positions remain clear while real walls and benches stay solid',()=>{
 const collision=new ServerBuilderCollision(),spawn=collision.safeSpawn(environment,environment.spawn);near(spawn.x,0);near(spawn.z,16.2);near(spawn.y,.02);
 const physical=collision.world(environment);assert.ok(!physical.floors.some(part=>part.userData.rangeTarget));
 assert.ok(physical.floors.some(part=>part.name==='RANGE_SHOOTING_BENCH'));assert.ok(physical.floors.some(part=>part.name==='RANGE_BALLISTIC_BACKSTOP'));
 for(const lane of FIRING_RANGE_LANES){
  const floor=collision.groundAt(environment,lane.position,{entry:true});near(floor.x,lane.x);near(floor.z,13.8);near(floor.y,.02);
  const origin={x:lane.x,y:1.62,z:13.8},target={x:lane.x,y:1.55,z:-13.72},delta=[target.x-origin.x,target.y-origin.y,target.z-origin.z],distance=Math.hypot(...delta);
  assert.equal(collision.blocksShot(environment,origin,delta.map(value=>value/distance),distance),false);
 }
});

test('lobby consoles expose real interaction intents and safe local positions for transformed maps',()=>{
 const range=createBuilderLand(environment),entries=range.userData.rangeInteractions;
 assert.deepEqual(entries.map(entry=>entry.intent).sort(),['range-armory','range-settings','range-start','range-watch']);
 assert.equal(new Set(entries.map(entry=>entry.id)).size,4);
 for(const entry of entries){assert.ok(entry.position.z>15);assert.ok(entry.radius>=2);const meshes=[];range.traverse(part=>{if(part.userData.rangeInteraction===entry)meshes.push(part);});assert.equal(meshes.length,1);}
});
