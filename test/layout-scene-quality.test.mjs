import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createLayoutTerrain,layoutHeight,createLayoutMaterial} from '../public/js/environments/layout-terrain.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {createServerStreets} from '../public/js/environments/server-streets.js';
import {generatedExperience} from '../generated-world-experiences.mjs';
const dispose=root=>root.traverse(o=>{o.geometry?.dispose();[].concat(o.material||[]).forEach(m=>m?.dispose());});
test('large terrain samples world coordinates and shares exact editor and gameplay vertices',async()=>{
 for(const layout of ['grand-floor','mountain-pass','deep-mine','community-park','urban-civic-quarter']){
  const geometry=createLayoutTerrain(layout,160,0x536254),root=createBuilderLand({id:layout,builderScene:{layout,mapSize:160,layoutMeta:{color:0x536254}}}),floor=root.children.find(n=>n.name.startsWith('BUILDER_WALKABLE_FLOOR'));
  assert.deepEqual(floor.geometry.attributes.position.array,geometry.attributes.position.array);
  const p=geometry.attributes.position;for(let i=0;i<p.count;i+=91)assert.ok(Math.abs(p.getZ(i)-layoutHeight(layout,p.getX(i),-p.getY(i)))<1e-6);
  assert.equal(geometry.parameters.width,160);assert.equal(geometry.attributes.color.count,p.count);assert.ok(new Set(geometry.attributes.color.array).size>20);geometry.dispose();dispose(root);
 }
 const editor=await readFile(new URL('../environment-builder.js',import.meta.url),'utf8');assert.ok(editor.includes('createLayoutTerrain(sceneData.layout,sceneData.mapSize'));assert.ok(editor.includes('const template=createBuilderLand('));assert.ok(!editor.includes('terrain.scale.set(scale,1,scale)'));
});
test('architectural detail and road paving are batched visual layers with original collision intact',()=>{
 const root=createBuilderLand({id:'studios',builderScene:{layout:'creator-studios',mapSize:80}}),detail=root.getObjectByName('LAYOUT_FACADE_DETAILS');assert.equal(detail.children.length,2);assert.equal(detail.userData.collisionDisabled,true);assert.ok(root.children.some(n=>n.name==='BUILDER_TEMPLATE_creator-studios'));
 const streets=createServerStreets([{name:'Promenade',from:{x:-16,z:0},to:{x:16,z:0},width:7}],{heightAt:(x)=>x*.02});assert.equal(streets.children.length,3);for(const mesh of streets.children){assert.equal(mesh.userData.streetVisual,true);for(const value of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value));}dispose(root);dispose(streets);
});
test('district palette upgrades preserve interaction targets and garden routes',()=>{
 const a=generatedExperience({id:'a',name:'A',atlasDistrict:{id:'studio-ridge'}}),b=generatedExperience({id:'b',name:'B',atlasDistrict:{id:'neon-docks'}});assert.notEqual(a.layoutMeta.color,b.layoutMeta.color);
 const ids=new Set(a.objects.map(o=>o.id));for(const item of a.objects){const p=item.functionalSettings?.portal;if(p?.destinationType==='object')assert.ok(ids.has(p.targetObjectId));}assert.equal(a.objects.find(o=>o.id==='public-experience-return-pad').position.z,48);
});

test('shared surface textures are deterministic and scale with map size without network access',()=>{
 const a=createLayoutMaterial('urban-downtown',80),b=createLayoutMaterial('urban-downtown',160);assert.deepEqual(a.map.image.data,b.map.image.data);assert.equal(b.map.repeat.x,a.map.repeat.x*2);assert.equal(a.vertexColors,true);a.map.dispose();b.map.dispose();a.dispose();b.dispose();
});
