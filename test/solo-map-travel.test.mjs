import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {buildCollision} from '../public/js/environments/environment-collision.js';
import {resolveSoloMapAccess,travelSoloMap} from '../public/js/solo-map-travel.js';
import {BuilderVehicleController} from '../public/js/builder-vehicle-controller.js';

function box(width,height,depth,x=0,y=height/2,z=0,name='WALL'){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),new THREE.MeshBasicMaterial());mesh.position.set(x,y,z);mesh.name=name;return mesh;
}
function sceneWithFloor(){const world=new THREE.Group();world.add(box(160,1,160,0,-.5,0,'GROUND'));world.updateMatrixWorld(true);return world;}
function loader(world,supplemental=[]){world.updateMatrixWorld(true);return {world,bounds:new THREE.Box3().setFromObject(world),localCollisionReady:true,...buildCollision(world,'auto',supplemental)};}

test('solo landmark travel clears a large building footprint and only then releases the current seat',()=>{
 const world=sceneWithFloor(),building=box(50,8,24);world.add(building);
 const environment={builderScene:{layoutMeta:{locations:[{id:'hall',name:'Great hall',x:0,y:0,z:0,width:50,depth:24}]}}};
 let seated=true,moved=null;const events=[];
 const result=travelSoloMap({environment,fields:{locationId:'hall'},loader:loader(world),roots:[building]}, {
  release(){events.push('release');seated=false;},move(point){assert.equal(seated,false);events.push('move');moved=point.clone();}
 });
 assert.ok(Math.hypot(moved.x,moved.z)>12,'arrival reaches beyond the former fixed search radius');
 assert.equal(moved.y,.02);assert.ok(Math.abs(moved.x)>25.34||Math.abs(moved.z)>12.34);assert.deepEqual(events,['release','move']);assert.match(result.message,/Great hall/);
});

test('invalid, obstructed, or unloaded solo map destinations keep the player in their current ride',()=>{
 const world=sceneWithFloor(),building=box(8,6,8);world.add(building);const options={environment:{},loader:loader(world),roots:[building]};
 let released=false,moved=false;const callbacks={release(){released=true;},move(){moved=true;}};
 for(const fields of [{position:{x:0,z:0}},{position:{x:Infinity,z:0}},{locationId:'deleted-location'}])assert.throws(()=>travelSoloMap({...options,fields},callbacks));
 assert.throws(()=>travelSoloMap({...options,loader:{...options.loader,localCollisionReady:false},fields:{position:{x:20,z:20}}},callbacks),/loading/);
 assert.equal(released,false);assert.equal(moved,false);
});

test('solo map travel checks newly placed solids and resolves elevated floor clicks',()=>{
 const world=sceneWithFloor(),floorLoader=loader(world),placed=box(4,3,4);placed.updateMatrixWorld(true);
 assert.throws(()=>resolveSoloMapAccess({environment:{},fields:{position:{x:0,z:0}},loader:floorLoader,roots:[placed]}),/clear landing/);
 world.add(box(12,5,12,30,2.5,0,'PLATFORM_FLOOR'));
 const result=resolveSoloMapAccess({environment:{},fields:{position:{x:30,z:0}},position:{y:0},loader:loader(world)});
 assert.equal(result.position.y,5.02,'actual support height replaces the previous player floor');
});

test('solo travel can enter a hollow room made from open wall planes',()=>{
 const world=sceneWithFloor(),vertices=[];
 for(const [x,z,yaw]of [[0,-5,0],[0,5,Math.PI],[-5,0,Math.PI/2],[5,0,-Math.PI/2]]){
  const plane=new THREE.PlaneGeometry(10,3).toNonIndexed();plane.rotateY(yaw);plane.translate(x,1.5,z);vertices.push(...plane.attributes.position.array);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
 const walls=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));walls.name='COLLIDER_ROOM_WALLS';world.add(walls);
 const options={environment:{},loader:loader(world),roots:[walls]};
 const arrival=resolveSoloMapAccess({...options,fields:{position:{x:0,z:0}}});
 assert.equal(arrival.position.y,.02);assert.equal(arrival.position.x,0);assert.equal(arrival.position.z,0);
 assert.throws(()=>resolveSoloMapAccess({...options,fields:{position:{x:4.9,z:0}}}),/clear landing/,'wall faces still reject capsule overlap');
});

test('solo craft selection boards the exact parked vehicle and rejects unavailable or airborne craft',()=>{
 const world=sceneWithFloor(),vehicles=new THREE.Group(),rig=new THREE.Group(),camera=new THREE.PerspectiveCamera();
 const makeVehicle=(id,x)=>{const root=new THREE.Group();root.userData.builderObjectId=id;root.userData.vehicle={seat:[0,.7,0],mode:'drive',speed:5,turnSpeed:1};root.add(box(1,1,2,0,.5,0,'COLLIDER_RIDE'));root.position.x=x;vehicles.add(root);return root;};
 const first=makeVehicle('first',0),selected=makeVehicle('selected',20);vehicles.updateMatrixWorld(true);
 const controller=new BuilderVehicleController({THREE,vehicles,playerRig:rig,camera,keys:new Set()}),options={environment:{builderScene:{objects:[{id:'selected'}]}},fields:{entityId:'selected'},loader:loader(world,[vehicles]),roots:vehicles.children,vehicles:vehicles.children,position:rig.position};
 const result=travelSoloMap(options,{release(){controller.exit();},move(point){rig.position.copy(point);},board(vehicle){assert.equal(controller.enter(vehicle),true);controller.update(0);}});
 assert.equal(controller.active,selected);assert.notEqual(controller.active,first);assert.equal(rig.position.x,20);assert.equal(result.vehicle,selected);
 assert.equal(resolveSoloMapAccess({...options,activeVehicle:selected}).reopening,true);
 assert.throws(()=>resolveSoloMapAccess({...options,environment:{builderScene:{objects:[{id:'selected',trafficAI:true}]}}}),/unavailable/);
 controller.exit();selected.position.y=20;vehicles.updateMatrixWorld(true);
 assert.throws(()=>resolveSoloMapAccess({...options,loader:loader(world,[vehicles])}),/landed/);
});
