// Clip intended horizontal movement against nearby physical edges. Contacts
// remove only the motion into a surface: they never push an idle/overlapping
// player out of geometry or discard the motion along a wall.
const EPSILON = 1e-9;

function contactWithSegment(position, motion, segment, radius) {
 const ax=segment.a.x,az=segment.a.z,bx=segment.b.x,bz=segment.b.z;
 const ex=bx-ax,ez=bz-az,lengthSquared=ex*ex+ez*ez;
 let best=null;
 const consider=(time,nx,nz)=>{
  if(time< -EPSILON||time>1+EPSILON||motion.x*nx+motion.z*nz>=-EPSILON)return;
  if(!best||time<best.time)best={time:Math.max(0,time),x:nx,z:nz};
 };
 if(lengthSquared>EPSILON){
  const length=Math.sqrt(lengthSquared),nx=-ez/length,nz=ex/length;
  const signed=(position.x-ax)*nx+(position.z-az)*nz,rate=motion.x*nx+motion.z*nz;
  const projection=((position.x-ax)*ex+(position.z-az)*ez)/lengthSquared;
  if(projection>=0&&projection<=1&&Math.abs(signed)<=radius+EPSILON){
   // When exactly on an edge there is no reliable outside direction. Stop
   // only the normal component of the requested motion, without relocating.
   const side=Math.abs(signed)>EPSILON?Math.sign(signed):-Math.sign(rate);
   consider(0,nx*side,nz*side);
  }
  if(Math.abs(rate)>EPSILON)for(const side of [-1,1]){
   const time=(side*radius-signed)/rate;
   const along=((position.x+motion.x*time-ax)*ex+(position.z+motion.z*time-az)*ez)/lengthSquared;
   if(along>=-EPSILON&&along<=1+EPSILON)consider(time,nx*side,nz*side);
  }
 }
 const speedSquared=motion.x*motion.x+motion.z*motion.z;
 if(speedSquared>EPSILON)for(const endpoint of [segment.a,segment.b]){
  const rx=position.x-endpoint.x,rz=position.z-endpoint.z,distanceSquared=rx*rx+rz*rz;
  if(distanceSquared<=radius*radius+EPSILON){
   const length=Math.sqrt(distanceSquared);
   if(length>EPSILON)consider(0,rx/length,rz/length);
   continue;
  }
  const dot=rx*motion.x+rz*motion.z,discriminant=dot*dot-speedSquared*(distanceSquared-radius*radius);
  if(discriminant<0)continue;
  const time=(-dot-Math.sqrt(discriminant))/speedSquared;
  consider(time,(rx+motion.x*time)/radius,(rz+motion.z*time)/radius);
 }
 return best;
}

export function sweepWalkingMotion(previous,next,segments,{radius=.3,skin=.002,maxContacts=6}={}){
 const position={x:previous.x,z:previous.z};
 let motion={x:next.x-previous.x,z:next.z-previous.z};
 if(Math.hypot(motion.x,motion.z)<EPSILON)return {...next,x:previous.x,z:previous.z};
 for(let iteration=0;iteration<maxContacts&&Math.hypot(motion.x,motion.z)>EPSILON;iteration++){
  let contact=null;
  for(const segment of segments){
   const hit=contactWithSegment(position,motion,segment,radius+skin);
   if(hit&&(!contact||hit.time<contact.time))contact=hit;
  }
  if(!contact){position.x+=motion.x;position.z+=motion.z;break;}
  position.x+=motion.x*contact.time;position.z+=motion.z*contact.time;
  const remainder=1-contact.time;
  motion.x*=remainder;motion.z*=remainder;
  const into=motion.x*contact.x+motion.z*contact.z;
  if(into<0){motion.x-=into*contact.x;motion.z-=into*contact.z;}
 }
 return {...next,x:position.x,z:position.z};
}
