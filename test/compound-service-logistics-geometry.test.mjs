import test from 'node:test';
import assert from 'node:assert/strict';
import {mountainCompoundWorld} from '../factory-testing-world.mjs';
import {FACTORY_LOGISTICS_STATIONS,logisticsStations} from '../public/js/factory-logistics-config.js';
import {COMPOUND_ID,COMPOUND_GATE} from '../public/js/factory-test-config.js';
import {createMountainCompoundLand} from '../public/js/mountain-compound-model.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))if(material)resources.add(material);});for(const resource of resources)resource.dispose();}
function walk(collision,map,position,waypoints,label){
 for(const [x,z]of waypoints){const distance=Math.hypot(x-position.x,z-position.z),steps=Math.ceil(distance/.2),dx=(x-position.x)/Math.max(1,steps),dz=(z-position.z)/Math.max(1,steps);for(let i=0;i<steps;i++){const next=collision.resolve(map,position,{x:position.x+dx,y:position.y,z:position.z+dz});position={x:next.x,y:Number.isFinite(next.floorY)?next.floorY:next.y,z:next.z};assert.ok(Math.abs(position.y-.02)<.025,label+' stays on the ordinary entry floor');assert.ok(position.z>COMPOUND_GATE.boundaryZ,label+' stays outside deep access');}assert.ok(Math.hypot(position.x-x,position.z-z)<.15,label+' reaches '+x+','+z+'; actual '+position.x+','+position.z);}
 return position;
}

test('compound receiving uses one independently placed terminal with the canonical clear operator approach',()=>{
 const map=mountainCompoundWorld(),expected=FACTORY_LOGISTICS_STATIONS.find(station=>station.mapId===COMPOUND_ID&&station.kind==='compound');assert.ok(expected);
 const terminal=map.builderScene.objects.find(object=>object.id===expected.id);assert.ok(terminal,'facility receiving is a placed logistics station');
 assert.equal(terminal.asset?.buildAssetId||terminal.modelId,'factory-export-terminal');
 assert.deepEqual(terminal.position,{x:24,y:0,z:27.5});assert.equal(terminal.functionalSettings.logisticsStation,'compound');
 const stations=logisticsStations(map),station=stations.find(value=>value.objectId===expected.id);assert.ok(station);assert.deepEqual(station.position,{x:24,y:.02,z:31});
 const marker=map.builderScene.layoutMeta.locations.find(value=>value.id===expected.id);assert.ok(marker,'receiving is visible on the local map');assert.equal(marker.x,24);assert.equal(marker.z,31);
 const scene=createMountainCompoundLand(map);let duplicates=0;scene.traverse(node=>{if(node.userData.factoryLogisticsModel)duplicates++;});assert.equal(duplicates,0,'the architecture does not recreate interactive terminal or freight-crate objects');dispose(scene);
});

test('entry corridor, service doorway and receiving apron have flat supported floor and player clearance',()=>{
 const map=mountainCompoundWorld(),collision=new ServerBuilderCollision();
 for(const [id,x,z]of [['corridor turn',3.1,31],['east service doorway',8,31],['receiving aisle',16,31],['receiving operator',24,31],['surface return',0,35]]){
  const floor=collision.groundAt(map,{x,y:.02,z},{entry:true});assert.ok(floor,id+' has floor');assert.ok(Math.abs(floor.y-.02)<.025,id+' remains on entry level');assert.ok(collision.hasBodyClearance(map,floor,.38),id+' leaves player clearance');
 }
 // The new doorway is bounded; neighboring corridor walls and the service
 // hall's outer wall still prevent walking through the architecture.
 const corridorWall=collision.resolve(map,{x:7,y:.02,z:20},{x:9,y:.02,z:20});assert.ok(corridorWall.x<8,'checkpoint corridor wall remains solid');
 const hallWall=collision.resolve(map,{x:35,y:.02,z:31},{x:37,y:.02,z:31});assert.ok(hallWall.x<36,'service hall outer wall remains solid');
 dispose(collision.world(map).root);
});

test('receiving is reachable from the return lift through its real east doorway and supports the same return route',()=>{
 const map=mountainCompoundWorld(),collision=new ServerBuilderCollision();let position=collision.safeSpawn(map,map.spawn);
 position=walk(collision,map,position,[[3.1,35],[3.1,31],[24,31]],'receiving visit');assert.ok(Math.hypot(position.x-24,position.z-31)<.15);
 position=walk(collision,map,position,[[3.1,31],[3.1,35],[0,35]],'surface return');assert.ok(Math.hypot(position.x,position.z-35)<.15);
 dispose(collision.world(map).root);
});
