import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';

const builderSource=await readFile(new URL('../environment-builder.js',import.meta.url),'utf8');
const helpers=builderSource.slice(builderSource.indexOf('function finishSportsRoot('),builderSource.indexOf('function addWorldDressing('));
function builderHelpers(applySportsSurfaces){
 return vm.runInNewContext(`${helpers}\n({finishSportsRoot,disposeSportsDressing})`,{applySportsSurfaces,renderer:{},console});
}

test('sports builder roots become usable before SVG finishes load, then finish once',async()=>{
 let complete,requests=0,finished=0;
 const pending=new Promise(resolve=>{complete=resolve});
 const {finishSportsRoot}=builderHelpers((root,options)=>{requests++;assert.equal(options.maxResolution,2048);assert.equal(options.theme,'hockey');return pending;});
 const root=new THREE.Group();
 assert.equal(finishSportsRoot(root,'hockey',()=>finished++),root);
 assert.equal(requests,1);assert.equal(finished,0);
 complete({applied:1,failed:0});await pending;await Promise.resolve();
 assert.equal(finished,1);
});

test('rebuilding sports dressing releases unique owned resources and retains shared SVG textures',()=>{
 const {disposeSportsDressing}=builderHelpers(()=>Promise.resolve());
 const shared=new THREE.Texture();shared.userData.sportsSurfaceShared=true;
 const owned=new THREE.Texture(),geometry=new THREE.BoxGeometry();
 const painted=new THREE.MeshStandardMaterial({map:shared,normalMap:owned});
 const other=new THREE.MeshStandardMaterial({map:owned});
 const count={shared:0,owned:0,geometry:0,painted:0,other:0};
 for(const [name,resource]of Object.entries({shared,owned,geometry,painted,other}))resource.addEventListener('dispose',()=>count[name]++);
 const root=new THREE.Group();
 root.add(new THREE.Mesh(geometry,[painted,other]),new THREE.Mesh(geometry,painted));
 disposeSportsDressing(root);
 assert.deepEqual(count,{shared:0,owned:1,geometry:1,painted:1,other:1});
});

test('world unloading preserves cached sports textures while releasing ordinary texture maps',async()=>{
 const source=await readFile(new URL('../public/js/environments/environment-loader.js',import.meta.url),'utf8');
 const method=source.slice(source.indexOf('  disposeMaterial(material)'),source.indexOf('  clearFloorEffects()'));
 const Loader=vm.runInNewContext(`(class {${method}})`);
 const shared=new THREE.Texture();shared.userData.sportsSurfaceShared=true;
 const ordinary=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map:shared,normalMap:ordinary});
 const count={shared:0,ordinary:0,material:0};
 for(const [name,resource]of Object.entries({shared,ordinary,material}))resource.addEventListener('dispose',()=>count[name]++);
 new Loader().disposeMaterial(material);
 assert.deepEqual(count,{shared:0,ordinary:1,material:1});
});
