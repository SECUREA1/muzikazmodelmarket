import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {neonMarina} from '../neon-marina.mjs';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {createHarborLand} from '../public/js/environments/harbor-land.js';
import {isWatercraft,harborWaterAt,watercraftFootprint} from '../public/js/harbor-water.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
const marina=neonMarina(),world={id:'marina-properties',proceduralLand:true,spawn:{x:124,y:0,z:30},builderScene:{layout:'community-park',mapSize:256,objects:marina.objects,layoutMeta:{harbor:marina.harbor,locations:marina.locations}}};
test('waterfront properties are detailed destructible Builder construction with ten launches, three fishing boats, a patrol slip and a separate yacht berth',()=>{
 assert.ok(marina.objects.length>=330&&marina.objects.length<700);assert.equal(new Set(marina.objects.map(o=>o.id)).size,marina.objects.length);assert.equal(marina.objects.filter(isWatercraft).length,15);assert.equal(marina.objects.filter(boat=>boat.modelId==='harbor-fishing-boat').length,3);assert.equal(marina.objects.filter(boat=>['harbor-skiff','harbor-sailboat'].includes(boat.modelId)).length,10);
 for(const id of new Set(marina.objects.map(o=>o.modelId))){const model=createBuilderModel(id);assert.ok(model,id);model.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[]))material?.dispose();});}
 for(const object of marina.objects.filter(o=>o.modelId.startsWith('material:')))assert.equal(object.functionalSettings.destructible,true,object.id);
 for(const boat of marina.objects.filter(isWatercraft)){assert.ok(watercraftFootprint(boat.position,boat.rotation.y,boat).every(point=>harborWaterAt(world,point)),boat.id);assert.equal(boat.position.y,0);if(boat.id.match(/-boat-[012]$/)||boat.modelId==='harbor-patrol')assert.equal(boat.rotation.y,-Math.PI/2);else if(boat.modelId==='harbor-fishing-boat')assert.equal(boat.rotation.y,0);else if(boat.modelId==='harbor-yacht')assert.equal(boat.rotation.y,0);else assert.equal(boat.rotation.y,Math.PI/2);}
 for(const id of ['yacht-club','harbormaster','waterfront-cafe','beacon-lodge','palm-retreat','north-haven-house']){const parts=marina.objects.filter(o=>o.id.startsWith('public-experience-marina-'+id+'-'));assert.ok(parts.length>=30,id);assert.ok(parts.some(o=>o.modelId==='material:glass-wall'));assert.ok(parts.some(o=>o.functionalSettings.behavior==='seat'));assert.ok(parts.some(o=>o.id.includes('roof')));}
});
test('all new properties have a clear doorway with a safe floor and a map arrival near the entrance',()=>{
 const collision=new ServerBuilderCollision();
 for(const place of marina.locations.filter(place=>place.arrival&&place.description?.startsWith('Walk-in '))){
  const front=place.x+place.width/2,point=collision.groundAt(world,{x:front-.7,y:1,z:place.z});assert.ok(point,place.id+' doorway floor');assert.ok(point.y>=.19&&point.y<.4,place.id+' platform surface');
  assert.ok(collision.hasBodyClearance(world,point,.3),place.id+' open doorway');assert.ok(place.arrival.x>front&&Math.abs(place.arrival.z-place.z)<.1);const arrival=collision.meetingPosition(world,place.arrival);assert.ok(Math.hypot(arrival.x-place.arrival.x,arrival.z-place.arrival.z)<13,place.id+' map arrival');assert.ok(arrival.y>=0);
 }
});
test('harbor waves animate only visual shading while real land, shores and swim-floor colliders stay fixed',()=>{
 const land=createHarborLand(world),sea=land.getObjectByName('HARBOR_WATER_VISUAL');assert.equal(sea.position.y,-.18);assert.equal(sea.userData.collisionDisabled,true);assert.equal(sea.userData.collider,false);assert.equal(sea.material.isMeshStandardMaterial,true);
 const floor=land.getObjectByName('BUILDER_WALKABLE_FLOOR_HARBOR_MAIN_ISLAND');assert.equal(floor.position.y,0);assert.equal(land.getObjectByName('BUILDER_WALKABLE_FLOOR_HARBOR_SWIM').position.y,-.65);assert.equal(land.children.filter(child=>child.userData.shoreline).length,40);
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>\n#include <roughnessmap_fragment>'};sea.material.onBeforeCompile(shader);assert.ok(shader.fragmentShader.includes('harborFoam'));assert.equal(shader.uniforms.harborIslands.value.length,marina.harbor.islands.length+1);assert.equal(shader.uniforms.harborIslands.value[0].z,128,'mainland participates in the same shore uniform as the islands');land.userData.updateHarborEffects(12);assert.equal(shader.uniforms.harborTime.value,12);land.userData.updateHarborEffects(20,true);assert.equal(shader.uniforms.harborTime.value,0);assert.equal(sea.position.y,-.18);assert.ok(new THREE.Box3().setFromObject(floor).min.y>-.01);
});
