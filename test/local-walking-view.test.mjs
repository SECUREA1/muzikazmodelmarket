import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {Octree} from '../public/vendor/three/addons/math/Octree.js';
import {LocalWalkingView} from '../public/js/local-walking-view.js';

const point=(x,y,z)=>new THREE.Vector3(x,y,z);
const bounds=(x1,y1,z1,x2,y2,z2)=>new THREE.Box3(point(x1,y1,z1),point(x2,y2,z2));
const floor=(height=0)=>[new THREE.Triangle(point(-50,height,-50),point(-50,height,50),point(50,height,-50)),new THREE.Triangle(point(50,height,-50),point(-50,height,50),point(50,height,50))];
function trianglesForBox(box){
 const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),geometry=new THREE.BoxGeometry(size.x,size.y,size.z).toNonIndexed(),positions=geometry.attributes.position,triangles=[];
 for(let index=0;index<positions.count;index+=3)triangles.push(new THREE.Triangle(...[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(positions,index+offset).add(center))));
 geometry.dispose();return triangles;
}
function world(triangles){
 return {
  getCapsuleTriangles(_capsule,result){result.push(...triangles);},
  triangleCapsuleIntersect(capsule,triangle){
   let best=null;
   for(const center of [capsule.start,capsule.end]){
    const closest=triangle.closestPointToPoint(center,new THREE.Vector3()),direction=center.clone().sub(closest),distance=direction.length();
    if(distance<capsule.radius&&(!best||distance<best.distance))best={distance,depth:capsule.radius-distance,normal:distance?direction.divideScalar(distance):triangle.getNormal(new THREE.Vector3()),point:closest};
   }
   return best;
  }
 };
}
const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} should be within ${tolerance} of ${expected}`);
const options=(triangles=floor(),triangleGroups=[])=>({speed:4,octree:world(triangles),triangleGroups,floorGap:.02});
function fixture(position={x:0,y:.02,z:0}){
 const motion=new LocalWalkingView({radius:.34,height:1.65}),target={...position};
 motion.reconcile(position,{serverTime:1000,simulationTime:1000,sentAt:0,receivedAt:0,grounded:true});
 return {motion,target};
}
function acknowledge(motion,position,serverTime,receivedAt,extra={}){
 motion.reconcile(position,{serverTime:1000+serverTime,simulationTime:1000+serverTime,sentAt:Math.max(0,2*serverTime-receivedAt),receivedAt,grounded:true,...extra});
}

test('walking starts on the first render frame and stops without inertia at 5, 10, 20, 30, 60 and 120 FPS',()=>{
 for(const fps of [5,10,20,30,60,120]){
  const {motion,target}=fixture(),geometry=options();
  motion.sample(1000/fps,1/fps,{side:1,yaw:0},geometry,target);near(target.x,4/fps);near(target.y,.02);near(target.z,0);
  for(let frame=2;frame<=fps/5;frame++)motion.sample(frame*1000/fps,1/fps,{side:1,yaw:0},geometry,target);
  near(target.x,.8);const stopped={...target};
  for(let frame=1;frame<=6;frame++){motion.sample(200+frame*1000/fps,1/fps,{},geometry,target);near(target.x,stopped.x);near(target.z,stopped.z);}
  motion.sample(450,1/fps,{side:-1,yaw:0},geometry,target);near(target.x,stopped.x-4/fps);
  motion.sample(450+1000/fps,1/fps,{side:1,yaw:0},geometry,target);near(target.x,stopped.x);
 }
});

test('local walking stays continuous across delayed 120, 200 and 600 ms server acknowledgments',()=>{
 for(const cadence of [120,200,600])for(const fps of [5,10,20,30,60,120]){
  const {motion,target}=fixture(),geometry=options();let previous=0,nextArrival=cadence;
  for(let frame=1;frame<=fps*3;frame++){
   const now=frame*1000/fps;
   while(now+1e-7>=nextArrival){
    const source=nextArrival-cadence/2;
    acknowledge(motion,{x:source*.004,y:.02,z:0},source,nextArrival);nextArrival+=cadence;
   }
   motion.sample(now,1/fps,{side:1,yaw:0},geometry,target);
   near(target.x-previous,4/fps,.006);assert.ok(target.x>previous,'held movement must not pause at HTTP cadence');near(target.y,.02);
   previous=target.x;
  }
  near(target.x,12,.03);
 }
});

test('swept wall pressure never penetrates or recoils, and tangential walking keeps moving',()=>{
 const wallBounds=bounds(1,0,-10,1.01,3,10),group={bounds:wallBounds,triangles:trianglesForBox(wallBounds)},geometry=options(floor(),[group]),{motion,target}=fixture();let previous=0;
 for(let frame=1;frame<=90;frame++){
  const now=frame*1000/60;
  if(frame%12===0){const source=now-120;acknowledge(motion,{x:Math.min(.658,source*.004),y:.02,z:0},source,now);}
  motion.sample(now,1/60,{side:1,yaw:0},geometry,target);assert.ok(target.x>=previous-1e-6,'wall pressure cannot push the view backward');assert.ok(target.x<=.660001,'the local capsule must stop outside the wall');near(target.y,.02);previous=target.x;
 }
 assert.ok(target.x>.65);
 for(let frame=1;frame<=30;frame++){
  const now=1500+frame*1000/60,z=target.z;
  if(frame%12===0)acknowledge(motion,{...target},now-1000/60,now);
  motion.sample(now,1/60,{side:1,forward:1,yaw:0},geometry,target);assert.ok(target.x<=.660001);near(target.z-z,-4/Math.sqrt(2)/60,1e-5);
 }
 const blocked=target.x;motion.sample(2020,1/60,{side:-1,yaw:0},geometry,target);near(target.x,blocked-4/60);
});

test('triangle-supported stairs rise with movement and stay still after input stops',()=>{
 const stepBounds=bounds(.5,0,-2,2,.24,2),group={bounds:stepBounds,triangles:trianglesForBox(stepBounds)},geometry=options(floor(),[group]),{motion,target}=fixture();
 for(let frame=1;frame<=12;frame++)motion.sample(frame*1000/60,1/60,{side:1,yaw:0},geometry,target);
 assert.ok(target.x>.5);near(target.y,.26);assert.equal(motion.grounded,true);const stopped={...target};
 for(let frame=13;frame<=36;frame++)motion.sample(frame*1000/60,1/60,{},geometry,target);
 near(target.x,stopped.x);near(target.y,stopped.y);near(target.z,stopped.z);
});

test('court constraints bound local motion and leave no retained drift after releasing the stick',()=>{
 const {motion,target}=fixture();let calls=0;
 const geometry={...options(),constrain:(previous,proposed)=>{calls++;assert.ok(previous.x<=.500001);return {...proposed,x:Math.min(.5,proposed.x)};}};
 for(let frame=1;frame<=30;frame++)motion.sample(frame*1000/60,1/60,{side:1,yaw:0},geometry,target);
 near(target.x,.5);assert.equal(calls,30);
 for(let frame=31;frame<=90;frame++){
  const now=frame*1000/60;
  if(frame%12===0)acknowledge(motion,{x:.5,y:.02,z:0},now-1000/60,now);
  motion.sample(now,1/60,{},geometry,target);near(target.x,.5);near(target.z,0);
 }
 motion.sample(1520,1/60,{side:-1,yaw:0},geometry,target);near(target.x,.5-4/60);
});

test('authoritative horizontal corrections are swept against thin walls and retain safe tangent motion',()=>{
 const wallBounds=bounds(1,0,-10,1.001,3,10),geometry=options(floor(),[{bounds:wallBounds,triangles:trianglesForBox(wallBounds)}]),{motion,target}=fixture();
 for(let frame=1;frame<=30;frame++)motion.sample(frame*1000/60,1/60,{side:1,yaw:0},geometry,target);
 const contact=target.x;near(contact,.658,1e-5);
 acknowledge(motion,{x:2,y:.02,z:-.8},400,500);motion.sample(520,1/60,{},geometry,target);assert.ok(target.x<=.658001,'a delayed server correction must not cross a locally solid wall');assert.ok(target.z<-.1,'safe correction along the wall remains possible');
 // Even the large-error reconciliation path must use the capsule sweep.
 acknowledge(motion,{x:8,y:.02,z:target.z},530,550);motion.sample(560,1/60,{},geometry,target);assert.ok(target.x<=.658001);near(target.y,.02);
 const corrected={...target};
 for(let frame=1;frame<=12;frame++){
  motion.sample(560+frame*1000/60,1/60,{},geometry,target);near(target.x,corrected.x);assert.ok(target.x<=.658001);
 }
 motion.sample(780,1/60,{side:-1,yaw:0},geometry,target);near(target.x,corrected.x-4/60);
});

test('jump responds immediately and delayed grounded acknowledgments do not erase its arc',()=>{
 const {motion,target}=fixture(),geometry=options();motion.jump();motion.sample(1000/60,1/60,{},geometry,target);assert.ok(target.y>.04);assert.ok(motion.velocityY>0);assert.equal(motion.grounded,false);let highest=target.y;
 for(let frame=2;frame<=72;frame++){
  const now=frame*1000/60;
  if(frame%6===0&&now<=300)acknowledge(motion,{x:0,y:.02,z:0},Math.max(1,now-100),now);
  motion.sample(now,1/60,{},geometry,target);highest=Math.max(highest,target.y);assert.ok(target.y>=.019999,'jumping and landing never go below the floor');
 }
 assert.ok(highest>.55,`grounded acknowledgments shortened the jump to ${highest}`);near(target.y,.02);assert.equal(motion.grounded,true);near(motion.velocityY,0);
});

test('real ceiling triangles clip a jump and allow a clean landing',()=>{
 const ceiling=trianglesForBox(bounds(-5,2.4,-5,5,2.6,5)),geometry=options([...floor(),...ceiling]),{motion,target}=fixture();motion.jump();let highest=target.y,hitCeiling=false;
 for(let frame=1;frame<=72;frame++){
  motion.sample(frame*1000/60,1/60,{},geometry,target);highest=Math.max(highest,target.y);if(target.y>.1&&motion.velocityY===0&&!motion.grounded)hitCeiling=true;assert.ok(target.y>=.019999);
 }
 assert.ok(highest>.1&&highest<.8);assert.equal(hitCeiling,true);near(target.y,.02);assert.equal(motion.grounded,true);
});

test('explicit teleports and world resets clear prediction while long outages stop movement',()=>{
 const {motion,target}=fixture(),geometry=options();motion.sample(100, .025,{side:1},geometry,target);assert.ok(target.x>0);
 acknowledge(motion,{x:20,y:.02,z:10},200,200,{teleport:true});motion.sample(200,0,{},geometry,target);near(target.x,20);near(target.y,.02);near(target.z,10);
 motion.sample(220, .02,{side:1},geometry,target);near(target.x,20.08);
 for(let frame=1;frame<=180;frame++)motion.sample(220+frame*1000/60,1/60,{side:1},geometry,target);
 const stopped={...target};motion.sample(4000,.05,{side:1},geometry,target);near(target.x,stopped.x);near(target.z,stopped.z);
 motion.reset();const sentinel={x:-99,y:-99,z:-99};motion.sample(4100,.02,{side:1},geometry,sentinel);assert.deepEqual(sentinel,{x:-99,y:-99,z:-99});near(motion.velocityY,0);
});

function actualFloorOctree({width=20,x=0,ceiling=false,rotate=.37}={}){
 const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,20),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,4,0);root.add(mesh);root.rotation.y=rotate;
 if(ceiling){const roof=new THREE.Mesh(new THREE.BoxGeometry(10,.1,10),new THREE.MeshBasicMaterial());roof.position.y=5.2;root.add(roof);}
 return new Octree().fromGraphNode(root);
}
test('actual rotated floor geometry restores a grounded player after a short missing-cache fall below the floor',()=>{
 const {motion,target}=fixture({x:0,y:4.02,z:0}),missing={speed:4,octree:new Octree(),floorGap:.02};
 for(let frame=1;frame<=12;frame++)motion.sample(frame*1000/60,1/60,{side:1},missing,target);
 assert.ok(target.y<3.9);assert.ok(motion.velocityY<0);acknowledge(motion,{x:.6,y:4.02,z:0},150,200);
 motion.sample(1000*13/60,1/60,{side:1},{speed:4,octree:actualFloorOctree(),floorGap:.02},target);
 near(target.y,4.02);near(target.x,4*13/60);assert.equal(motion.grounded,true);near(motion.velocityY,0);
 for(let frame=14;frame<=60;frame++)motion.sample(frame*1000/60,1/60,{}, {octree:actualFloorOctree(),floorGap:.02},target);near(target.y,4.02);
});
test('verified authoritative support repairs small floor-clearance errors instead of waiting for a three-metre fall',()=>{
 const {motion,target}=fixture({x:0,y:4.02,z:0});for(let frame=1;frame<=3;frame++)motion.sample(frame*1000/60,1/60,{}, {octree:new Octree()},target);
 const lost=4.02-target.y;assert.ok(lost>.008&&lost<.03);acknowledge(motion,{x:0,y:4.02,z:0},50,50);motion.sample(1000*4/60,1/60,{}, {octree:actualFloorOctree(),floorGap:.02},target);near(target.y,4.02);assert.equal(motion.grounded,true);near(motion.velocityY,0);
});
test('recovery cannot invent support over a ledge or place a capsule inside a low ceiling',()=>{
 for(const geometry of [actualFloorOctree({width:1,x:-5,rotate:0}),actualFloorOctree({ceiling:true})]){
  const {motion,target}=fixture({x:0,y:4.02,z:0});for(let frame=1;frame<=12;frame++)motion.sample(frame*1000/60,1/60,{}, {octree:new Octree()},target);
  acknowledge(motion,{x:0,y:4.02,z:0},150,200);const before=target.y;motion.sample(1000*13/60,1/60,{}, {octree:geometry,floorGap:.02},target);assert.ok(target.y<=before,'no physical support or blocked standing space must not create a recovery floor');assert.equal(motion.grounded,false);
 }
});

test('large delayed walking acknowledgments never rewind held or released local controls',()=>{
 for(const fps of [5,30,60,120])for(const released of [false,true]){
  const {motion,target}=fixture(),geometry={...options(),speed:6},dt=1/fps;
  for(let frame=1;frame<=fps;frame++)motion.sample(frame*1000/fps,dt,{side:1},geometry,target);
  near(target.x,6);
  acknowledge(motion,{x:.4,y:.02,z:0},800,1000);
  let previous=target.x;
  for(let frame=1;frame<=Math.max(1,Math.round(fps*.2));frame++){
   motion.sample(1000+frame*1000/fps,dt,released?{}:{side:1},geometry,target);
   if(released)near(target.x,previous);
   else near(target.x-previous,6*dt);
   near(target.y,.02);near(target.z,0);previous=target.x;
  }
 }
});

test('an explicit jump stays responsive through a delayed heartbeat without extending stale walking',()=>{
 const {motion,target}=fixture();motion.sample(2700,.016,{forward:1},options(),target);const before={...target};
 motion.jump();motion.sample(2716,.016,{forward:1},options(),target);
 assert.ok(target.y>before.y+.05);near(target.x,before.x);near(target.z,before.z);
});
