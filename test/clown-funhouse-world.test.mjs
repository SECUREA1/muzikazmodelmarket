import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {clownFunhouseWorld} from '../clown-funhouse-world.mjs';
import {FUNHOUSE_ID,FUNHOUSE_STATIONS,FUNHOUSE_WALLS} from '../public/js/clown-funhouse-config.js';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {outdoorProfile} from '../public/js/environments/outdoor-scenery.js';
import {isCleanCommonsEnvironment} from '../public/js/rad-tox-rules.js';
import {isCleanSportsEnvironment} from '../public/js/sports-worlds.js';
import {mapSectorKind,mapWheelSvg} from '../public/js/map-wheel-svg.js';
import {filterWorldCategory,filterWorlds} from '../public/js/world-map-picker.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import * as THREE from '../public/vendor/three/three.module.min.js';

test('funhouse remains a permanent shared destination with a carnival category and no generated roads',async t=>{
 const world=clownFunhouseWorld(),records=JSON.parse(await readFile('public/models/environments/environments.json','utf8'));
 assert.deepEqual(records.find(record=>record.id===FUNHOUSE_ID),world);
 assert.equal(world.playableSize,120);assert.equal(world.builderScene.mapSize,120);
 assert.equal(new Set(FUNHOUSE_STATIONS.map(station=>station.id)).size,FUNHOUSE_STATIONS.length);
 const directory=await mkdtemp(join(tmpdir(),'funhouse-directory-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(directory,'atlas.json')),[]);
 const listed=environments.find(environment=>environment.id===FUNHOUSE_ID);
 assert.ok(listed?.permanent);assert.equal(listed.roomId,FUNHOUSE_ID);assert.equal(listed.multiplayer,true);
 assert.ok(listed.travelPortals.length>=2);assert.deepEqual(listed.streets,[]);
 assert.equal(mapSectorKind(listed),'funhouse');assert.equal(filterWorldCategory([{env:listed}],'funhouse').length,1);
 assert.equal(filterWorldCategory([{env:listed}],'games').length,1);assert.equal(filterWorlds([{env:listed}],'clown water').length,1);
 assert.match(mapWheelSvg([{env:listed,count:0}],FUNHOUSE_ID),/data-kind="funhouse"/);
 assert.match(await readFile('.'+world.thumbnailUrl,'utf8'),/<svg/);
 for(const environment of [world,{builderScene:{layout:'clown-funhouse'}},{builderScene:{layout:'grand-floor',sourceLayout:'clown-funhouse'}}]){
  assert.equal(outdoorProfile(environment),null);assert.ok(isCleanCommonsEnvironment(environment));assert.ok(isCleanSportsEnvironment(environment));
 }
});

test('every funhouse station has a clear physical approach and the maze can be walked from the arrival lane',()=>{
 const world=clownFunhouseWorld(),collision=new ServerBuilderCollision();
 const land=createBuilderLand(world),bounds=new THREE.Box3().setFromObject(land);
 assert.deepEqual([bounds.min.x,bounds.max.x,bounds.min.z,bounds.max.z],[-60,60,-60,60],'authored footprint preserves shared station coordinates during client normalization');
 land.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[]))material.dispose?.();});
 const spawn=collision.safeSpawn(world,world.spawn);assert.ok(Math.hypot(spawn.x,spawn.z-48)<.01);
 for(const station of FUNHOUSE_STATIONS){
  const floor=collision.groundAt(world,station.position,{entry:true});assert.ok(floor,station.id+' has a floor');
  assert.ok(collision.hasBodyClearance(world,floor,.38),station.id+' approach is clear');
 }
 let position={...spawn};
 const walkTo=(x,z)=>{
  for(let attempt=0;attempt<1600&&Math.hypot(x-position.x,z-position.z)>.03;attempt++){
   const gap=Math.hypot(x-position.x,z-position.z),step=Math.min(.16,gap),next={...position,x:position.x+(x-position.x)/gap*step,z:position.z+(z-position.z)/gap*step};
   const resolved=collision.resolve(world,position,next,{});
   assert.ok(Math.hypot(resolved.x-position.x,resolved.z-position.z)>Math.min(.05,gap*.5),'maze route blocked at '+JSON.stringify(position));position=resolved;
  }
  assert.ok(Math.hypot(x-position.x,z-position.z)<.03,'reached '+x+','+z);
 };
 for(const [x,z]of [[0,40],[0,0],[0,-17],[-8,-19],[-4.5,-19],[-4.5,-28],[-22.5,-28],[-22.5,-38],[-18,-38]])walkTo(x,z);
 // An actual partition stops a direct shortcut through the mirror wall.
 let stop={x:-15,y:.02,z:-22};for(let step=0;step<30;step++)stop=collision.resolve(world,stop,{...stop,z:stop.z-.15},{});
 assert.ok(stop.z>-24,'mirror partition is solid');
 const wall=FUNHOUSE_WALLS.find(wall=>wall.id==='maze-turn-one');assert.equal(wall.z,-24);
});
