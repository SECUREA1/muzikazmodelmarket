import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {buildCollision,alignPointAboveFloor} from '../public/js/environments/environment-collision.js';
import {placementTriangles} from '../public/js/placed-item-collision.js';
import {findLocalMapLanding} from '../public/js/local-map-landing.js';
import {localMapLocations} from '../public/js/local-map-locations.js';
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
function box(name,size,position){const object=new THREE.Mesh(new THREE.BoxGeometry(...size),material);object.name=name;object.position.set(...position);return object;}
function setup(...meshes){const root=new THREE.Group();root.add(...meshes);const collision=buildCollision(root);return {environment:{id:'local-map'},bounds:new THREE.Box3().setFromObject(root),...collision};}
const query=(world,position,options={})=>findLocalMapLanding({...world,position,...options});
test('local map landing uses transformed runtime floor geometry and preserves exact clicks without inventing height',()=>{
 const root=new THREE.Group();root.position.set(120,6,-80);root.scale.set(1.4,1,.8);root.rotation.y=.3;root.add(box('FLOOR',[20,.2,16],[0,-.1,0]));const collision=buildCollision(root),world={...collision,bounds:new THREE.Box3().setFromObject(root)};
 const landing=query(world,{x:120,z:-80});assert.ok(landing);assert.equal(landing.x,120);assert.equal(landing.z,-80);assert.ok(Math.abs(landing.y-6.02)<1e-7);
 for(const position of [{x:NaN,z:0},{x:120,z:Infinity},{x:120,y:NaN,z:-80},{x:999,z:999}])assert.equal(query(world,position),null);
 assert.equal(query({...world,octree:null},{x:120,z:-80}),null);
});
test('the top supported floor agrees with walking alignment, and low headroom cannot select a lower storey',()=>{
 const ground=box('GROUND',[20,.2,20],[0,-.1,0]),deck=box('PLATFORM_FLOOR',[8,.2,8],[0,3.9,0]),roof=box('ROOF',[12,.2,12],[0,7,0]);let world=setup(ground,deck,roof),landing=query(world,{x:0,z:0});assert.ok(landing);assert.ok(Math.abs(landing.y-4.02)<1e-7);const aligned=alignPointAboveFloor(new THREE.Vector3(0,0,0),world.floorMeshes,world.bounds);assert.ok(landing.distanceTo(aligned)<1e-7);
 world=setup(ground.clone(),deck.clone(),box('CEILING',[12,.2,12],[0,5.4,0]));assert.equal(query(world,{x:0,z:0}),null);
});
test('standing capsules reject side obstructions and nearby landmarks find a clear point within twelve metres',()=>{
 const world=setup(box('FLOOR',[30,.2,30],[0,-.1,0]),box('WALL',[.12,3,5],[.24,1.5,0]));assert.equal(query(world,{x:0,z:0}),null);const nearby=query(world,{x:0,z:0},{nearby:true});assert.ok(nearby);assert.ok(Math.hypot(nearby.x,nearby.z)>0&&Math.hypot(nearby.x,nearby.z)<=12);
});
test('water, invisible safety slabs and missing support never become local teleport floors',()=>{
 const environment={builderScene:{layoutMeta:{harbor:{extent:256,islands:[]}}}},sea=box('HARBOR_SWIM',[512,.1,512],[0,-.70,0]),pier=box('PIER_FLOOR',[4,.2,10],[140,.1,0]),world={...setup(sea,pier),environment};assert.equal(query(world,{x:155,z:15}),null);const landing=query(world,{x:140,z:0});assert.ok(landing&&Math.abs(landing.y-.22)<1e-7);
 const floor=box('GROUND',[4,.2,4],[-5,-.1,0]),safety=box('COLLIDER_MAP_SAFETY_FLOOR',[20,.1,20],[0,-2,0]);safety.material=new THREE.MeshBasicMaterial({visible:false});const sparse=setup(floor,safety);assert.equal(query(sparse,{x:6,z:0}),null);assert.ok(query(sparse,{x:-5,z:0}));
});
test('instanced floors use real instance transforms and walkable slopes retain supported landings',()=>{
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(8,.2,8),material,1);mesh.name='INSTANCED_FLOOR';mesh.setMatrixAt(0,new THREE.Matrix4().compose(new THREE.Vector3(25,3,-12),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.4),new THREE.Vector3(1.5,1,.8)));const world=setup(mesh),landing=query(world,{x:25,z:-12});assert.ok(landing);assert.ok(Math.abs(landing.y-3.12)<1e-6);
 const slope=new THREE.Mesh(new THREE.PlaneGeometry(20,20),material);slope.name='GROUND';slope.rotation.x=-Math.PI/2+.5;const sloped=setup(slope);assert.ok(query(sloped,{x:0,z:0}));
});
test('cached placed triangles block the full body even with absent or invalid culling bounds',()=>{
 const world=setup(box('FLOOR',[30,.2,30],[0,-.1,0])),placed=box('PLACED_BRICK',[.2,2,3],[.25,1,0]);placed.updateMatrixWorld(true);const triangles=placementTriangles(THREE,[placed]);assert.equal(query(world,{x:0,z:0},{triangleGroups:[{triangles}]}),null);assert.equal(query(world,{x:0,z:0},{triangleGroups:[{triangles,bounds:{min:{x:NaN},max:{x:NaN}}}]}),null);
 assert.ok(query(world,{x:-3,z:0},{triangleGroups:[{triangles,bounds:new THREE.Box3().setFromObject(placed)}]}));
 const enclosing=box('PLACED_SOLID',[6,5,6],[0,2.5,0]);enclosing.updateMatrixWorld(true);assert.equal(query(world,{x:0,z:0},{triangleGroups:[{triangles:placementTriangles(THREE,[enclosing]),bounds:new THREE.Box3().setFromObject(enclosing)}]}),null);
});
test('a large solid excluded from floor rays cannot enclose an accepted standing capsule',()=>{
 const world=setup(box('GROUND',[20,.2,20],[0,-.1,0]),box('WALL_BLOCK',[6,5,6],[0,2.5,0]));assert.equal(query(world,{x:0,z:0}),null);
});

test('shrinking or enlarging a solo terrain map keeps every compass portal on its physical floor',()=>{
 for(const scale of [.1,2]){
  const floor=box('GROUND',[256,.2,256],[0,-.1,0]);floor.scale.setScalar(scale);floor.position.y=-.1*scale;
  const world={...setup(floor),environment:{proceduralLand:true,builderScene:{mapSize:256}}};
  for(const place of localMapLocations(world.environment,world.bounds,{scale}))assert.ok(query(world,place,{scale}),place.id+' has real supported floor at '+scale+'x');
 }
});
