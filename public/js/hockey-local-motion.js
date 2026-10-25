import {RINK} from './hockey-rules.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
// The same acceleration, skate speed, boards and goal footprint used by stepHockey.
// This projects only the controlled skater; puck, opponents and rules stay server-owned.
export function stepLocalHockeySkater(player,input,delta,goalie=false){
 const p={...player},dt=clamp(delta,0,.05),x=clamp(input.x,-1,1),z=clamp(input.z,-1,1),length=Math.max(1,Math.hypot(x,z)),speed=(goalie?3.2:7.8)*(.8+clamp(p.stamina??1,.5,1)*.2),blend=Math.min(1,6*dt);
 p.vx=(Number(p.vx)||0)+(x/length*speed-(Number(p.vx)||0))*blend;p.vz=(Number(p.vz)||0)+(z/length*speed-(Number(p.vz)||0))*blend;p.x+=p.vx*dt;p.z+=p.vz*dt;
 const hx=RINK.length/2-.4,hz=RINK.width/2-.4,r=RINK.corner,cx=hx-r,cz=hz-r;p.x=clamp(p.x,-hx,hx);p.z=clamp(p.z,-hz,hz);const dx=Math.max(0,Math.abs(p.x)-cx),dz=Math.max(0,Math.abs(p.z)-cz),distance=Math.hypot(dx,dz);if(distance>r){p.x=Math.sign(p.x)*(cx+dx/distance*r);p.z=Math.sign(p.z)*(cz+dz/distance*r);}
 for(const sign of [-1,1]){const along=p.x*sign,front=RINK.goalX-.35,back=RINK.goalX+1.35,side=RINK.goalWidth/2+.35;if(along>front&&along<back&&Math.abs(p.z)<side){const nearest=Math.min(along-front,back-along,side-Math.abs(p.z));if(nearest===along-front){p.x=sign*front;p.vx=0;}else if(nearest===back-along){p.x=sign*back;p.vx=0;}else{p.z=(p.z<0?-1:1)*side;p.vz=0;}}}
 if(Math.hypot(p.vx,p.vz)>.2)p.yaw=Math.atan2(p.vx,p.vz);if(!p.cooldown)p.animation=Math.hypot(p.vx,p.vz)>.5?'skate':'idle';return p;
}
export class LocalHockeyMotion{
 constructor(){this.reset();}
 reset(){this.current=null;this.history=[];this.offset={x:0,z:0};this.key=null;this.lastTime=-Infinity;this.clockOffset=null;this.bestRtt=Infinity;this.receivedAt=-Infinity;}
 accept(state,selfId,{sentAt,receivedAt=performance.now(),serverTime}={}){
  const player=state?.players.find(p=>p.human===selfId);if(!player){this.reset();return;}
  const active=['playing','shootout'].includes(state.phase)&&player.onIce!==false&&!(player.penalty>0&&!player.queuedReplacement)&&!player.ejected&&!(player.misconduct>0),key=[player.id,state.period,state.phase,active,player.movementRevision||0].join(':');
  if(Number.isFinite(sentAt)&&Number.isFinite(serverTime)){const rtt=Math.max(0,receivedAt-sentAt);if(rtt<=this.bestRtt){this.bestRtt=rtt;this.clockOffset=(sentAt+receivedAt)/2-serverTime;}}
  const time=Number.isFinite(serverTime)&&this.clockOffset!==null?serverTime+this.clockOffset:receivedAt;this.receivedAt=receivedAt;this.active=active;this.goalie=player.goalie&&!state.goaliesPulled?.[player.team];
  if(!this.current||this.key!==key){this.key=key;this.current={...player};this.offset={x:0,z:0};this.history=[{time,...this.current}];this.lastTime=time;return;}
  if(time<=this.lastTime)return;this.lastTime=time;let predicted=this.history[0];for(let i=1;i<this.history.length;i++){const next=this.history[i];if(next.time>=time){const t=clamp((time-predicted.time)/Math.max(.001,next.time-predicted.time),0,1);predicted={x:predicted.x+(next.x-predicted.x)*t,z:predicted.z+(next.z-predicted.z)*t,vx:predicted.vx+(next.vx-predicted.vx)*t,vz:predicted.vz+(next.vz-predicted.vz)*t};break;}predicted=next;}
  const error={x:player.x-predicted.x,z:player.z-predicted.z};if(Math.hypot(error.x,error.z)>3){this.current={...player};this.offset={x:0,z:0};this.history=[{time,...this.current}];return;}
  for(const axis of ['x','z']){this.current[axis]+=error[axis];this.offset[axis]-=error[axis];for(const point of this.history)point[axis]+=error[axis];const velocity='v'+axis;this.current[velocity]+=(Number(player[velocity])||0)-(Number(predicted[velocity])||0);}
  this.current.stamina=player.stamina;this.current.cooldown=player.cooldown;const errorLength=Math.hypot(this.offset.x,this.offset.z);if(errorLength>.5){this.offset.x*=.5/errorLength;this.offset.z*=.5/errorLength;}
 }
 sample(now,delta,input){
  if(!this.current)return null;let remaining=clamp(delta,0,.25);if(this.active){while(remaining>1e-6){const dt=Math.min(1/60,remaining);this.current=stepLocalHockeySkater(this.current,input,dt,this.goalie);remaining-=dt;}}
  const decay=Math.exp(-18*clamp(delta,0,.25));this.offset.x*=decay;this.offset.z*=decay;this.history.push({time:now,...this.current});while(this.history.length>256||this.history.length>2&&this.history[1].time<now-2000)this.history.shift();return {...this.current,x:this.current.x+this.offset.x,z:this.current.z+this.offset.z};
 }
}
// Send press/release immediately while bounding simultaneous requests. A slow
// response never blocks local motion; only the newest waiting intent is retained.
export function createHockeyInputPump({send,onSnapshot,onError=()=>{},now=()=>performance.now(),limit=3}){
 let pending=null,inFlight=0,epoch=0,active=true;const drain=()=>{while(active&&pending&&inFlight<limit){const input=pending;pending=null;const sentAt=now(),generation=epoch;inFlight++;Promise.resolve().then(()=>send(input)).then(snapshot=>{if(active&&generation===epoch)onSnapshot(snapshot,{sentAt,receivedAt:now()});}).catch(error=>{if(active&&generation===epoch)onError(error);}).finally(()=>{inFlight--;drain();});}};
 return {push(input){pending={...input};drain();},reset(){epoch++;pending=null;},stop(){active=false;pending=null;epoch++;},get inFlight(){return inFlight;},get pending(){return pending;}};
}
