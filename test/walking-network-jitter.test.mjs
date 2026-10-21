import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {WalkingMotion} from '../public/js/walking-motion.js';
import {LocalWalkingView} from '../public/js/local-walking-view.js';

const origin={x:0,y:.02,z:0};
const floor=[new THREE.Triangle(new THREE.Vector3(-50,0,-50),new THREE.Vector3(-50,0,50),new THREE.Vector3(50,0,-50)),new THREE.Triangle(new THREE.Vector3(50,0,-50),new THREE.Vector3(-50,0,50),new THREE.Vector3(50,0,50))];
const octree={
 getCapsuleTriangles(_capsule,result){result.push(...floor);},
 triangleCapsuleIntersect(capsule,triangle){
  let nearest=null;
  for(const center of [capsule.start,capsule.end]){
   const closest=triangle.closestPointToPoint(center,new THREE.Vector3()),normal=center.clone().sub(closest),distance=normal.length();
   if(distance<capsule.radius&&(!nearest||distance<nearest.distance))nearest={distance,depth:capsule.radius-distance,normal:distance?normal.divideScalar(distance):triangle.getNormal(new THREE.Vector3()),point:closest};
  }
  return nearest;
 }
};
const wallBounds=new THREE.Box3(new THREE.Vector3(1,0,-10),new THREE.Vector3(1.01,3,10));
function wallTriangles(){
 const size=wallBounds.getSize(new THREE.Vector3()),center=wallBounds.getCenter(new THREE.Vector3()),geometry=new THREE.BoxGeometry(size.x,size.y,size.z).toNonIndexed(),positions=geometry.attributes.position,result=[];
 for(let index=0;index<positions.count;index+=3)result.push(new THREE.Triangle(...[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(positions,index+offset).add(center))));
 geometry.dispose();return result;
}
const wall={bounds:wallBounds,triangles:wallTriangles()};
const inputAt=(time,transitions)=>!transitions||time<2500?1:time<3000?0:time<4000?-1:0;

// Inputs take effect at request arrival, using the room's sequence guard.
// Faster later replies have changing uplink/downlink asymmetry.
function responses(transitions=false,blocked=false){
 const requests=[];
 for(let sentAt=0,index=0;sentAt<=6200;sentAt+=50,index++){
  const rtt=Math.max(60,360-index*3),up=rtt*(index%3===0?.7:.4);
  requests.push({sentAt,index,at:sentAt+up,receivedAt:sentAt+rtt,input:inputAt(sentAt,transitions)});
 }
 requests.sort((a,b)=>a.at-b.at);
 let position=0,previous=0,side=0,sequence=-1;
 for(const request of requests){
  position+=side*4*(request.at-previous)/1000;
  if(blocked)position=Math.min(.658,position);
  previous=request.at;
  if(request.index>sequence){sequence=request.index;side=request.input;}
  request.position={x:position,y:.02,z:0};
  request.serverTime=100000+request.at;request.simulationTime=request.serverTime;
 }
 return requests.sort((a,b)=>a.receivedAt-b.receivedAt);
}
function replay({immediate=true,frames=[1000/60],transitions=false,blocked=false}={}){
 const view=immediate?new LocalWalkingView():new WalkingMotion(),motion=immediate?view.motion:view,target={...origin};
 view.reconcile(origin,{serverTime:99820,simulationTime:99820,sentAt:-360,receivedAt:0,grounded:true});
 const packets=responses(transitions,blocked),samples=[];
 let now=0,packet=0,frame=0,previous=0;
 while(now<6000){
  const delta=frames[frame++%frames.length]/1000;now+=delta*1000;
  while(packet<packets.length&&packets[packet].receivedAt<=now){
   const reply=packets[packet++];view.reconcile(reply.position,{...reply,grounded:true});
  }
  const side=inputAt(now,transitions);
  if(immediate)view.sample(now,delta,{side},{speed:4,octree,triangleGroups:blocked?[wall]:[],floorGap:.02},target);
  else {view.sample(now,delta,{side},4,target);view.constrain(target);}
  samples.push({now,side,delta,x:target.x,step:target.x-previous,y:target.y});previous=target.x;
 }
 return {view,motion,target,samples};
}
test('unchanged collision output cannot feed eased position back into simulation history',()=>{
 const motion=new WalkingMotion({immediate:true}),target={};
 motion.reconcile(origin,{serverTime:0,sentAt:0,receivedAt:0});
 motion.sample(20,.02,{side:1},4,target);
 motion.reconcile({x:.02,z:0},{serverTime:10,sentAt:0,receivedAt:20});
 motion.sample(40,.02,{side:1},4,target);
 assert.ok(Math.abs(motion.offset.x)>.001,'the fixture must contain a real visual correction');
 const simulated=motion.position.x;motion.constrain(target);
 assert.equal(motion.position.x,simulated);
 assert.equal(motion.history.at(-1).x,simulated,'unchanged physical motion retains simulation coordinates');
 assert.notEqual(motion.history.at(-1).x,target.x);
});
for(const immediate of [false,true])for(const frames of [[1000/60],[8,17,12,33,16,50,10,24]])test((immediate?'physical immediate':'default eased')+' movement does not rewind or pause as RTT and asymmetry change '+frames.join('/'),()=>{
 const {motion,samples}=replay({immediate,frames});
 assert.equal(motion.clockOffset,-100000,'later RTT samples do not retime existing movement');
 for(const sample of samples){
  if(sample.now>500){
   assert.ok(sample.step>sample.delta*4*.75,'held input paused or reversed: '+JSON.stringify(sample));
   assert.ok(sample.step<sample.delta*4*1.25,'a reply caused a forward reset: '+JSON.stringify(sample));
  }
  if(immediate)assert.ok(Math.abs(sample.y-.02)<1e-8,'the physical floor remains supported');
 }
});
for(const frames of [[1000/60],[8,17,12,33,16,50,10,24],[100,200,50,100]])test('release and reversal remain immediate without idle lurches '+frames.join('/'),()=>{
 const {samples}=replay({frames,transitions:true});
 let previousSide=1;
 for(const sample of samples){
  if(sample.side===0)assert.ok(Math.abs(sample.step)<1e-8,'a late reply restarted a released stick: '+JSON.stringify(sample));
  if(sample.side===-1){
   assert.ok(sample.step<-.75*4*sample.delta,'reverse input paused: '+JSON.stringify(sample));
   if(previousSide!==-1)assert.ok(sample.step<0,'reversal applies on its first render');
  }
  previousSide=sample.side;
 }
});
test('varying RTT keeps wall pressure outside the mesh and release has no retained drift',()=>{
 const {samples,view,target}=replay({frames:[8,17,12,33,16,50,10,24],transitions:true,blocked:true});
 let previous=0;
 for(const sample of samples){
  assert.ok(sample.x<=.658001,'the capsule remains outside the thin wall');
  if(sample.now<2500)assert.ok(sample.x>=previous-1e-7,'held pressure cannot recoil from server responses');
  if(sample.side===0)assert.ok(Math.abs(sample.step)<1e-8,'blocked input leaves no motion after release');
  assert.ok(Math.abs(sample.y-.02)<1e-8);previous=sample.x;
 }
 view.reconcile({x:-8,y:.02,z:2},{serverTime:107000,simulationTime:107000,sentAt:6960,receivedAt:7040,grounded:true,teleport:true});
 view.sample(7040,0,{}, {speed:4,octree,triangleGroups:[wall],floorGap:.02},target);
 assert.ok(Math.abs(target.x+8)<1e-8);assert.ok(Math.abs(target.z-2)<1e-8);
});
