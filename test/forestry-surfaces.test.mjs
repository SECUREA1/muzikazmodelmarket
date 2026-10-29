import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {forestrySurface,forestrySurfaceMaps,FORESTRY_SURFACE_KINDS,FORESTRY_SURFACE_VERSION} from '../public/js/forest-harvest-surfaces.js';
import {finishNativeSurfaces} from '../public/js/native-surface-finish.js';
import {finishGroundLandscape} from '../public/js/ground-landscape-design.js';
import * as T from '../public/vendor/three/three.module.min.js';
const dir=new URL('../public/images/forest-harvest/surfaces/',import.meta.url);
function dimensions(data){
 assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
 const type=data.toString('ascii',12,16);
 if(type==='VP8X')return [data.readUIntLE(24,3)+1,data.readUIntLE(27,3)+1];
 if(type==='VP8 ')return [data.readUInt16LE(26)&16383,data.readUInt16LE(28)&16383];
 if(type==='VP8L'){const bits=data.readUInt32LE(21);return [(bits&16383)+1,((bits>>>14)&16383)+1];}
 throw Error('Unsupported WebP '+type);
}
test('forestry ships real high resolution color, normal and roughness maps with a mobile albedo tier',async()=>{
 const manifest=JSON.parse(await readFile(new URL('manifest.json',dir)));assert.equal(manifest.version,FORESTRY_SURFACE_VERSION);
 for(const kind of FORESTRY_SURFACE_KINDS){
  const leaf=/foliage/i.test(kind);
  assert.deepEqual(dimensions(await readFile(new URL(kind+'-albedo.webp',dir))),leaf?[1024,1024]:[2048,2048],kind);
  assert.deepEqual(dimensions(await readFile(new URL(kind+'-albedo-small.webp',dir))),[512,512],kind);
  if(!leaf){assert.deepEqual(dimensions(await readFile(new URL(kind+'-normal.webp',dir))),[1024,1024]);assert.deepEqual(dimensions(await readFile(new URL(kind+'-roughness.webp',dir))),[512,512]);}
 }
});
test('forestry native finishes preserve authored maps, share textures and isolate editable material colors',()=>{
 const first=forestrySurface('bark',0x73513b),second=forestrySurface('bark',0x3f2d24);
 assert.notEqual(first,second);assert.equal(first.map,second.map);assert.equal(first.normalMap,second.normalMap);
 const before=second.color.getHex();first.color.setHex(0xffffff);assert.equal(second.color.getHex(),before);
 const root=new T.Group(),floor=new T.Mesh(new T.BoxGeometry(10,.2,10),forestrySurface('soil',0x6d624c));floor.name='BUILDER_WALKABLE_FLOOR_forest-harvest';root.add(floor);
 const original={map:floor.material.map,normalMap:floor.material.normalMap,roughnessMap:floor.material.roughnessMap};
 finishNativeSurfaces(T,root,'forest-harvest');finishGroundLandscape(T,root,{source:'repository',builderScene:{layout:'forest-harvest'}});
 for(const [key,value]of Object.entries(original))assert.equal(floor.material[key],value,key+' survives native finish');
 const leaves=forestrySurface('foliage',0x68854b);assert.equal(leaves.alphaTest,.3);assert.equal(leaves.transparent,false);assert.equal(leaves.side,T.DoubleSide);assert.equal(leaves.map.userData.nativeSurfaceShared,true);
 assert.throws(()=>forestrySurfaceMaps('unknown'),/Unknown forestry surface/);
 floor.geometry.dispose();floor.material.dispose();first.dispose();second.dispose();leaves.dispose();
});

test('forestry haul roads use metre-scaled gravel and shared maps survive road replacement',async()=>{
 const {createServerStreets,replaceServerStreets}=await import('../public/js/environments/server-streets.js');
 const streets=[{id:'haul',name:'Haul',from:{x:0,z:0},to:{x:0,z:40},width:8}],root=new T.Group();root.userData.proceduralLand=true;root.userData.forestHarvest=true;
 replaceServerStreets(root,streets);
 const road=root.getObjectByName('FOREST_GRAVEL_HAUL_ROAD');assert.ok(road);assert.equal(road.material.userData.forestrySurface,'gravel');
 const uv=road.geometry.attributes.uv,position=road.geometry.attributes.position;for(let i=0;i<uv.count;i++){assert.equal(uv.getX(i),position.getX(i)/4);assert.equal(uv.getY(i),position.getZ(i)/4);}
 let disposed=false;road.material.map.addEventListener('dispose',()=>{disposed=true;});replaceServerStreets(root,streets);assert.equal(disposed,false);
 const ordinary=createServerStreets(streets);assert.equal(ordinary.getObjectByName('FOREST_GRAVEL_HAUL_ROAD'),undefined);
});
