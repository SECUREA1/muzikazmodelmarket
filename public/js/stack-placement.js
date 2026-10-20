// Raise an overlapping placement just enough to rest on confirmed solids.
// Touching edges are allowed so adjacent blocks can form a continuous wall.
export function stackPlacementOffset(bounds,boxes){
 let offset=0;
 for(let pass=0;pass<=boxes.length;pass++){
  let rise=offset;
  for(const box of boxes){
   if(bounds.max.x<=box.min.x+.001||bounds.min.x>=box.max.x-.001||bounds.max.z<=box.min.z+.001||bounds.min.z>=box.max.z-.001)continue;
   if(bounds.min.y+offset<box.max.y-.001&&bounds.max.y+offset>box.min.y+.001)rise=Math.max(rise,box.max.y-bounds.min.y);
  }
  if(rise===offset)break;offset=rise;
 }
 return offset;
}
