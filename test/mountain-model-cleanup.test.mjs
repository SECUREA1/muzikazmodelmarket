import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {createAlpineMountain} from '../public/js/alpine-mountain-model.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';
import {placementBounds} from '../public/js/placed-item-collision.js';
import {MOUNTAIN_DESIGN_IDS,MOUNTAIN_DESIGN_VERSION,MOUNTAIN_TEMPLATE_LAYOUT_IDS} from '../public/js/mountain-design-profile.js';
import {disposeMountainModel,mountainCompatibility,mountainGeometryStats,mountainPose} from '../scripts/audit-mountain-designs.mjs';

const ids=['alpine-mountain','terrain-cliff','terrain-crater','terrain-snowbank'];
const identity=[0,0,0,0,0,0,1,1,1,1];
const key=point=>point.map(value=>Math.round(value*100000)).join(',');
function surfaceTopology(meshes){
 const edges=new Map(),vertices=new Map();let volume=0;
 for(const mesh of meshes){
  const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index,count=index?.count||position.count;
  for(let i=0;i<count;i+=3){
   const points=[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(position,index?index.getX(i+offset):i+offset)),keys=points.map(point=>key(point.toArray()));
   volume+=points[0].dot(points[1].clone().cross(points[2]))/6;
   for(let j=0;j<3;j++){
    const a=keys[j],b=keys[(j+1)%3],ordered=a<b?[a,b]:[b,a],edgeKey=ordered.join('|');
    if(!edges.has(edgeKey))edges.set(edgeKey,{count:0,direction:0});const edge=edges.get(edgeKey);edge.count++;edge.direction+=a<b?1:-1;
    if(!vertices.has(a))vertices.set(a,new Set());if(!vertices.has(b))vertices.set(b,new Set());vertices.get(a).add(b);vertices.get(b).add(a);
   }
  }
 }
 return {edges,vertices,volume};
}

test('all mountain upgrades retain native placement, ownership and gameplay identities',()=>{
 assert.deepEqual([...MOUNTAIN_DESIGN_IDS],ids);assert.deepEqual([...MOUNTAIN_TEMPLATE_LAYOUT_IDS],['mountain-pass']);
 const dimensions={'alpine-mountain':[6,5,5.5],'terrain-cliff':[4.8,3.2,3.5],'terrain-crater':[5,.8,5],'terrain-snowbank':[4,1.2,2.4]};
 for(const id of ids){
  const root=createBuilderModel(id);try{
   assert.deepEqual(mountainPose(root),identity,id+' preserves placement origin and scale');assert.equal(root.userData.mountainDesign?.version,MOUNTAIN_DESIGN_VERSION);assert.equal(root.userData.mountainDesign.id,id);
   const stats=mountainGeometryStats(root);assert.equal(stats.invalidAttributes,false,id+' has finite vertices, normals, UVs and transforms');assert.equal(stats.uvMissing,0,id+' has usable UVs on each drawn surface');assert.equal(stats.degenerateTriangles,0,id+' has no zero-area faces');assert.equal(stats.opposingNormals,0,id+' normals follow face winding');assert.equal(stats.lights,0,id+' uses shared world lighting');
   const compatibility=mountainCompatibility(id),functionData={behavior:'decor',action:'none',interactionKey:'e',interactionDistance:3};
   assert.deepEqual(compatibility.native,{id,dimensions:dimensions[id],behavior:'decor',function_data:functionData});assert.deepEqual(compatibility.offers,[{sku:'backpack:builder-'+id,priceMzk:100,useCostMzk:1,function_data:functionData}]);
  }finally{disposeMountainModel(root);}
 }
});

test('the Alpine upgrade is one closed outward-facing rock and snow shell with an exact shared snowline',()=>{
 const root=createAlpineMountain(THREE);try{
  const meshes=[];root.traverse(node=>{if(node.isMesh)meshes.push(node);});assert.equal(meshes.length,2);const stats=mountainGeometryStats(root);assert.ok(stats.triangles>120&&stats.triangles<=3500,'the sculpted mountain stays within its fixed two-mesh triangle budget');assert.equal(stats.degenerateTriangles,0);assert.equal(stats.uvMissing,0);assert.equal(stats.opposingNormals,0);
  const rock=root.getObjectByName('ALPINE_ROCK_RIDGES'),snow=root.getObjectByName('ALPINE_SNOW_CAP');assert.ok(rock&&snow);assert.equal(root.userData.alpineMountain,true);assert.equal(snow.userData.alpineSnow,true);
  const topology=surfaceTopology(meshes);assert.ok(topology.volume>1,'the closed shell faces outwards');for(const [edgeKey,edge]of topology.edges){assert.equal(edge.count,2,'one continuous shell shares each edge twice: '+edgeKey);assert.equal(edge.direction,0,'adjacent faces traverse their shared edge in opposite directions');}
  const visited=new Set(),pending=[topology.vertices.keys().next().value];while(pending.length){const vertex=pending.pop();if(visited.has(vertex))continue;visited.add(vertex);for(const next of topology.vertices.get(vertex))if(!visited.has(next))pending.push(next);}assert.equal(visited.size,topology.vertices.size,'buttresses and summit belong to the same grounded shell');
  const boundary=mesh=>[...surfaceTopology([mesh]).edges].filter(([,edge])=>edge.count===1).map(([edgeKey])=>edgeKey).sort(),rockSeam=boundary(rock),snowSeam=boundary(snow);assert.ok(rockSeam.length>=12,'the rock/snow seam follows the sculpted slope');assert.deepEqual(rockSeam,snowSeam,'rock and snow share the same snowline without a floating or overlapping cap');
 }finally{disposeMountainModel(root);}
});

test('Alpine sculpting preserves the grounded summit, broad snow and airport collision envelope',()=>{
 const root=createBuilderModel('alpine-mountain');try{
  const bounds=new THREE.Box3().setFromObject(root,true),physical=placementBounds(THREE,root);assert.deepEqual(bounds.min.toArray(),[-3,0,-2.75]);assert.deepEqual(bounds.max.toArray(),[3,5,2.75]);assert.deepEqual(physical.min.toArray(),bounds.min.toArray());assert.deepEqual(physical.max.toArray(),bounds.max.toArray());
  const snow=root.getObjectByName('ALPINE_SNOW_CAP'),snowBounds=new THREE.Box3().setFromObject(snow,true),size=snowBounds.getSize(new THREE.Vector3());assert.ok(snowBounds.min.y>=2.9&&snowBounds.min.y<3.1);assert.equal(snowBounds.max.y,5);assert.ok(size.x>2.7&&size.z>2.4&&size.y>1.8,'snow covers a broad part of the upper mountain');
  const summit=[];root.traverse(node=>{if(!node.isMesh)return;const p=node.geometry.attributes.position;for(let i=0;i<p.count;i++)if(p.getY(i)>4.8)summit.push([p.getX(i),p.getZ(i)]);});assert.ok(summit.length);assert.ok(summit.every(([x,z])=>Math.abs(x+.3)<.001&&Math.abs(z+.1)<.001),'the highest silhouette remains the pointed authored summit');
 }finally{disposeMountainModel(root);}
});

test('mountain stone and snow retain appropriate surface maps and independently editable instance materials',()=>{
 for(const id of ids){
  const source=createBuilderModel(id),copy=cloneBuilderRuntime(source);try{
   const originals=[],copies=[];source.traverse(node=>{if(node.isMesh)originals.push(node);});copy.traverse(node=>{if(node.isMesh)copies.push(node);});assert.equal(originals.length,copies.length);
   let classified=0;
   for(let index=0;index<originals.length;index++){
    const node=originals[index],snow=/ALPINE_SNOW_CAP|SCULPTED_SNOW_DRIFT|WINDSWEPT_DRIFT_CREST/.test(node.name),stone=/ALPINE_ROCK_RIDGES|CLIFF_SEDIMENT_LAYER|MINERAL_(?:SEAM|VEIN)|FRACTURED_IMPACT_BOWL|CRATER_EJECTA|SNOW_EDGE_STONE/.test(node.name),materials=[].concat(node.material),clones=[].concat(copies[index].material);
    for(let j=0;j<materials.length;j++){
     const material=materials[j];assert.notEqual(clones[j],material,id+' owned copies isolate their editable material');
     if(snow||stone){classified++;assert.equal(material.userData.nativeSurface,snow?'snow':'stone',id+' '+node.name+' has the intended physical surface');assert.ok(material.map&&material.roughnessMap,id+' '+node.name+' has actual surface maps');}
    }
   }
   assert.ok(classified,id+' includes the cleaned primary surface');const before=originals[0].material.color.getHex();copies[0].material.color.setHex(before^0xffffff);assert.equal(originals[0].material.color.getHex(),before,id+' repainting a copy preserves the source');
  }finally{disposeMountainModel(source);disposeMountainModel(copy);}
 }
});
