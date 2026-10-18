import {ServerMotion} from './server-motion.js';

// Enemy and projectile poses use simulation timestamps. Repeated HTTP responses
// for one tick must not look like a stop followed by another burst of movement.
export class EnemySnapshotMotion {
 constructor({delay=100,maxExtrapolation=80}={}){
  this.motion=new ServerMotion({delay,maxExtrapolation,teleportDistance:5,maxGap:1000});this.reset();
 }
 reset(){this.motion.reset();this.lastTime=null;this.offset=null;this.targetOffset=null;this.lastRenderAt=null;}
 push(position,receivedAt,simulationTime=receivedAt){
  const time=Number.isFinite(simulationTime)?simulationTime:receivedAt;
  if(!Number.isFinite(receivedAt)||!Number.isFinite(time)||!['x','y','z'].every(axis=>Number.isFinite(position?.[axis])))return false;
  if(this.lastTime!==null&&time<=this.lastTime)return false;
  const gap=this.lastTime!==null&&time-this.lastTime>1000;
  this.motion.push(position,time);
  const reset=gap||this.motion.snapshots.length===1;
  const offset=receivedAt-time;
  if(reset||this.offset===null){this.offset=offset;this.targetOffset=offset;this.lastRenderAt=receivedAt;}
  else this.targetOffset=Math.min(this.targetOffset,offset);
  this.lastTime=time;return reset;
 }
 renderTime(now){
  if(this.offset===null)return null;
  const elapsed=Math.max(0,Math.min(100,now-(this.lastRenderAt??now)));this.lastRenderAt=now;
  // Clock correction is gradual; late packets never shift the render clock back.
  this.offset+=Math.max(-elapsed*.05,Math.min(elapsed*.05,this.targetOffset-this.offset));
  return now-this.offset-this.motion.delay;
 }
 sample(now,target){const time=this.renderTime(now);return time===null?target:this.motion.sample(time+this.motion.delay,target);}
}
