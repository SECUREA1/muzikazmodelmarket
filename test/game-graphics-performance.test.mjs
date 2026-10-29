import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import {bevelledBoxGeometry,finishGameItem} from '../public/js/game-item-finish.js';
import {createAlpineMountain} from '../public/js/alpine-mountain-model.js';
import {compileVisibleGameScene} from '../public/js/game-scene-warmup.js';
import {disposeModelResources} from '../public/js/game-graphics-resources.js';

test('bevelled boxes keep six material draws and preserve each face assignment',()=>{
 const geometry=bevelledBoxGeometry(T,2,3,4),normal=geometry.attributes.normal;
 assert.equal(geometry.groups.length,6);
 assert.equal(geometry.attributes.position.count/3,44);
 for(const group of geometry.groups)for(let i=group.start;i<group.start+group.count;i++){
  const n=new T.Vector3().fromBufferAttribute(normal,i),axis=Math.floor(group.materialIndex/2),component=n.getComponent(axis);
  assert.ok(Math.abs(component)>=Math.max(Math.abs(n.x),Math.abs(n.y),Math.abs(n.z))-1e-6);
  assert.equal(group.materialIndex%2,component<0?1:0);
 }
 geometry.dispose();
});

test('small instanced cosmetic blocks keep their native triangle budget while bodywork is bevelled',()=>{
 const root=new T.Group(),material=new T.MeshStandardMaterial(),instances=new T.InstancedMesh(new T.BoxGeometry(),material,224);
 instances.userData.nativeDesignDetail=true;
 const a=new T.Mesh(new T.BoxGeometry(2,3,4),material),b=new T.Mesh(new T.BoxGeometry(2,3,4),material);
 root.add(instances,a,b);finishGameItem(T,root);
 assert.equal(instances.geometry.index.count/3,12,'tread instances must not multiply chamfer triangles');
 assert.equal(a.geometry.name,'MZK_BEVELLED_BOX');assert.equal(a.geometry,b.geometry,'equal body shapes share buffers within one item');
 disposeModelResources(root);
});

test('reused mountain shape data preserves exact geometry with independently disposable placement resources',()=>{
 const a=createAlpineMountain(T),b=createAlpineMountain(T);
 assert.deepEqual(a.userData,b.userData);
 for(let i=0;i<a.children.length;i++){
  assert.notEqual(a.children[i].geometry,b.children[i].geometry);
  assert.notEqual(a.children[i].material,b.children[i].material);
  for(const key of ['position','normal','uv','color']){
   assert.notEqual(a.children[i].geometry.attributes[key].array,b.children[i].geometry.attributes[key].array);
   assert.deepEqual(a.children[i].geometry.attributes[key].array,b.children[i].geometry.attributes[key].array);
  }
 }
 let disposed=0;b.children[0].geometry.addEventListener('dispose',()=>disposed++);
 disposeModelResources(a);assert.equal(disposed,0);disposeModelResources(b);assert.equal(disposed,1);
});

test('shader preparation includes the entry view and dynamic rigs, retaining the real scene lighting',async()=>{
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,.1,100),material=new T.MeshStandardMaterial(),geometry=new T.BoxGeometry();
 camera.position.z=5;scene.add(camera,new T.HemisphereLight());
 const front=new T.Mesh(geometry,material),far=new T.Mesh(geometry,material),hidden=new T.Group(),hiddenMesh=new T.Mesh(geometry,material),dynamic=new T.Mesh(geometry,material),otherLayer=new T.Mesh(geometry,material);
 far.position.x=100;hidden.visible=false;hidden.add(hiddenMesh);dynamic.position.x=100;dynamic.frustumCulled=false;otherLayer.layers.set(2);
 scene.add(front,far,hidden,dynamic,otherLayer);
 front.userData.builderRoot=scene;
 const before=scene.children.slice();let compiled;
 const result=await compileVisibleGameScene({compileAsync:async(target,view,lighting)=>{const nodes=[];target.traverse(node=>nodes.push(node));compiled={nodes,view,lighting};}},scene,camera);
 assert.deepEqual(compiled.nodes,[front,dynamic]);assert.equal(compiled.view,camera);assert.equal(compiled.lighting,scene);
 assert.equal(result.meshCount,2);assert.deepEqual(scene.children,before);assert.equal(front.parent,scene);assert.equal(front.userData.builderRoot,scene);
 disposeModelResources(scene);
});

test('unload releases model resources once without invalidating shared library textures',()=>{
 const root=new T.Group(),owned=new T.Texture(),shared=new T.Texture(),sports=new T.Texture();shared.userData.nativeSurfaceShared=true;sports.userData.sportsSurfaceShared=true;
 const geometry=new T.BoxGeometry(),material=new T.MeshStandardMaterial({map:shared,bumpMap:owned,roughnessMap:owned,emissiveMap:sports}),counts={owned:0,shared:0,sports:0,geometry:0,material:0};
 for(const [key,resource]of Object.entries({owned,shared,sports,geometry,material}))resource.addEventListener('dispose',()=>counts[key]++);
 root.add(new T.Mesh(geometry,material),new T.Mesh(geometry,material));disposeModelResources(root);
 assert.deepEqual(counts,{owned:1,shared:0,sports:0,geometry:1,material:1});shared.dispose();sports.dispose();
});

test('game preparation retains cosmetic shadow opt-outs and warms the entry view',async()=>{
 const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 assert.match(source,/child\.castShadow=!child\.userData\.nativeDesignDetail&&!child\.userData\.collisionDisabled/);
 assert.match(source,/await compileVisibleGameScene\(renderer,scene,displayCamera\(\)\)/);
});
