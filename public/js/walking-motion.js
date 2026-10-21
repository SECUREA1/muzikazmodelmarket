// Predict only the local walking view. The server still owns collisions and position.
// Reconcile against historical motion, then ease the visible correction separately.
export class WalkingMotion {
 constructor({immediate=false,staleAfter=500,staleFade=200,maxDelta=.05}={}){this.maxDelta=Math.max(.001,Math.min(.25,Number(maxDelta)||.05));this.immediate=immediate;this.staleAfter=staleAfter;this.staleFade=staleFade;this.reset();}
 reset(){this.position=null;this.history=[];this.velocity={x:0,z:0};this.offset={x:0,z:0};this.lastDirection={x:0,z:0};this.lastSnapshot=-Infinity;this.receivedAt=0;this.clockOffset=null;this.bestRtt=Infinity;this.pendingSnapshot=null;}
 reconcile(position,{serverTime,simulationTime=serverTime,sentAt,receivedAt}){
  if(Number.isFinite(sentAt)&&Number.isFinite(serverTime)){
   const rtt=Math.max(0,receivedAt-sentAt);
   this.bestRtt=Math.min(this.bestRtt,rtt);
   // Keep one source timeline for this world. Replacing the clock estimate
   // whenever a faster reply arrives retimes otherwise identical movement.
   if(this.clockOffset===null)this.clockOffset=(sentAt+receivedAt)/2-serverTime;
  }
  const time=Number.isFinite(simulationTime)&&this.clockOffset!==null?Math.min(receivedAt,simulationTime+this.clockOffset):receivedAt;
  if(time<=this.lastSnapshot)return;
  this.lastSnapshot=time;this.receivedAt=receivedAt;
  if(!this.position){this.position={x:position.x,z:position.z};this.history=[{time,x:position.x,z:position.z}];return;}
  let predicted=this.history[0];
  for(let i=1;i<this.history.length;i++){
   const next=this.history[i];
   if(next.time>=time){
    const a=Math.max(0,Math.min(1,(time-predicted.time)/Math.max(.001,next.time-predicted.time)));
    predicted={x:predicted.x+(next.x-predicted.x)*a,z:predicted.z+(next.z-predicted.z)*a};break;
   }
   predicted=next;
  }
  const latest=this.history.at(-1);
  if(time>latest.time){
   if(this.immediate){
    // A reply can arrive between two slow render frames. Compare it once the
    // next frame knows the current input, rather than yesterday's velocity.
    this.pendingSnapshot={position:{x:position.x,z:position.z},time};return;
   }
   const ahead=Math.min(this.maxDelta>.05?.25:.1,(time-latest.time)/1000);
   predicted={x:latest.x+this.velocity.x*ahead,z:latest.z+this.velocity.z*ahead};
   // Compare with that historical time without advancing the render clock.
   // The next frame integrates its own elapsed time exactly once.
  }
  this.correct(position,predicted,time);
 }
 correct(position,predicted,time){
  const dx=position.x-predicted.x,dz=position.z-predicted.z;
  this.position.x+=dx;this.position.z+=dz;
  if(Math.hypot(dx,dz)>3){
   this.position={x:position.x,z:position.z};this.offset={x:0,z:0};this.velocity={x:0,z:0};this.history=[{time,x:position.x,z:position.z}];return;
  }
  for(const entry of this.history){entry.x+=dx;entry.z+=dz;}
  this.offset.x-=dx;this.offset.z-=dz;
  // Bound visible wall penetration during a blocked move or a lost connection.
  const length=Math.hypot(this.offset.x,this.offset.z);
  if(!this.immediate&&length>.45){this.offset.x*=.45/length;this.offset.z*=.45/length;}
 }
 constrain(target){
  if(!this.position)return;
  for(const axis of ['x','z']){if(Math.abs(target[axis]-this.position[axis]-this.offset[axis])<1e-6)continue;this.position[axis]=target[axis];this.offset[axis]=0;this.velocity[axis]=0;}
  // History records simulation, never its eased visual correction. Writing
  // target here feeds yesterday's correction back into the next response.
  const latest=this.history.at(-1);if(latest){latest.x=this.position.x;latest.z=this.position.z;}
 }
 sample(now,delta,input,speed,target){
  if(!this.position)return target;
  const dt=Math.max(0,Math.min(this.maxDelta,delta));
  const forward=Math.max(-1,Math.min(1,Number(input.forward)||0)),side=Math.max(-1,Math.min(1,Number(input.side)||0));
  const yaw=Number(input.yaw)||0,age=now-this.receivedAt,fade=this.staleFade>0?Math.max(0,Math.min(1,(this.staleAfter-age)/this.staleFade)):age<=this.staleAfter?1:0,scale=speed*fade/Math.max(1,Math.hypot(forward,side));
  const desired={x:(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*scale,z:(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*scale};
  const movementSpeed=Math.hypot(desired.x,desired.z);
  if(movementSpeed)this.lastDirection={x:desired.x/movementSpeed,z:desired.z/movementSpeed};
  if(this.pendingSnapshot){
   const {position,time}=this.pendingSnapshot,latest=this.history.at(-1),ahead=Math.max(0,Math.min(dt,(time-latest.time)/1000));
   this.pendingSnapshot=null;
   this.correct(position,{x:latest.x+desired.x*ahead,z:latest.z+desired.z*ahead},time);
  }
  const decay=Math.exp(-35*dt),correctionDecay=Math.exp(-18*dt);
  const correction={x:this.offset.x*(1-correctionDecay),z:this.offset.z*(1-correctionDecay)};
  if(this.immediate){
   // A delayed movement acknowledgment must not restart a released stick or
   // overpower the current input. Independent sideways corrections can still
   // move the player, through the caller's physical collision sweep.
   if(movementSpeed){
    const length=Math.hypot(correction.x,correction.z),limit=movementSpeed*dt*.2;
    if(length>limit){const scale=limit/length;correction.x*=scale;correction.z*=scale;}
   }else{
    const along=correction.x*this.lastDirection.x+correction.z*this.lastDirection.z;
    correction.x-=along*this.lastDirection.x;correction.z-=along*this.lastDirection.z;
   }
  }
  for(const axis of ['x','z']){
   this.position[axis]+=this.immediate?desired[axis]*dt:desired[axis]*dt+(this.velocity[axis]-desired[axis])*(1-decay)/35;
   this.velocity[axis]=this.immediate?desired[axis]:desired[axis]+(this.velocity[axis]-desired[axis])*decay;
   this.offset[axis]-=correction[axis];
   target[axis]=this.position[axis]+this.offset[axis];
  }
  this.history.push({time:now,x:this.position.x,z:this.position.z});
  while(this.history.length>256||this.history.length>2&&this.history[1].time<now-2000)this.history.shift();
  return target;
 }
}

export function walkingStick(x,y,deadzone=.08){
 const length=Math.hypot(x,y),amount=Math.min(1,Math.max(0,(length-deadzone)/(1-deadzone)));
 return amount?{x:x/length*amount,y:y/length*amount}:{x:0,y:0};
}
export function walkingSprint(wasSprinting,amount){return amount>(wasSprinting?.64:.82);}
