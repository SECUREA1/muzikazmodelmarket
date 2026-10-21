import {Vector3} from '../vendor/three/three.module.min.js';
import {Capsule} from '../vendor/three/addons/math/Capsule.js';
import {WalkingMotion} from './walking-motion.js';
import {moveWalkingCapsule} from './walking-capsule.js';
import {triangleHeightAt,triangleNormalY} from './walking-triangles.js';
import {Octree} from '../vendor/three/addons/math/Octree.js';
const fallbackContacts=new Octree();

const finitePosition=position=>['x','y','z'].every(axis=>Number.isFinite(position?.[axis]));

// Local input moves the view immediately. Both input and server corrections
// pass through the same physical capsule sweep; the server still owns gameplay.
export class LocalWalkingView {
 constructor({radius=.34,height=1.65}={}){
  this.radius=Math.max(.05,Number(radius)||.34);this.height=Math.max(this.radius*2+.01,Number(height)||1.65);
  this.motion=new WalkingMotion({immediate:true,staleAfter:1200,staleFade:0,maxDelta:.25});this.reset();
 }
 reset(){
  this.motion.reset();this.capsule=null;this.position=null;this.grounded=false;this.velocityY=0;this.jumpQueued=false;this.jumpDown=false;this.verticalHistory=[];this.verticalCorrection=0;this.floorRecovery=null;
 }
 setPosition(position){
  this.capsule=new Capsule(new Vector3(position.x,position.y+this.radius,position.z),new Vector3(position.x,position.y+this.height-this.radius,position.z),this.radius);
  this.position={...position};
 }
 reconcile(position,{serverTime,simulationTime=serverTime,sentAt,receivedAt=performance.now(),grounded=true,teleport=false}={}){
  if(!finitePosition(position)||!Number.isFinite(receivedAt))return false;
  if(teleport)this.reset();
  const initial=!this.capsule,previous=this.motion.lastSnapshot;
  this.motion.reconcile(position,{serverTime,simulationTime,sentAt,receivedAt});
  if(this.motion.lastSnapshot===previous)return false;
  if(initial){this.setPosition(position);this.grounded=grounded===true;this.verticalHistory=[{time:this.motion.lastSnapshot,y:position.y}];return true;}
  this.floorRecovery=null;this.verticalCorrection=0;
  // A late grounded response may describe the beginning of a jump. Compare
  // heights on its historical timeline rather than cancelling today's jump.
  const time=this.motion.lastSnapshot,history=this.verticalHistory;
  if(history.length&&time>=history[0].time&&time<=history.at(-1).time){
   let predicted=history[0].y;
   for(let index=1;index<history.length;index++){
    const before=history[index-1],after=history[index];
    if(time<=after.time){predicted=before.y+(after.y-before.y)*Math.max(0,Math.min(1,(time-before.time)/Math.max(.001,after.time-before.time)));break;}
   }
   const error=position.y-predicted;
   if(grounded===true&&error>.008)this.floorRecovery={height:position.y,receivedAt};
   else if(Math.abs(error)>3)this.verticalCorrection=error;
  }
  return true;
 }
 recoverFloor(now,options){
  const hint=this.floorRecovery;if(!hint||this.velocityY>0||now-hint.receivedAt>1200||this.position.y>=hint.height-.001)return false;
  const gap=options.floorGap??.02,candidate=this.capsule.clone(),shift=hint.height-this.position.y;candidate.start.y+=shift;candidate.end.y+=shift;
  const broad=candidate.clone();broad.radius+=.08;const triangles=[];options.octree?.getCapsuleTriangles?.(broad,triangles);
  const bounds={min:{x:broad.start.x-broad.radius,y:broad.start.y-broad.radius,z:broad.start.z-broad.radius},max:{x:broad.start.x+broad.radius,y:broad.end.y+broad.radius,z:broad.start.z+broad.radius}};
  for(const group of options.triangleGroups||[]){const box=group.bounds;if(box&&(box.min.x>bounds.max.x||box.max.x<bounds.min.x||box.min.y>bounds.max.y||box.max.y<bounds.min.y||box.min.z>bounds.max.z||box.max.z<bounds.min.z))continue;for(const triangle of group.triangles||[])triangles.push(triangle);}
  let supported=null;
  for(const triangle of triangles){
   if(triangleNormalY(triangle)<.55)continue;const height=triangleHeightAt(this.position.x,this.position.z,triangle);if(height===null)continue;const feet=height+gap;
   if(Math.abs(feet-hint.height)<=.06&&(supported===null||Math.abs(feet-hint.height)<Math.abs(supported-hint.height)))supported=feet;
  }
  // A server height is only a hint. Missing geometry or a real ledge must
  // remain unsupported rather than becoming an invisible floor.
  if(supported===null||supported<=this.position.y+.001)return false;
  const correction=supported-hint.height;candidate.start.y+=correction;candidate.end.y+=correction;
  const contacts=options.octree?.triangleCapsuleIntersect?options.octree:fallbackContacts;
  for(const triangle of triangles){const hit=contacts.triangleCapsuleIntersect(candidate,triangle);if(hit&&hit.depth>.002&&hit.normal.y<.55)return false;}
  this.capsule=candidate;this.position={...this.position,y:supported};this.grounded=true;this.velocityY=0;this.verticalCorrection=0;this.floorRecovery=null;return true;
 }
 jump(){if(!this.capsule||!this.grounded)return false;this.jumpQueued=true;return true;}
 sample(now,delta,input={},options={},target={}){
  if(!this.capsule)return target;
  const dt=Math.max(0,Math.min(.25,Number(delta)||0)),stale=now-this.motion.receivedAt>1200;
  this.recoverFloor(now,options);
  const jumpPressed=input.jump===true;if(jumpPressed&&!this.jumpDown&&!stale)this.jumpQueued=true;this.jumpDown=jumpPressed;
  if(this.jumpQueued&&this.grounded&&!stale){this.velocityY=6;this.grounded=false;}this.jumpQueued=false;
  const candidate={x:this.position.x,z:this.position.z};this.motion.sample(now,dt,stale?{}:input,Math.max(0,Number(options.speed??4)||0),candidate);
  const previous={...this.position},proposed={x:candidate.x,y:previous.y,z:candidate.z},constrained=options.constrain?.(previous,proposed)||proposed;
  const dx=(Number.isFinite(constrained.x)?constrained.x:previous.x)-previous.x,dz=(Number.isFinite(constrained.z)?constrained.z:previous.z)-previous.z;
  const steps=Math.max(1,Math.ceil(dt/(1/60))),step=dt/steps,correction=this.verticalCorrection;this.verticalCorrection=0;
  for(let index=0;index<steps;index++){
   if(!this.grounded)this.velocityY-=18*step;
   const contact=moveWalkingCapsule(this.capsule,{x:dx/steps,y:this.velocityY*step+correction/steps,z:dz/steps},{octree:options.octree,triangleGroups:options.triangleGroups||[],grounded:this.grounded,verticalVelocity:this.velocityY,maxStepHeight:.26,floorGap:options.floorGap??.02});
   this.grounded=contact.onGround;this.velocityY=contact.velocityY;
  }
  this.position={x:this.capsule.start.x,y:this.capsule.start.y-this.radius,z:this.capsule.start.z};
  this.motion.constrain(this.position);Object.assign(target,this.position);
  this.verticalHistory.push({time:now,y:this.position.y});
  while(this.verticalHistory.length>256||this.verticalHistory.length>2&&this.verticalHistory[1].time<now-2500)this.verticalHistory.shift();
  return target;
 }
}
