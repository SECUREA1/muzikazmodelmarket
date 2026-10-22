import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

test('floor and walking queries skip distant map and deployed meshes while keeping local support',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'nearby-collision',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:256,objects:[{id:'remote-crate',modelId:'supply-crate',position:{x:70,y:0,z:70}}]}};
 const actors={crate:{id:'crate',spawned:true,active:true,asset:{buildAssetId:'supply-crate'},position:{x:-70,y:0,z:-70},rotation:{y:0}}};
 const world=collision.world(environment),deployed=collision.placedWorld(actors,{},environment);
 let distantRays=0;
 for(const mesh of [...world.floors.filter(mesh=>{for(let node=mesh;node;node=node.parent)if(node.userData.builderObjectId==='remote-crate')return true;return false;}),...deployed.meshes]){const original=mesh.raycast;mesh.raycast=function(...args){distantRays++;return original.apply(this,args);};}
 const floor=collision.groundAt(environment,{x:0,y:0,z:0},{actors});assert.ok(floor);
 const next=collision.resolve(environment,floor,{...floor,x:.4,y:floor.y-.1},actors);
 assert.ok(next.x>.39);assert.ok(Math.abs(next.y-floor.y)<.001);assert.equal(distantRays,0,'remote geometry must not be raycast for local AI/player queries');
});

test('moving a deployed solid updates floor candidates instead of leaving stale footprints',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'moving-collision',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:100,objects:[]}},crate={id:'crate',spawned:true,active:true,asset:{buildAssetId:'supply-crate'},position:{x:0,y:0,z:0},rotation:{y:0}},actors={crate};
 const initial=collision.groundAt(environment,{x:0,y:4,z:0},{actors});assert.ok(initial.y>.5);
 crate.position.x=12;
 const old=collision.groundAt(environment,{x:0,y:4,z:0},{actors}),moved=collision.groundAt(environment,{x:12,y:4,z:0},{actors});
 assert.ok(old.y<.1);assert.ok(Math.abs(moved.y-initial.y)<.001);
});

test('accelerated procedural terrain rays preserve exact triangle heights and normals',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'terrain-ray-equivalence',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:256,objects:[]}},world=collision.world(environment),terrain=world.floors.find(mesh=>mesh.name.startsWith('BUILDER_WALKABLE_FLOOR'));
 const reference=new THREE.Mesh(terrain.geometry,terrain.material);reference.matrixWorld.copy(terrain.matrixWorld);
 for(const [x,z]of [[0,0],[32.1,-19.4],[-72,74],[127.9,-127.9]])for(const direction of [-1,1]){
  const ray=new THREE.Raycaster(new THREE.Vector3(x,direction<0?20:-20,z),new THREE.Vector3(0,direction,0),0,100),expected=ray.intersectObject(reference,false),actual=ray.intersectObject(terrain,false);
  // Floor and ceiling queries must retain the original material's face culling.
  assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++){assert.ok(actual[i].point.distanceTo(expected[i].point)<1e-8);assert.ok(actual[i].face.normal.distanceTo(expected[i].face.normal)<1e-8);}
 }
});

test('a long diagonal wall slide retains elevated support outside the intended movement rectangle',()=>{
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),box=(w,h,d,x,y,z)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);return mesh;};
 const ground=box(100,.2,100,0,-.1,0),start=box(30,.2,2,0,1.9,0),landing=box(30,.2,8,0,1.9,5),wall=box(.2,5,30,1,2.5,0);wall.rotation.y=Math.PI/4;
 const root=new THREE.Group();root.add(ground,start,landing,wall);root.updateMatrixWorld(true);
 const positions=wall.geometry.attributes.position,index=wall.geometry.index,triangles=[];
 for(let offset=0;offset<index.count;offset+=3){
  const [a,b,c]=[0,1,2].map(corner=>new THREE.Vector3().fromBufferAttribute(positions,index.getX(offset+corner)).applyMatrix4(wall.matrixWorld));
  if(Math.abs(new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize().y)>.55)continue;
  const bounds=new THREE.Box3().setFromPoints([a,b,c]);triangles.push({a,b,c,mesh:wall,minX:bounds.min.x,maxX:bounds.max.x,minY:bounds.min.y,maxY:bounds.max.y,minZ:bounds.min.z,maxZ:bounds.max.z});
 }
 const collision=new ServerBuilderCollision();collision.world=()=>({root,floors:[ground,start,landing,wall],triangles,bounds:new THREE.Box3().setFromObject(root)});
 const resolved=collision.resolve({proceduralLand:true},{x:0,y:2.02,z:0},{x:5,y:2,z:0});
 assert.ok(resolved.z>2,'wall projects movement onto the adjoining elevated slab');assert.ok(Math.abs(resolved.floorY-2.02)<1e-6);assert.ok(Math.abs(resolved.y-2.02)<1e-6);
});
