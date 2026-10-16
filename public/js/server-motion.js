// Presentation only: interpolate a short snapshot buffer at render frequency.
// Collisions, health and movement remain server controlled.
export class ServerMotion {
 constructor({delay=100,maxExtrapolation=75}={}){
  this.delay=delay;this.maxExtrapolation=maxExtrapolation;this.reset();
 }
 reset(){this.snapshots=[];this.position=null;this.receivedAt=0;}
 push(position,now){
  const previous=this.snapshots.at(-1);
  if(previous&&now<previous.time)return;
  const distance=previous?Math.hypot(position.x-previous.position.x,position.y-previous.position.y,position.z-previous.position.z):0;
  if(distance>2.5||previous&&now-previous.time>500)this.reset();
  const snapshot={position:{...position},time:now};
  if(this.snapshots.at(-1)?.time===now)this.snapshots.pop();
  this.snapshots.push(snapshot);
  // Keep enough history for uneven HTTP delivery without growing indefinitely.
  while(this.snapshots.length>32)this.snapshots.shift();
  this.position={...position};this.receivedAt=now;
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
