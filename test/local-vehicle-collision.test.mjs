import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3,Triangle,Group,Mesh,BoxGeometry,MeshBasicMaterial,PlaneGeometry} from '../public/vendor/three/three.module.min.js';
import {Octree} from '../public/vendor/three/addons/math/Octree.js';
import {placementBounds,placementTriangles} from '../public/js/placed-item-collision.js';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createVehicleCollision} from '../public/js/local-vehicle-collision.js';
const plane={id:'own-plane',modelId:'corsair-aircraft'},boat={id:'own-boat',modelId:'harbor-skiff'};
const groupFor=(mesh,objectId)=>({objectId,bounds:placementBounds(THREE,mesh),triangles:placementTriangles(THREE,[mesh])});
test('aircraft wing and boat bow sweeps use actual two-sided placed triangles and skip own models',()=>{
 const wall=new Mesh(new BoxGeometry(.2,4,.2),new MeshBasicMaterial());wall.position.set(4.8,2,-3.5);const group=groupFor(wall,'wall');const collision=createVehicleCollision({triangleGroups:[group],ignoreId:'own-plane'});
 assert.equal(collision.blocked({x:0,y:1,z:0},{x:0,y:1,z:-1},0,plane),true,'wing reaches wall while centre ray misses');
 assert.equal(createVehicleCollision({triangleGroups:[{...group,objectId:'own-plane'}],ignoreId:'own-plane'}).blocked({x:0,y:1,z:0},{x:0,y:1,z:-1},0,plane),false);
 const thin=new Triangle(new Vector3(-2,-1,-2.5),new Vector3(2,-1,-2.5),new Vector3(0,3,-2.5));const reversed={triangles:[new Triangle(thin.a,thin.c,thin.b)],bounds:new Box3().setFromPoints([thin.a,thin.b,thin.c])};
 assert.equal(createVehicleCollision({triangleGroups:[reversed]}).blocked({x:0,y:0,z:0},{x:0,y:0,z:-1},0,boat),true,'thin backfaces still block boats');
});
test('octree map walls block a vehicle from either side and distant geometry is ignored',()=>{
 const mesh=new Mesh(new BoxGeometry(10,3,.2),new MeshBasicMaterial());mesh.position.set(0,1.5,-3.4);const tree=new Octree().fromGraphNode(mesh),collision=createVehicleCollision({octree:tree});
 assert.equal(collision.blocked({x:0,y:0,z:0},{x:0,y:0,z:-1},0,boat),false);
 assert.equal(collision.blocked({x:0,y:0,z:-.5},{x:0,y:0,z:-1.5},0,boat),true);
 assert.equal(collision.blocked({x:0,y:0,z:-6.2},{x:0,y:0,z:-5.2},Math.PI,boat),true);
});
test('boat hull overlap covers live traffic and shoreline checks share the harbor boundary',()=>{
 const traffic={id:'traffic',modelId:'harbor-skiff',active:true,position:{x:145,y:0,z:-20},rotation:{y:0}},environment={builderScene:{layoutMeta:{harbor:{extent:256,islands:[]}}}};
 const collision=createVehicleCollision({actors:{traffic},ignoreId:'own-boat',environment});
 assert.equal(collision.blocked({x:145,y:0,z:-27},{x:145,y:0,z:-24},0,boat),true);
 assert.equal(collision.blocked({x:132,y:0,z:0},{x:129,y:0,z:0},Math.PI/2,boat),true,'hull cannot cross mainland shore');
 assert.equal(createVehicleCollision({actors:{traffic:{...traffic,id:'own-boat'}},ignoreId:'own-boat'}).blocked({x:145,y:0,z:-27},{x:145,y:0,z:-24},0,boat),false);
});
test('ground support uses cached walkable triangles, skips own surfaces and returns server floor clearance',()=>{
 const floor=new Mesh(new PlaneGeometry(20,20),new MeshBasicMaterial());floor.rotation.x=-Math.PI/2;floor.position.y=2;const raised=new Mesh(new PlaneGeometry(4,4),new MeshBasicMaterial());raised.rotation.x=-Math.PI/2;raised.position.y=4;
 const collision=createVehicleCollision({triangleGroups:[groupFor(floor,'floor'),groupFor(raised,'own-plane')],ignoreId:'own-plane'});assert.ok(Math.abs(collision.groundAt({x:0,y:5,z:0},plane).y-2.02)<1e-8);assert.equal(collision.groundAt({x:30,y:5,z:0},plane),null);
 const tree=new Octree().fromGraphNode(floor);assert.ok(Math.abs(createVehicleCollision({octree:tree}).groundAt({x:0,y:5,z:0}).y-2.02)<1e-8);
});

test('construction prediction sweeps reverse and turning mechanical envelopes and ignores its own mesh',()=>{
 const truck={id:'truck',modelId:'site-dumptruck',position:{x:0,y:0,z:0},rotation:{y:0},construction:{kind:'truck',bed:0},driving:{steering:0}},wall=new Mesh(new BoxGeometry(15,4,.03),new MeshBasicMaterial());wall.position.set(0,2,9);const group=groupFor(wall,'barrier');
 assert.equal(createVehicleCollision({triangleGroups:[group]}).blocked(truck.position,{x:0,y:0,z:10},0,truck),true,'reverse travel cannot tunnel a raised dump chassis through a barrier');
 assert.equal(createVehicleCollision({triangleGroups:[{...group,objectId:'truck'}]}).blocked(truck.position,{x:0,y:0,z:10},0,truck),false);
 const dozer={id:'dozer',modelId:'site-bulldozer',position:{x:0,y:0,z:0},rotation:{y:0},construction:{kind:'bulldozer',blade:1}},post=new Mesh(new BoxGeometry(.08,2,.08),new MeshBasicMaterial());post.position.set(-3.3,1,-2);
 assert.equal(createVehicleCollision({triangleGroups:[groupFor(post,'post')]}).blocked(dozer.position,dozer.position,Math.PI/4,dozer),true,'pivoting a track machine checks its blade arc even with no chassis translation');
 wall.geometry.dispose();wall.material.dispose();post.geometry.dispose();post.material.dispose();
});

test('construction prediction protects other operators with their live standing envelope',()=>{
 const truck={id:'truck',modelId:'site-dumptruck',position:{x:0,y:0,z:0},rotation:{y:0},construction:{kind:'truck',bed:0}},worker={health:100,vehicleId:null,position:{x:0,y:0,z:8}};
 assert.equal(createVehicleCollision({players:{worker}}).blocked(truck.position,{x:0,y:0,z:8},0,truck),true);
 assert.equal(createVehicleCollision({players:{worker:{...worker,vehicleId:'other'}}}).blocked(truck.position,{x:0,y:0,z:8},0,truck),false);
});
