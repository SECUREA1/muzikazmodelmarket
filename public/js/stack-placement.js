import {placementBounds,placementTriangles} from './placed-item-collision.js';
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

// Clip a support triangle to the item's footprint. Its enclosing box can reach
// far above the actual floor on ramps, stairs and rotated props.
function footprintPolygon(triangle,bounds){
 let points=[triangle.a,triangle.b,triangle.c];
 for(const [axis,edge,sign]of [['x',bounds.min.x,1],['x',bounds.max.x,-1],['z',bounds.min.z,1],['z',bounds.max.z,-1]]){
  const clipped=[];
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length],insideA=(a[axis]-edge)*sign>=0,insideB=(b[axis]-edge)*sign>=0;
   if(insideA)clipped.push(a);
   if(insideA!==insideB){const t=(edge-a[axis])/(b[axis]-a[axis]);clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});}
  }
  points=clipped;if(!points.length)break;
 }
 return points;
}
export function meshStackPlacementOffset(bounds,triangles){
 if(bounds.isEmpty())return 0;
 const surfaces=[];
 for(const triangle of triangles){
  const {a,b,c}=triangle;
  const normalY=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);
  if(normalY<=1e-8)continue;
  const polygon=footprintPolygon(triangle,bounds);if(polygon.length<3)continue;
  let area=0;for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length];area+=p.x*q.z-q.x*p.z;}
  if(Math.abs(area)<1e-8)continue;
  surfaces.push({min:triangle.solidBounds?.min.y??Math.min(...polygon.map(p=>p.y)),max:Math.max(...polygon.map(p=>p.y))});
 }
 let offset=0;
 for(let pass=0;pass<=surfaces.length;pass++){
  let rise=offset;
  for(const surface of surfaces)if(bounds.min.y+offset<surface.max-.001&&bounds.max.y+offset>surface.min+.001)rise=Math.max(rise,surface.max-bounds.min.y);
  if(rise===offset)break;offset=rise;
 }
 return offset;
}

// One base-alignment operation for catalog, inventory and editor placements.
export function alignStackableObject(THREE,root,point,supports=[]){
 root.position.copy(point);root.updateWorldMatrix(true,true);
 let bounds=placementBounds(THREE,root);
 if(bounds.isEmpty())bounds=new THREE.Box3().setFromObject(root);
 if(bounds.isEmpty())return root.position;
 root.position.y+=point.y-bounds.min.y;root.updateWorldMatrix(true,true);
 bounds=placementBounds(THREE,root);
 if(!bounds.isEmpty()&&supports.length)root.position.y+=meshStackPlacementOffset(bounds,placementTriangles(THREE,supports.filter(support=>support!==root)));
 root.updateWorldMatrix(true,true);return root.position;
}
