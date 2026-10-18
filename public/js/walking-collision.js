// Sweep short horizontal steps, preserving motion parallel to a blocking wall.
export function slideWalking(previous,next,clear){
 const count=Math.max(1,Math.ceil(Math.hypot(next.x-previous.x,next.z-previous.z)/.15));
 const dx=(next.x-previous.x)/count,dz=(next.z-previous.z)/count;
 let point={...previous,y:next.y};
 for(let i=0;i<count;i++){
  const diagonal={...point,x:point.x+dx,z:point.z+dz};
  if(clear(point,diagonal)){point=diagonal;continue;}
  const x={...point,x:point.x+dx};if(dx&&clear(point,x))point=x;
  const z={...point,z:point.z+dz};if(dz&&clear(point,z))point=z;
 }
 return {...next,x:point.x,z:point.z};
}
