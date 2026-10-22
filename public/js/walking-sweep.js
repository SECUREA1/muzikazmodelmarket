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
   const side=signed!==0?Math.sign(signed):-Math.sign(rate);
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
  if(distanceSquared<=(radius+EPSILON)*(radius+EPSILON)){
   const length=Math.sqrt(distanceSquared);
   if(length>0)consider(0,rx/length,rz/length);
   continue;
  }
  const dot=rx*motion.x+rz*motion.z,discriminant=dot*dot-speedSquared*(distanceSquared-radius*radius);
  if(discriminant<0)continue;
  const time=(-dot-Math.sqrt(discriminant))/speedSquared;
  consider(time,(rx+motion.x*time)/radius,(rz+motion.z*time)/radius);
 }
 return best;
}

function sweepSegments(previous,next,segments,radius,maxContacts){
 const position={x:previous.x,z:previous.z};
 let motion={x:next.x-previous.x,z:next.z-previous.z};
 if(Math.hypot(motion.x,motion.z)<EPSILON)return {...next,x:previous.x,z:previous.z};
 for(let iteration=0;iteration<maxContacts&&Math.hypot(motion.x,motion.z)>EPSILON;iteration++){
  let contact=null;
  for(const segment of segments){
   const hit=contactWithSegment(position,motion,segment,radius);
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

function segmentDistance(position,segment){
 const dx=segment.b.x-segment.a.x,dz=segment.b.z-segment.a.z,length=dx*dx+dz*dz;
 const ratio=length?Math.max(0,Math.min(1,((position.x-segment.a.x)*dx+(position.z-segment.a.z)*dz)/length)):0;
 return Math.hypot(position.x-segment.a.x-dx*ratio,position.z-segment.a.z-dz*ratio);
}

export function sweepWalkingMotion(previous,next,segments,{radius=.3,skin=.002,maxContacts=6}={}){
 const resolved=sweepSegments(previous,next,segments,radius+skin,maxContacts);
 if(Math.hypot(resolved.x-previous.x,resolved.z-previous.z)>EPSILON||Math.hypot(next.x-previous.x,next.z-previous.z)<EPSILON)return resolved;
 const clearance=segments.reduce((nearest,segment)=>Math.min(nearest,segmentDistance(previous,segment)),radius+skin);
 if(clearance===0||clearance>=radius-Math.max(skin,radius*.02))return resolved;
 // Detailed imported geometry can already intersect the capsule after a
 // height change. Recover only if every ordinary exit direction is blocked;
 // pressing into a wall must retain the normal collision radius.
 const reach=Math.max(radius,Math.min(1,Math.hypot(next.x-previous.x,next.z-previous.z)));
 for(let direction=0;direction<8;direction++){
  const angle=direction*Math.PI/4,probe=sweepSegments(previous,{...previous,x:previous.x+Math.sin(angle)*reach,z:previous.z+Math.cos(angle)*reach},segments,radius+skin,maxContacts);
  if(Math.hypot(probe.x-previous.x,probe.z-previous.z)>EPSILON)return resolved;
 }
 // Keep a small positive swept margin, including during repeated wall pressure,
 // so the center cannot converge onto a mesh vertex. Existing overlap still
 // permits moving away; only controls can escape and no surface is crossed.
 return sweepSegments(previous,next,segments,Math.max(clearance/2,Math.min(skin,.001)),maxContacts);
}
