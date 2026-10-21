import {Vector3} from '../vendor/three/three.module.min.js';
import {Capsule} from '../vendor/three/addons/math/Capsule.js';
import {WalkingMotion} from './walking-motion.js';
import {moveWalkingCapsule} from './walking-capsule.js';

const finitePosition=position=>['x','y','z'].every(axis=>Number.isFinite(position?.[axis]));

// Local input moves the view immediately. Both input and server corrections
// pass through the same physical capsule sweep; the server still owns gameplay.
export class LocalWalkingView {
 constructor({radius=.34,height=1.65}={}){
  this.radius=Math.max(.05,Number(radius)||.34);this.height=Math.max(this.radius*2+.01,Number(height)||1.65);
  this.motion=new WalkingMotion({immediate:true,staleAfter:1200,staleFade:0,maxDelta:.25});this.reset();
 }
 reset(){
  this.motion.reset();this.capsule=null;this.position=null;this.grounded=false;this.velocityY=0;this.jumpQueued=false;this.jumpDown=false;this.verticalHistory=[];this.verticalCorrection=0;
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
  // A late grounded response may describe the beginning of a jump. Compare
  // heights on its historical timeline rather than cancelling today's jump.
  const time=this.motion.lastSnapshot,history=this.verticalHistory;
  if(history.length&&time>=history[0].time&&time<=history.at(-1).time){
   let predicted=history[0].y;
   for(let index=1;index<history.length;index++){
    const before=history[index-1],after=history[index];
    if(time<=after.time){predicted=before.y+(after.y-before.y)*Math.max(0,Math.min(1,(time-before.time)/Math.max(.001,after.time-before.time)));break;}
   }
   const error=position.y-predicted;if(Math.abs(error)>3)this.verticalCorrection=error;
  }
  return true;
 }
 jump(){if(!this.capsule||!this.grounded)return false;this.jumpQueued=true;return true;}
 sample(now,delta,input={},options={},target={}){
  if(!this.capsule)return target;
  const dt=Math.max(0,Math.min(.25,Number(delta)||0)),stale=now-this.motion.receivedAt>1200;
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
