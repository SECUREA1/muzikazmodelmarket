// Serializable table physics shared by the live room and its in-world rendering.
export const YACHT_TABLE=Object.freeze({x:2.4,y:3.25,z:8,radius:.075,minX:1.15,maxX:3.65,minZ:5.8,maxZ:10.2});
const colors=['#f1f0df','#eac62c','#2666c8','#d82f3f','#502762','#ed7d36','#236b42'];
export function createYachtBilliards(revision=0){
 const balls=[{x:2.4,z:9.3},...Array.from({length:6},(_,i)=>({x:2.24+(i%3)*.16,z:6.9+Math.floor(i/3)*.17}))].map((ball,i)=>({...ball,vx:0,vz:0,sunk:false,color:colors[i]}));
 return {revision,balls,shots:0,score:0,moving:false,message:'Aim the cue ball, choose power, then take a shot.'};
}
export function shootYachtBilliards(state,angle,power){
 if(state.moving)throw Error('Wait for the balls to stop.');
 if(!Number.isFinite(angle)||!Number.isFinite(power)||power<.1||power>1)throw Error('Choose a valid aim and shot power.');
 if(state.balls.slice(1).every(ball=>ball.sunk))throw Error('Table cleared. Rack a new game.');
 const cue=state.balls[0];cue.vx=Math.sin(angle)*power*6;cue.vz=-Math.cos(angle)*power*6;state.shots++;state.revision++;state.moving=true;state.message='Balls rolling…';
 return state;
}
export function stepYachtBilliards(state,delta){
 if(!state?.moving)return state;
 const duration=Math.max(0,Math.min(.25,Number(delta)||0)),steps=Math.max(1,Math.ceil(duration/(1/120))),dt=duration/steps,r=YACHT_TABLE.radius;
 const pockets=[1.15,3.65].flatMap(x=>[5.8,8,10.2].map(z=>({x,z})));
 for(let step=0;step<steps;step++){
  for(const [index,ball] of state.balls.entries()){
   if(ball.sunk)continue;ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;ball.vx*=Math.exp(-1.3*dt);ball.vz*=Math.exp(-1.3*dt);
   if(pockets.some(p=>Math.hypot(ball.x-p.x,ball.z-p.z)<.17)){
    ball.vx=ball.vz=0;
    if(index===0){ball.x=2.4;ball.z=9.3;state.message='Scratch — cue ball returned.';}else{ball.sunk=true;state.score+=100;state.message='Pocketed! +100 points.';}continue;
   }
   for(const [axis,velocity,min,max] of [['x','vx',1.15+r,3.65-r],['z','vz',5.8+r,10.2-r]]){
    if(ball[axis]<min||ball[axis]>max){ball[axis]=Math.max(min,Math.min(max,ball[axis]));ball[velocity]*=-.85;}
   }
  }
  for(let i=0;i<state.balls.length;i++)for(let j=i+1;j<state.balls.length;j++){
   const a=state.balls[i],b=state.balls[j];if(a.sunk||b.sunk)continue;
   const dx=b.x-a.x,dz=b.z-a.z,distance=Math.hypot(dx,dz);if(distance>=2*r||distance<1e-8)continue;
   const nx=dx/distance,nz=dz/distance,relative=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
   if(relative>0){a.vx-=relative*nx;a.vz-=relative*nz;b.vx+=relative*nx;b.vz+=relative*nz;}
   const push=(2*r-distance)/2+.00001;a.x-=nx*push;a.z-=nz*push;b.x+=nx*push;b.z+=nz*push;
  }
 }
 state.moving=state.balls.some(ball=>!ball.sunk&&Math.hypot(ball.vx,ball.vz)>.04);
 if(!state.moving){for(const ball of state.balls)ball.vx=ball.vz=0;state.revision++;state.message=state.balls.slice(1).every(ball=>ball.sunk)?'Table cleared! Rack a new game.':'Your next shot — aim and choose power.';}
 return state;
}
