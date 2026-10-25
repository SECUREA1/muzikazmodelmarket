import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {Capsule} from '../public/vendor/three/addons/math/Capsule.js';
import {moveWalkingCapsule} from '../public/js/walking-capsule.js';
import {buildCollision,resolveSafeSpawn} from '../public/js/environments/environment-collision.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {airportWorld} from '../airport-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

function fixture() {
 const root=new THREE.Group(),floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 floor.name='GROUND';floor.rotation.x=-Math.PI/2;root.add(floor);
 const wall=new THREE.Mesh(new THREE.BoxGeometry(.2,3,12),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));wall.name='WALL';wall.position.y=1.5;root.add(wall);root.updateMatrixWorld(true);
 return {root,wall};
}
function spawn(root,point){const collision=buildCollision(root,'auto',[],{buildOctree:false});return resolveSafeSpawn(root,collision.floorMeshes,point).position;}

test('a new wall across an old saved entry selects nearby clear floor before walking starts',()=>{
 const {root}=fixture(),point=spawn(root,{x:0,y:.02,z:0});
 assert.ok(Math.abs(point.x)>.48,'the capsule body starts outside the wall');
 assert.ok(Math.hypot(point.x,point.z)<=1.01,'recovery stays near the selected entry');
 assert.ok(Math.abs(point.y-.02)<1e-8,'recovery remains on the same floor');
});

test('a clear authored entry retains its exact intended coordinates',()=>{
 const {root}=fixture(),point=spawn(root,{x:3,y:.02,z:4});
 assert.ok(point.distanceTo(new THREE.Vector3(3,.02,4))<1e-8);
});

test('a nearby diagonal wall corner outside the capsule radius does not relocate the authored entry',()=>{
 const {root,wall}=fixture();root.remove(wall);
 const corner=new THREE.Mesh(new THREE.BoxGeometry(.1,3,.1),new THREE.MeshBasicMaterial());corner.name='WALL_CORNER';corner.position.set(.4,1.5,.4);root.add(corner);root.updateMatrixWorld(true);
 assert.ok(spawn(root,{x:0,y:.02,z:0}).distanceTo(new THREE.Vector3(0,.02,0))<1e-8);
});

test('spawn clearance tests actual faces inside a room and transformed instances',()=>{
 const {root,wall}=fixture();root.remove(wall);
 const instances=new THREE.InstancedMesh(new THREE.BoxGeometry(.2,3,12),new THREE.MeshBasicMaterial(),1);instances.name='WALL';instances.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,1.5,0));root.add(instances);root.updateMatrixWorld(true);
 assert.ok(Math.abs(spawn(root,{x:0,y:.02,z:0}).x)>.48);
 root.remove(instances);root.add(wall);wall.position.x=5;root.updateMatrixWorld(true);
 assert.ok(spawn(root,{x:0,y:.02,z:0}).distanceTo(new THREE.Vector3(0,.02,0))<1e-8,'the room bounds do not act as a solid volume');
});

test('native collision rebuilds tolerate circular gameplay ownership metadata',()=>{
 const {root,wall}=fixture();wall.userData.builderRoot={object:wall};
 const local=buildCollision(root,'auto',[],{buildOctree:true});
 const capsule=new Capsule(new THREE.Vector3(-1,.36,0),new THREE.Vector3(-1,1.33,0),.34);
 moveWalkingCapsule(capsule,{x:2,y:-.01,z:.3},{octree:local.octree,grounded:true,verticalVelocity:0});
 assert.ok(capsule.start.x<-.43,'the rebuilt world retains the actual wall');assert.ok(capsule.start.z>.29,'the free wall tangent remains playable');
});

test('rejoining preserves a clear saved capsule in a compact rotated room',async t=>{
 const root=new THREE.Group(),floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));floor.name='GROUND';floor.rotation.x=-Math.PI/2;root.add(floor);
 const chamber=new THREE.Group();chamber.rotation.y=Math.PI/8;root.add(chamber);
 for(const [width,depth,x,z]of [[.1,.9,-.4,0],[.1,.9,.4,0],[.9,.1,0,-.45],[.9,.1,0,.45]]){
  const wall=new THREE.Mesh(new THREE.BoxGeometry(width,3,depth),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));wall.position.set(x,1.5,z);chamber.add(wall);
 }
 root.updateMatrixWorld(true);const floors=[];root.traverse(mesh=>{if(mesh.isMesh)floors.push(mesh);});
 const geometry={root,floors,floorIndex:{cells:new Map(),large:floors},walls:[],glb:true,bounds:new THREE.Box3().setFromObject(root)};
 const collision=new ServerBuilderCollision();collision.world=()=>geometry;
 const world={id:'compact-saved-room',name:'Saved room',modelUrl:'fixture.glb',spawn:{x:3,y:.02,z:3}},saved={x:0,y:.02,z:0};
 assert.equal(collision.hasBodyClearance(world,saved,.3),true,'the server capsule fits');assert.equal(collision.hasBodyClearance(world,saved,.34),true,'the browser capsule also fits');assert.equal(collision.hasBodyClearance(world,saved,.38),false,'new-spawn comfort clearance is intentionally larger');
 for(let direction=0;direction<8;direction++){
  const angle=direction*Math.PI/4,step=distance=>collision.resolve(world,saved,{x:Math.cos(angle)*distance,y:.01,z:Math.sin(angle)*distance});
  const short=step(.01),long=step(.3);assert.ok(Math.hypot(short.x,short.z)>.009,'ordinary short walking steps remain possible');assert.ok(Math.hypot(long.x,long.z)<.15,'long probes encounter the real room walls');
 }
 assert.equal(collision.hasWalkingExit(world,saved),true,'a valid saved capsule does not require a long exit probe');
 const directory=await mkdtemp(join(tmpdir(),'compact-entry-preservation-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>100000});runtime.collision=collision;
 const identity={accountId:'compact-visitor',username:'Visitor',stats:{health:100}},send=requestId=>runtime.command(world.id,world,identity,{action:'join',requestId,deferRadTox:true,radToxEnabled:false});
 const joined=await send('first');await store.update(world.id,room=>Object.assign(room.simulation.players[joined.selfId],{position:{...saved},floor:saved.y,movementRevision:7}));
 const rejoined=(await send('rejoin')).players[joined.selfId];assert.deepEqual(rejoined.position,saved);assert.equal(rejoined.movementRevision,7,'a valid saved pose is never marked as a teleport');
});

test('airport entry and legacy saved entry both start clear of terminal scenery',()=>{
 const world=airportWorld(),collision=new ServerBuilderCollision(),geometry=collision.world(world);
 const nearby=new THREE.Group(),entryBounds=new THREE.Box3(new THREE.Vector3(-66,-1,68),new THREE.Vector3(-50,3,80));
 geometry.root.traverse(mesh=>{if(!mesh.isMesh||!new THREE.Box3().setFromObject(mesh).intersectsBox(entryBounds))return;const copy=new THREE.Mesh(mesh.geometry,mesh.material);copy.name=mesh.name;copy.matrixAutoUpdate=false;copy.matrix.copy(mesh.matrixWorld);nearby.add(copy);});
 const local=buildCollision(nearby,'auto',[],{buildOctree:true});
 assert.ok(collision.hasBodyClearance(world,world.spawn),'the published entry itself is clear');
 assert.equal(collision.hasWalkingExit(world,{x:-60,y:.02,z:74}),false,'the old terminal entry is trapped');
 assert.equal(collision.hasWalkingExit(world,world.spawn),true);
 for(const metadata of [world.spawn,{x:-60,y:.02,z:74}]){
  const point=spawn(geometry.root,metadata);
  assert.ok(collision.hasBodyClearance(world,point),JSON.stringify(point));
  for(let direction=0;direction<8;direction++){
   const angle=direction*Math.PI/4,next={x:point.x+Math.cos(angle)*.15,y:point.y-.01,z:point.z+Math.sin(angle)*.15};
   const accepted=collision.resolve(world,point,next);
   assert.ok(Math.hypot(accepted.x-point.x,accepted.z-point.z)>.1,'keyboard and stick directions retain a clear initial step');
   const capsule=new Capsule(new THREE.Vector3(point.x,point.y+.34,point.z),new THREE.Vector3(point.x,point.y+1.65-.34,point.z),.34);
   moveWalkingCapsule(capsule,{x:next.x-point.x,y:-.01,z:next.z-point.z},{octree:local.octree,grounded:true,verticalVelocity:0,maxStepHeight:.26});
   assert.ok(Math.hypot(capsule.start.x-point.x,capsule.start.z-point.z)>.1,'the browser capsule can take the same initial step');
  }
 }
});

test('rejoining a saved airport player repairs a trapped position and preserves progress',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'airport-entry-recovery-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const world=airportWorld(),store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>100000});
 const identity={accountId:'saved-visitor',username:'Saved visitor',stats:{health:100}};
 const send=requestId=>runtime.command(world.id,world,identity,{action:'join',requestId,deferRadTox:true,radToxEnabled:false});
 const joined=await send('first'),id=joined.selfId;
 await store.update(world.id,room=>Object.assign(room.simulation.players[id],{position:{x:-60,y:.02,z:74},floor:.02,score:123,quests:{saved:'complete'},velocityY:-5,seatedId:'removed-seat',vehicleId:'removed-vehicle',heldId:'removed-item'}));
 const recovered=(await send('rejoin')).players[id];
 assert.ok(runtime.collision.hasWalkingExit(world,recovered.position));assert.equal(recovered.score,123);assert.deepEqual(recovered.quests,{saved:'complete'});assert.equal((await store.get(world.id)).simulation.players[id].velocityY,0);
 assert.equal(recovered.seatedId,null);assert.equal(recovered.vehicleId,null);assert.equal(recovered.heldId,null);
 assert.ok(recovered.movementRevision>0,'the renderer receives an explicit relocation');
 const saved={x:-58,y:.02,z:73};await store.update(world.id,room=>{room.simulation.players[id].position=saved;});
 const unchanged=(await send('next-rejoin')).players[id];assert.deepEqual(unchanged.position,saved,'a clear saved position is retained');assert.equal(unchanged.movementRevision,recovered.movementRevision);
});
