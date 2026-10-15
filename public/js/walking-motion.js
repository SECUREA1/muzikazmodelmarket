// Predict only the local walking view. The server still owns collisions and position.
// Reconcile against historical motion, then ease the visible correction separately.
export class WalkingMotion {
 constructor(){this.reset();}
 reset(){this.position=null;this.history=[];this.velocity={x:0,z:0};this.offset={x:0,z:0};this.lastSnapshot=-Infinity;this.receivedAt=0;this.clockOffset=null;this.bestRtt=Infinity;}
 reconcile(position,{serverTime,simulationTime=serverTime,sentAt,receivedAt}){
  if(Number.isFinite(sentAt)&&Number.isFinite(serverTime)){
   const rtt=Math.max(0,receivedAt-sentAt);
   if(rtt<=this.bestRtt){this.bestRtt=rtt;this.clockOffset=(sentAt+receivedAt)/2-serverTime;}
  }
  const time=Number.isFinite(simulationTime)&&this.clockOffset!==null?simulationTime+this.clockOffset:receivedAt;
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
   const ahead=Math.min(.1,(time-latest.time)/1000);
   predicted={x:latest.x+this.velocity.x*ahead,z:latest.z+this.velocity.z*ahead};
  }
  const dx=position.x-predicted.x,dz=position.z-predicted.z;
  this.position.x+=dx;this.position.z+=dz;
  if(Math.hypot(dx,dz)>3){
   this.position={x:position.x,z:position.z};this.offset={x:0,z:0};this.velocity={x:0,z:0};this.history=[{time,x:position.x,z:position.z}];return;
  }
  for(const entry of this.history){entry.x+=dx;entry.z+=dz;}
  this.offset.x-=dx;this.offset.z-=dz;
  // Bound visible wall penetration during a blocked move or a lost connection.
  const length=Math.hypot(this.offset.x,this.offset.z);
  if(length>.45){this.offset.x*=.45/length;this.offset.z*=.45/length;}
 }
 sample(now,delta,input,speed,target){
  if(!this.position)return target;
  const dt=Math.max(0,Math.min(.05,delta));
  const forward=Math.max(-1,Math.min(1,Number(input.forward)||0)),side=Math.max(-1,Math.min(1,Number(input.side)||0));
  const yaw=Number(input.yaw)||0,scale=now-this.receivedAt<300?speed/Math.max(1,Math.hypot(forward,side)):0;
  const desired={x:(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*scale,z:(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*scale};
  const decay=Math.exp(-35*dt),correctionDecay=Math.exp(-18*dt);
  for(const axis of ['x','z']){
   this.position[axis]+=desired[axis]*dt+(this.velocity[axis]-desired[axis])*(1-decay)/35;
   this.velocity[axis]=desired[axis]+(this.velocity[axis]-desired[axis])*decay;
   this.offset[axis]*=correctionDecay;
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
