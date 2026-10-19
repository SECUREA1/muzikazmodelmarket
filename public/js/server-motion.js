// Presentation only: interpolate a short snapshot buffer at render frequency.
// Collisions, health and movement remain server controlled.
export class ServerMotion {
 constructor({delay=100,maxExtrapolation=75,teleportDistance=2.5,maxGap=500,snapDistance=teleportDistance,resetGap=maxGap}={}){
  this.delay=delay;this.maxExtrapolation=maxExtrapolation;this.snapDistance=snapDistance;this.resetGap=resetGap;this.reset();

 }
 reset(){this.snapshots=[];this.position=null;this.receivedAt=0;this.serverTimeOffset=null;}
 push(position,now,{serverTime,teleport=false}={}){
  if(!Number.isFinite(now)||!['x','y','z'].every(axis=>Number.isFinite(position?.[axis])))return false;
  const previous=this.snapshots.at(-1);
  const hasServerTime=Number.isFinite(serverTime);
  if(previous&&(now<this.receivedAt||hasServerTime&&Number.isFinite(previous.serverTime)&&serverTime<previous.serverTime))return false;
  const distance=previous?Math.hypot(position.x-previous.position.x,position.y-previous.position.y,position.z-previous.position.z):0;
  if(teleport||distance>this.snapDistance||previous&&now-this.receivedAt>this.resetGap)this.reset();
  // A stable source timeline removes arrival jitter without re-timing earlier
  // frames whenever latency changes. Callers may keep using arrival time only.
  let time=now;
  if(hasServerTime){
   if(this.serverTimeOffset===null)this.serverTimeOffset=now-serverTime;
   time=serverTime+this.serverTimeOffset;
  }
  if(this.snapshots.at(-1)?.time>time)return false;
  const snapshot={position:{...position},time,serverTime:hasServerTime?serverTime:undefined};
  if(this.snapshots.at(-1)?.time===time)this.snapshots.pop();

  this.snapshots.push(snapshot);
  // Keep enough history for uneven HTTP delivery without growing indefinitely.
  while(this.snapshots.length>32)this.snapshots.shift();
  this.position={...position};this.receivedAt=now;
  return true;
 }
 sample(now,target){
  const frames=this.snapshots;if(!frames.length)return target;
  const time=now-this.delay;
  while(frames.length>2&&frames[1].time<=time)frames.shift();
  const first=frames[0];
  if(time<=first.time||frames.length===1){Object.assign(target,first.position);return target;}
  for(let i=1;i<frames.length;i++){
   const a=frames[i-1],b=frames[i];
   if(time<=b.time){
    const alpha=(time-a.time)/(b.time-a.time);
    for(const axis of ['x','y','z'])target[axis]=a.position[axis]+(b.position[axis]-a.position[axis])*alpha;
    return target;
   }
  }
  const last=frames.at(-1),previous=frames.at(-2),dt=last.time-previous.time;
  const ahead=Math.max(0,Math.min(this.maxExtrapolation,time-last.time));
  const distance=Math.hypot(...['x','y','z'].map(axis=>last.position[axis]-previous.position[axis]));
  const limit=distance?Math.min(1,15*dt/1000/distance):1;
  for(const axis of ['x','y','z'])target[axis]=last.position[axis]+(dt>=25?(last.position[axis]-previous.position[axis])*ahead/dt*limit:0);
  return target;
 }
}
