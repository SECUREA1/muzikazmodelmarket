import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {projectServerActor} from '../public/js/server-scene-projection.js';

// Exercise the explorer's actual adapter: its surrounding module requires a
// full renderer, but object placement only needs these scene/runtime services.
const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const start=source.indexOf('  function applyBuilderObject(');
const placement=source.slice(start,source.indexOf('  function prepareAuthoredBuilderModel(',start));

function adapter(){
 const builderDecor=new THREE.Group(),registered=new Map(),floorQueries=[];
 const floorPointAt=point=>{floorQueries.push(point.clone());return new THREE.Vector3(point.x,7,point.z);};
 const builderGameplay={actor:()=>null,register:(id,value)=>registered.set(id,value)};
 const apply=new Function('THREE','floorPointAt','builderGameplay','builderDecor','serverHostedRoom',`return (${placement});`)(THREE,floorPointAt,builderGameplay,builderDecor,true);
 const object=new THREE.Group();object.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial()));
 return {apply,object,builderDecor,registered,floorQueries};
}

test('authored Builder models retain exact world coordinates on an off-center multi-floor GLB',()=>{
 const f=adapter(),item={id:'wall',modelId:'wall',position:{x:3,y:1,z:-2},rotation:{x:.1,y:.4,z:.2},scale:{x:1,y:2,z:1},groundOffset:5};
 // Neither a distant map center nor an unrelated upper floor may relocate an
 // item the builder already authored in the server's world coordinate frame.
 f.apply(f.object,item,0,new THREE.Vector3(40,20,-30),-3);
 assert.deepEqual(f.object.position.toArray(),[3,1,-2]);
 assert.deepEqual(f.object.userData.serverRenderOffset,{x:0,y:0,z:0});
 assert.equal(f.floorQueries.length,0);assert.equal(f.object.parent,f.builderDecor);assert.ok(f.registered.has(item.id));
 projectServerActor(f.object,{position:{x:4,y:2,z:-3},rotation:item.rotation,scale:item.scale,active:true});
 assert.deepEqual(f.object.position.toArray(),[4,2,-3],'the next authoritative snapshot preserves the same coordinate frame');
});

test('legacy percentage items retain centered floor placement and their ground offset',()=>{
 const f=adapter(),item={id:'old-wall',modelId:'wall',x:55,y:45,rotation:90,scale:1,groundOffset:.25};
 f.apply(f.object,item,0,new THREE.Vector3(40,20,-30),-3);
 assert.deepEqual(f.object.position.toArray(),[42,7.75,-32]);
 assert.equal(f.floorQueries.length,1);assert.deepEqual(f.floorQueries[0].toArray(),[42,-3,-32]);
 assert.ok(Math.abs(f.object.rotation.y-Math.PI/2)<1e-9);
 f.object.updateMatrixWorld(true);assert.equal(new THREE.Box3().setFromObject(f.object).min.y,7.25);
});
