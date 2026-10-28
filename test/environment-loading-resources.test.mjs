import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {EnvironmentLoader} from '../public/js/environments/environment-loader.js';

function fixture(){
 const loader=Object.assign(Object.create(EnvironmentLoader.prototype),{
  token:0,pendingLoads:new Set(),scene:new T.Scene(),camera:new T.PerspectiveCamera(),renderer:{capabilities:{getMaxAnisotropy:()=>1}},loader:{},serverAuthoritative:()=>true,localCollision:false,
  world:null,mixers:[],meshes:[],collisionMeshes:[],floorMeshes:[],supplementalCollisionRoots:[],onProgress(){},refreshFloorEffects(){},clearFloorEffects(){}
 });
 loader.createBuilderLand=()=>asset('builder').scene;return loader;
}
function asset(id){
 const scene=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(12,.2,12),new T.MeshStandardMaterial());mesh.name='walkable_floor';scene.add(mesh);return {id,scene,animations:[]};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('combined model worlds overlap at most two assets and retain source order with monotonic aggregate progress',async()=>{
 const loader=fixture(),started=[],pending=new Map(),progress=[];let active=0,maximum=0;
 loader.onProgress=value=>progress.push(value);
 loader.loadOne=(url,index,count,token,options)=>{
  started.push(url);active++;maximum=Math.max(maximum,active);options.onProgress(.45);options.onProgress(.2);
  return new Promise(resolve=>pending.set(url,()=>{active--;resolve(asset(url));}));
 };
 const loading=loader.loadModels(['base','roof','garden','annex']);assert.deepEqual(started,['base','roof']);
 pending.get('roof')();await tick();assert.deepEqual(started,['base','roof','garden']);
 pending.get('garden')();await tick();assert.deepEqual(started,['base','roof','garden','annex']);
 pending.get('annex')();pending.get('base')();const models=await loading;
 assert.equal(maximum,2);assert.deepEqual(models.map(model=>model.id),['base','roof','garden','annex']);assert.equal(progress.at(-1),100);
 assert.ok(progress.every((value,index)=>Number.isFinite(value)&&value>=0&&value<=100&&(!index||value>=progress[index-1])),'out-of-order chunks and smaller retry updates cannot move the loading meter backwards');
 for(const model of models)loader.disposeWorld(model.scene);
});

test('failed multi-asset streams abort their siblings and dispose completed or late models once',async()=>{
 const loader=fixture(),old=asset('current').scene;loader.world=old;loader.scene.add(old);
 const first=asset('first'),late=asset('late'),disposed={first:0,late:0};first.scene.children[0].geometry.addEventListener('dispose',()=>disposed.first++);late.scene.children[0].geometry.addEventListener('dispose',()=>disposed.late++);
 let finishFirst,rejectSecond,finishLate,lateSignal;
 loader.loadOne=(url,index,count,token,{signal})=>url==='first'?new Promise(resolve=>{finishFirst=resolve;}):url==='broken'?new Promise((resolve,reject)=>{rejectSecond=reject;}):new Promise(resolve=>{finishLate=resolve;lateSignal=signal;});
 const loading=loader.load({id:'broken-world',modelUrls:['first','broken','late'],spawn:{x:0,y:0,z:0}}),rejected=assert.rejects(loading,/missing model/);
 finishFirst(first);await tick();assert.ok(finishLate,'the queued asset begins when a slot opens');rejectSecond(Error('missing model'));await tick();assert.equal(lateSignal.aborted,true);
 finishLate(late);await rejected;assert.deepEqual(disposed,{first:1,late:1});assert.equal(loader.world,old);assert.equal(old.parent,loader.scene);assert.equal(loader.pendingLoads.size,0);loader.unload();
});

test('a newer world suppresses both obsolete parallel results and never eagerly compiles at the previous camera',async()=>{
 const loader=fixture(),pending=[],obsolete=[asset('a'),asset('b')];let disposed=0,compiles=0;
 obsolete.forEach(model=>model.scene.children[0].geometry.addEventListener('dispose',()=>disposed++));
 loader.renderer.compileAsync=()=>{compiles++;throw Error('The gameplay display owns shader warming');};
 loader.loadOne=()=>new Promise(resolve=>pending.push(resolve));const old=loader.load({id:'old',modelUrls:['a','b']});assert.equal(pending.length,2);
 const current=await loader.load({id:'new',builderScene:{layout:'grand-floor'},spawn:{x:0,y:0,z:0}});
 pending[0](obsolete[0]);pending[1](obsolete[1]);assert.equal(await old,null);assert.equal(disposed,2);assert.equal(compiles,0);assert.equal(loader.world,current.world);assert.equal(current.world.parent,loader.scene);loader.unload();
});

test('private model authorization failures retain account transport and do not repeat a forbidden request',async()=>{
 const loader=fixture(),previous=Object.getOwnPropertyDescriptor(globalThis,'window');let requests=0;
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:new URL('https://frontend.test/world.html'),fetch(){throw Error('Private assets must use account transport');},MUZIKAZ_API:{base:'https://api.test',fetch:async(url,options)=>{
  requests++;assert.equal(url,'https://api.test/uploads/assets/private.glb');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'include');return Response.json({message:'Access denied'},{status:403});
 }}}});
 try{await assert.rejects(loader.loadOne('/uploads/assets/private.glb',0,1),{message:'Access denied',status:403});assert.equal(requests,1);assert.equal(loader.pendingLoads.size,0);}
 finally{if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;}
});

test('world disposal releases owned resources once and retains shared native and sports maps for reuse',()=>{
 const loader=fixture(),root=new T.Group(),native=new T.Texture(),sports=new T.Texture(),owned=new T.Texture(),geometry=new T.BoxGeometry();native.userData.nativeSurfaceShared=true;sports.userData.sportsSurfaceShared=true;
 const first=new T.MeshStandardMaterial({map:native,roughnessMap:owned}),second=new T.MeshStandardMaterial({map:sports,normalMap:owned});
 const resources={native,sports,owned,geometry,first,second},disposed=Object.fromEntries(Object.keys(resources).map(name=>[name,0]));for(const [name,resource]of Object.entries(resources))resource.addEventListener('dispose',()=>disposed[name]++);
 root.add(new T.Mesh(geometry,[first,second]),new T.Mesh(geometry,first));loader.world=root;loader.scene.add(root);loader.unload();loader.unload();
 assert.deepEqual(disposed,{native:0,sports:0,owned:1,geometry:1,first:1,second:1});native.dispose();sports.dispose();
});
