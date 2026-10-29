import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {finishNativeSurfaces,ensureNativeSurfaceUVs} from '../public/js/native-surface-finish.js';
import {createBuilderModel,createGeneratedAsset} from '../public/js/builder-models-3d.js';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
import {NATIVE_DESIGN_VERSION} from '../public/js/native-design-profile.js';
import {nativeRenderStats,disposeNativeAuditModel} from '../scripts/audit-native-designs.mjs';

test('native texture coordinates cover each box face without changing physical geometry or transforms',()=>{
 const geometry=new THREE.BoxGeometry(4,2,3).toNonIndexed();geometry.deleteAttribute('uv');
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x7b8c91}));mesh.position.set(4,2,-3);mesh.rotation.set(.2,.4,.1);mesh.scale.set(2,1,3);
 const root=new THREE.Group();root.add(mesh);root.updateMatrixWorld(true);
 const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),vertices=Array.from(position.array),matrix=mesh.matrixWorld.toArray(),bounds=new THREE.Box3().setFromObject(root).clone();
 try{
  finishNativeSurfaces(THREE,root,'native-box');
  const uv=geometry.getAttribute('uv');assert.ok(uv);assert.equal(uv.count,position.count);assert.ok(uv.array.every(Number.isFinite));
  for(let i=0;i<uv.count;i+=3){const area=Math.abs((uv.getX(i+1)-uv.getX(i))*(uv.getY(i+2)-uv.getY(i))-(uv.getX(i+2)-uv.getX(i))*(uv.getY(i+1)-uv.getY(i)));assert.ok(area>.1,'every face has real 2D texture coverage');}
  assert.equal(mesh.geometry,geometry);assert.equal(geometry.getAttribute('position'),position);assert.equal(geometry.getAttribute('normal'),normal);assert.deepEqual(Array.from(position.array),vertices);assert.deepEqual(mesh.matrixWorld.toArray(),matrix);assert.deepEqual(new THREE.Box3().setFromObject(root),bounds);
  assert.equal(ensureNativeSurfaceUVs(THREE,geometry),false);assert.equal(geometry.getAttribute('uv'),uv,'the finishing pass is idempotent');
 }finally{disposeNativeAuditModel(root);}
});

test('authored UVs and texture images remain intact while protected surfaces receive no generated coordinates',()=>{
 const root=new THREE.Group(),authored=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshStandardMaterial({map:new THREE.Texture()})),uv=authored.geometry.getAttribute('uv'),image=authored.material.map;
 root.add(authored);
 const protectedMeshes=[];
 for(const flag of ['mediaScreen','mediaSurface','collisionOnly']){const geometry=new THREE.BoxGeometry();geometry.deleteAttribute('uv');const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.userData[flag]=true;protectedMeshes.push(mesh);root.add(mesh);}
 try{finishNativeSurfaces(THREE,root,'native-props');assert.equal(authored.geometry.getAttribute('uv'),uv);assert.equal(authored.material.map,image);for(const mesh of protectedMeshes)assert.equal(mesh.geometry.getAttribute('uv'),undefined);}
 finally{disposeNativeAuditModel(root);}
});

test('advanced aircraft, ships, landscape, character and material packs have usable native texture coordinates',()=>{
 const ids=['shipping-feeder','shipping-container','shipping-tanker','diamond-da40','piper-cub','harbor-yacht','harbor-patrol','harbor-fishing-boat','harbor-skiff','harbor-sailboat','alpine-mountain','corsair-aircraft','terrain-cliff','terrain-crater','palm-cluster','forest-ranger','desert-merchant','spectral-ghost','friendly-ghost','material:corner-wedge'];
 for(const id of ids){const root=createBuilderModel(id);try{const stats=nativeRenderStats(root);assert.ok(stats.meshes&&stats.texturedSurfaces&&stats.nativeTexturedMeshes,id+' has actual mapped geometry');assert.equal(stats.missingNativeUVs,0,id);assert.equal(stats.invalidNativeUVs,0,id);root.traverse(mesh=>{const materials=[].concat(mesh.material||[]);if(!mesh.isMesh||mesh.userData.collisionOnly||!materials.some(material=>material?.userData.nativeSurfaceVersion===NATIVE_DESIGN_VERSION&&(material.map||material.roughnessMap||material.bumpMap||material.normalMap)))return;const uv=mesh.geometry.getAttribute('uv');assert.equal(uv.count,mesh.geometry.getAttribute('position').count,id);assert.ok(uv.array.every(Number.isFinite),id);});}finally{disposeNativeAuditModel(root);}}
});

test('degenerate or invalid geometry cannot introduce non-finite UV coordinates',()=>{
 const flat=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,2,0,0,0,0,2],3));
 assert.equal(ensureNativeSurfaceUVs(THREE,flat),true);assert.ok(flat.getAttribute('uv').array.every(Number.isFinite));
 const invalid=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([NaN,0,0,2,0,0,0,0,2],3));
 assert.equal(ensureNativeSurfaceUVs(THREE,invalid),false);assert.equal(invalid.getAttribute('uv'),undefined);
 flat.dispose();invalid.dispose();
});

test('every generated recipe pack renders current mapped surfaces rather than metadata alone',async()=>{
 const registry=JSON.parse(await readFile(new URL('../public/models/game-asset-registry.json',import.meta.url),'utf8')),generated=registry.assets.filter(asset=>asset.generated);
 assert.ok(generated.length>30,'the complete persistent generated pack is included');
 for(const asset of generated){const root=createGeneratedAsset(normalizeCatalogModel(asset,0));try{const stats=nativeRenderStats(root);assert.ok(stats.meshes&&stats.texturedSurfaces,asset.assetId);assert.equal(root.userData.nativeSurfaceFinish.version,NATIVE_DESIGN_VERSION,asset.assetId);assert.equal(stats.missingNativeUVs,0,asset.assetId);assert.equal(stats.invalidNativeUVs,0,asset.assetId);assert.ok([...stats.bounds.min,...stats.bounds.max].every(Number.isFinite),asset.assetId);}finally{disposeNativeAuditModel(root);}}
});

test('office and police glazing remain glass while native snow, rock and named ice retain their surfaces',()=>{
 const office=createBuilderModel('construction-site-office'),glazing=[];
 try{
  office.traverse(node=>{for(const material of [].concat(node.material||[]))if(material.transparent&&material.userData.nativeSurfaceVersion===NATIVE_DESIGN_VERSION)glazing.push({name:node.name,surface:material.userData.nativeSurface,texture:material.map?.userData.nativeMaterialSurface});});
  assert.equal(glazing.length,3,'the real construction office has two finished windows and door glazing');
  assert.ok(glazing.every(part=>part.surface==='glass'&&part.texture==='glass'),JSON.stringify(glazing));
 }finally{disposeNativeAuditModel(office);}
 const root=new THREE.Group();
 const samples=[['POLICE_WINDOW',true,'glass'],['OFFICE_GLAZING',true,'glass'],['ALPINE_ICE_SHEET',true,'ice'],['GLACIER_EDGE',true,'ice'],['SNOW_PATCH',false,'snow'],['ROCK_FACE',false,'stone'],['SNOW_EDGE_STONE',false,'stone']];
 for(const [name,transparent]of samples){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({transparent,opacity:transparent?.4:1}));mesh.name=name;root.add(mesh);}
 try{finishNativeSurfaces(THREE,root,'construction-and-mountain-materials');for(const [index,[name,,kind]]of samples.entries()){assert.equal(root.children[index].material.userData.nativeSurface,kind,name);assert.equal(root.children[index].material.map.userData.nativeMaterialSurface,kind,name+' uses the intended texture image');}}
 finally{disposeNativeAuditModel(root);}
});
