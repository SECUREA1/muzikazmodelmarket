import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

function fixture(){
 const collision=new ServerBuilderCollision(),actor={id:'plane',trafficAI:true,modelId:'corsair-aircraft',active:true,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}},actors={plane:actor};
 const view=()=>collision.placedWorld(actors,{});
 const first=view(),mesh=collision.trafficCollision.entries.get(actor.id).root.children[0];
 return {collision,actor,actors,view,mesh,first};
}
const faces=(view,mesh)=>view.triangles.filter(face=>face.mesh===mesh);
const bounds=triangles=>{const box=new THREE.Box3();for(const face of triangles)for(const vertex of [face.a,face.b,face.c])box.expandByPoint(vertex);return box;};

test('repeated clearance geometry queries do not resample stationary craft vertices',()=>{
 const {view,mesh,first}=fixture(),attribute=mesh.geometry.attributes.position;
 const expected=faces(first,mesh),getX=attribute.getX.bind(attribute);let reads=0;
 attribute.getX=index=>{reads++;return getX(index);};
 for(let i=0;i<100;i++)assert.deepEqual(faces(view(),mesh),expected);
 assert.equal(reads,0,'unchanged physical surfaces need no additional vertex expansion');
 assert.equal(expected.length,8,'retain all eight vertical faces of the physical box');
});

test('craft translation, rotation and scale invalidate physical faces before the next query',()=>{
 const {actor,view,mesh,first}=fixture(),before=bounds(faces(first,mesh));
 actor.position.x=20;
 const translated=bounds(faces(view(),mesh));
 assert.ok(Math.abs(translated.min.x-before.min.x-20)<1e-6);
 actor.rotation.y=Math.PI/2;actor.scale.x=2;
 const rotated=bounds(faces(view(),mesh)),expected=new THREE.Box3().setFromObject(mesh);
 assert.ok(rotated.min.distanceTo(expected.min)<1e-6);
 assert.ok(rotated.max.distanceTo(expected.max)<1e-6);
 assert.notEqual(rotated.max.z-translated.max.z,0,'new rotation and dimensions enter collision immediately');
});

test('buffer edits and replacements invalidate cached physical geometry',()=>{
 const {view,mesh,first}=fixture(),original=bounds(faces(first,mesh));
 mesh.geometry.translate(2,0,0);
 assert.ok(Math.abs(bounds(faces(view(),mesh)).min.x-original.min.x-2)<1e-6);
 const position=mesh.geometry.attributes.position.clone();
 for(let i=0;i<position.count;i++)position.setX(i,position.getX(i)+3);
 mesh.geometry.setAttribute('position',position);
 assert.ok(Math.abs(bounds(faces(view(),mesh)).min.x-original.min.x-5)<1e-6);
 const index=mesh.geometry.index,firstTriangle=[index.getX(0),index.getX(1),index.getX(2)];
 mesh.geometry.setIndex([]);
 assert.equal(faces(view(),mesh).length,0);
 mesh.geometry.setIndex(firstTriangle);
 const changed=mesh.geometry.index;
 changed.setX(0,changed.getX(1));changed.setX(2,changed.getX(1));changed.needsUpdate=true;
 assert.equal(faces(view(),mesh).length,1,'index-buffer changes are observed even when the buffer identity is stable');
 mesh.geometry=new THREE.BoxGeometry(4,3,2);
 const replacement=bounds(faces(view(),mesh));
 assert.equal(replacement.max.x-replacement.min.x,4);
 assert.equal(replacement.max.y-replacement.min.y,3);
});

test('traffic activation, removal and model changes cannot leave stale collision faces',()=>{
 const {actor,actors,view,mesh}=fixture();
 assert.ok(view().triangles.some(face=>face.mesh===mesh));
 actor.active=false;
 assert.equal(view().triangles.length,0);
 actor.active=true;
 assert.ok(view().triangles.length>0);
 actor.modelId='harbor-skiff';
 const changed=view();
 assert.equal(changed.triangles.some(face=>face.mesh===mesh),false);
 assert.ok(changed.triangles.every(face=>face.objectId===actor.id));
 delete actors.plane;
 assert.equal(view().triangles.length,0);
});

test('instance matrix changes invalidate every physical copy',()=>{
 const {view,mesh}=fixture();
 mesh.isInstancedMesh=true;mesh.count=2;
 mesh.instanceMatrix=new THREE.InstancedBufferAttribute(new Float32Array(32),16);
 mesh.getMatrixAt=THREE.InstancedMesh.prototype.getMatrixAt;
 const matrix=new THREE.Matrix4();matrix.toArray(mesh.instanceMatrix.array,0);matrix.makeTranslation(5,0,0).toArray(mesh.instanceMatrix.array,16);
 const before=faces(view(),mesh);assert.equal(before.length,16);
 matrix.makeTranslation(10,0,0).toArray(mesh.instanceMatrix.array,16);mesh.instanceMatrix.needsUpdate=true;
 const after=faces(view(),mesh);assert.equal(after.length,16);
 assert.ok(Math.abs(bounds(after).max.x-bounds(before).max.x-5)<1e-6);
 mesh.count=1;
 assert.equal(faces(view(),mesh).length,8);
});

test('nearby triangle queries retain exactly the physical surfaces selected by a full scan',()=>{
 const {actors,view}=fixture();
 for(let i=1;i<40;i++)actors['plane'+i]={...structuredClone(actors.plane),id:'plane'+i,position:{x:i*30,y:0,z:i%2*30}};
 const compare=()=>{
  const current=view(),all=current.triangles;
  for(const [minX,maxX,minZ,maxZ]of [[-1,1,-10,10],[26,35,25,35],[500,540,-5,5],[-100,1300,-100,100]]){
   const expected=all.filter(face=>face.maxX>=minX&&face.minX<=maxX&&face.maxZ>=minZ&&face.minZ<=maxZ);
   assert.deepEqual(current.nearbyTriangles(minX,maxX,minZ,maxZ),expected);
  }
  return current;
 };
 const first=compare();assert.ok(first.nearbyTriangles(-1,1,-10,10).length<first.triangles.length/10);
 actors.plane2.position={x:0,y:0,z:0};actors.plane.active=false;delete actors.plane3;
 compare();
 const mesh=view().triangles.find(face=>face.objectId==='plane2').mesh;
 mesh.geometry.translate(150,0,0);
 compare();
});

test('alternating vehicle self-exclusions reuse each exact collision membership',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'alternating-vehicle-probes'};
 const craft=(id,x)=>({id,modelId:'harbor-skiff',active:true,position:{x,y:0,z:0},rotation:{y:0},scale:{x:1,y:1,z:1}});
 const actors={a:craft('a',0),b:craft('b',30)};
 const query=excluded=>{
  const input=structuredClone(actors);if(excluded)input[excluded].active=false;
  const view=collision.placedWorld(input,{},environment);
  return {view,world:collision.placedCache.world};
 };
 const a=query('a'),b=query('b'),both=query(null);let disposed=0;
 for(const world of [a.world,b.world,both.world])for(const mesh of world.meshes)mesh.geometry.addEventListener('dispose',()=>disposed++);
 const originalFaces=a.view.triangles;
 for(let i=0;i<12;i++){
  const checkA=query('a'),checkB=query('b'),checkBoth=query(null);
  assert.strictEqual(checkA.world,a.world);
  assert.strictEqual(checkB.world,b.world);
  assert.strictEqual(checkBoth.world,both.world);
  assert.ok(checkA.view.boxes.every(box=>box.objectId==='b'));
  assert.ok(checkB.view.boxes.every(box=>box.objectId==='a'));
  assert.deepEqual(checkA.view.triangles,originalFaces);
 }
 assert.equal(disposed,0,'footprint queries must not rebuild or dispose the other vehicles');
 actors.b.position.x=50;
 const moved=query('a');assert.strictEqual(moved.world,a.world);
 assert.ok(moved.view.boxes.every(box=>box.min.x>45),'a retained membership follows current craft poses');
});

test('collision membership retention is bounded and evicts the least recently queried geometry',()=>{
 const collision=new ServerBuilderCollision({maxPlacedVariants:2}),environment={id:'bounded-memberships'};
 const query=id=>{
  collision.placedWorld({[id]:{id,spawned:true,active:true,asset:{buildAssetId:'supply-crate'},position:{x:0,y:0,z:0},rotation:{y:0}}},{},environment);
  return collision.placedCache.world;
 };
 const a=query('a'),b=query('b');let disposed=0;
 b.meshes[0].geometry.addEventListener('dispose',()=>disposed++);
 assert.strictEqual(query('a'),a);
 query('c');
 assert.equal(collision.placedWorlds.get(environment.id).variants.size,2);
 assert.ok(disposed>0);
 assert.strictEqual(query('a'),a);
 assert.notStrictEqual(query('b'),b,'evicted geometry is rebuilt only when needed again');
 const previous=query('a');environment.updatedAt='new-map-version';
 assert.notStrictEqual(query('a'),previous,'map edits invalidate every retained collision membership');
 collision.clearPlacedWorlds();assert.equal(collision.placedWorlds.size,0);
});
