// Presentation only: collisions, health and movement remain server controlled.
// Brief extrapolation prevents the camera braking between network snapshots.
export class ServerMotion {
 constructor(){this.reset();}
 reset(){this.position=null;this.velocity={x:0,y:0,z:0};this.receivedAt=0;}
 push(position,now){
  const dt=(now-this.receivedAt)/1000,previous=this.position;
  const distance=previous?Math.hypot(position.x-previous.x,position.y-previous.y,position.z-previous.z):Infinity;
  for(const axis of ['x','y','z'])this.velocity[axis]=previous&&dt>=.025&&dt<.5&&distance<2.5?(position[axis]-previous[axis])/dt:0;
  const speed=Math.hypot(this.velocity.x,this.velocity.y,this.velocity.z);
  if(speed>15)for(const axis of ['x','y','z'])this.velocity[axis]*=15/speed;
  this.position={...position};this.receivedAt=now;
 }
 sample(now,target){
  if(!this.position)return target;
  const ahead=Math.max(0,Math.min(.1,(now-this.receivedAt)/1000));
  for(const axis of ['x','y','z'])target[axis]=this.position[axis]+this.velocity[axis]*ahead;
  return target;
 }
}
