import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createFiringRange,FIRING_RANGE_ROOM_WALLS} from '../public/js/firing-range-model.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {isCollisionMesh} from '../public/js/environments/collision-policy.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const environment={id:'firing-range',layout:'firing-range',builderScene:{layout:'firing-range',mapSize:80,objects:[]}};
const dispose=root=>{const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(mesh=>{if(mesh.geometry)geometries.add(mesh.geometry);for(const material of [].concat(mesh.material||[])){materials.add(material);for(const item of Object.values(material))if(item?.isTexture)textures.add(item);}});for(const item of [...geometries,...materials,...textures])item.dispose();};

test('back room doorway admits a full player capsule while walls and service counters remain solid',()=>{
  const collision=new ServerBuilderCollision();
  const walk=(start,axis,direction,steps)=>{let point={...start};for(let step=0;step<steps;step++)point=collision.resolve(environment,point,{...point,[axis]:point[axis]+direction*.1});return point;};
  const doorway=walk({x:0,y:.08,z:15},'z',1,65);
  assert.ok(doorway.z>21,'a player can walk from the lanes through the centre doorway into the room');
  assert.ok(doorway.y<.15,'entry does not snap the player onto a roof or counter');
  const frontWall=walk({x:10,y:.08,z:15},'z',1,25);
  assert.ok(frontWall.z<16,'the solid front wall beside the doorway stops movement');
  const sideWall=walk({x:18,y:.08,z:22},'x',1,25);
  assert.ok(sideWall.x<19,'the back room side wall stops movement');
  const counter=walk({x:-13,y:.08,z:22},'z',1,30);
  assert.ok(counter.z<23.7,'the marketplace counter remains a physical surface');
  dispose(collision.world(environment).root);
});

test('all physical room walls and counters have the same bounds exported for authoritative scoring',()=>{
  const root=createFiringRange(THREE);root.updateMatrixWorld(true);
  const solids=[];root.traverse(mesh=>{if(mesh.isMesh&&isCollisionMesh(mesh))solids.push(mesh);});
  for(const definition of FIRING_RANGE_ROOM_WALLS){
    const expected=new THREE.Box3(new THREE.Vector3(definition.x-definition.size[0]/2,definition.y-definition.size[1]/2,definition.z-definition.size[2]/2),new THREE.Vector3(definition.x+definition.size[0]/2,definition.y+definition.size[1]/2,definition.z+definition.size[2]/2));
    assert.ok(solids.some(mesh=>{const bounds=new THREE.Box3().setFromObject(mesh);return bounds.min.distanceTo(expected.min)<1e-6&&bounds.max.distanceTo(expected.max)<1e-6;}),definition.name);
  }
  dispose(root);
});

test('marketplace, care, armory and course action spots are inside the walkable room and can be toggled without changing collision',()=>{
  const root=createFiringRange(THREE),disabled=createFiringRange(THREE,{settings:{market:false}});
  assert.deepEqual(root.userData.rangeStations.map(item=>item.action).sort(),['armory','care','console','market']);
  for(const entry of root.userData.rangeStations){
    assert.ok(entry.position.x>-19&&entry.position.x<19&&entry.position.z>16.2&&entry.position.z<27.5);
    const group=root.getObjectByName(`RANGE_STATION_${entry.id.toUpperCase()}`);
    assert.equal(group.userData.rangeStation,entry);assert.equal(entry.enabled,true);assert.ok(entry.radius>=2);
    assert.ok(group.getObjectByName(`RANGE_ACTION_SPOT_${entry.id.toUpperCase()}`).position.y>.085,'glowing pads remain above the checker finish');
    assert.ok(entry.position.y>=.04,'interaction positions remain above the physical floor');
    assert.equal(isCollisionMesh(group.getObjectByName(`RANGE_ACTION_SPOT_${entry.id.toUpperCase()}`)),false,'action markers do not trap the player');
  }
  assert.equal(disabled.getObjectByName('RANGE_STATION_MARKET').visible,false);
  assert.equal(disabled.userData.rangeStations.find(item=>item.id==='market').enabled,false);
  const solidCount=scene=>{let count=0;scene.traverse(mesh=>{if(mesh.isMesh&&isCollisionMesh(mesh))count++;});return count;};
  assert.equal(solidCount(root),solidCount(disabled));
  dispose(root);dispose(disabled);
});

test('the rear room checker finish uses a single noncolliding textured mesh',()=>{
  const previous=globalThis.document;
  try{
    globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
    const root=createFiringRange(THREE),floor=root.getObjectByName('RANGE_CHECKERED_FLOOR_FINISH');
    assert.ok(floor?.isMesh);assert.equal(floor.material.map.isCanvasTexture,true);assert.equal(floor.material.map.wrapS,THREE.RepeatWrapping);assert.equal(isCollisionMesh(floor),false);
    assert.ok(root.getObjectByName('BUILDER_WALKABLE_FLOOR_FIRING_RANGE_BACKROOM'));
    dispose(root);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('the published map and Builder dressing use the complete shared range with all five playable lanes',async()=>{
  const script=await readFile(new URL('../environment-builder.js',import.meta.url),'utf8');
  const start=script.indexOf('function addFiringRangeDressing('),end=script.indexOf('// Rasterize the reusable SVG finishes',start);
  const worldDressing=new THREE.Group();
  const createBuilderDressing=new Function('THREE','createFiringRange','sceneData','worldDressing',script.slice(start,end)+'\naddFiringRangeDressing(null,()=>0);return worldDressing;');
  const editor=createBuilderDressing(THREE,createFiringRange,{gameplay:{}},worldDressing);
  const published=createBuilderLand(environment);
  for(const root of [editor,published]){
    assert.ok(root.getObjectByName('MUZIKAZ_FORCE_TRAINING_RANGE'));
    assert.ok(root.getObjectByName('RANGE_STATION_MARKET'));
    const lanes=new Set();root.traverse(mesh=>{if(mesh.userData.rangeTarget)lanes.add(mesh.userData.rangeLane);});assert.equal(lanes.size,5);
  }
  assert.equal(published.userData.rangeStations.length,4);
  const previewLanes=[];editor.traverse(node=>{if(node.userData.reactiveTarget&&!node.isMesh)previewLanes.push(node);});assert.equal(previewLanes.length,5,'Builder qualification retains five selectable lanes');
  dispose(editor);dispose(published);
});
