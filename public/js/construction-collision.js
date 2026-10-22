import {constructionCollisionBoxes,constructionMatrix,constructionMultiply,constructionTransform} from './construction-kinematics.js';
import {isConstructionMachine,craneHookPosition,CONSTRUCTION_LOAD_OFFSET} from './construction-state.js';

const coordinates=['x','y','z'],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const prepared=new WeakMap();
export function constructionBox(part,center,size,objectId=null,rotation={}){
 return {part,objectId,center:{...center},size:{...size},matrix:constructionMatrix(coordinates.map(axis=>center[axis]||0),coordinates.map(axis=>rotation[axis]||0))};
}
export function constructionBoxFromBounds(box,objectId=box.objectId,part='site-solid'){
 return constructionBox(part,Object.fromEntries(coordinates.map(axis=>[axis,(box.min[axis]+box.max[axis])/2])),Object.fromEntries(coordinates.map(axis=>[axis,box.max[axis]-box.min[axis]])),objectId);
}
export function constructionColliders(actor){
 if(!actor||actor.active===false)return [];
 if(isConstructionMachine(actor)){
  const boxes=constructionCollisionBoxes(actor);
  if(actor.construction?.kind==='crane'&&actor.construction.load){
   const hook=craneHookPosition(actor),yaw=actor.construction.loadYaw||0;
   // End connection plates intentionally meet the frame posts; the central
   // 17.4m solid remains collision checked throughout every lift and rotation.
   boxes.push(constructionBox('crane-payload',{...hook,y:hook.y-CONSTRUCTION_LOAD_OFFSET+.3},{x:17.4,y:.56,z:.4},actor.id,{y:yaw}));
  }
  return boxes;
 }
 if(actor.constructionBeam){
  const size={x:actor.constructionBeam.state==='placed'?17.4:18,y:.6,z:.44},matrix=constructionMatrix(coordinates.map(axis=>actor.position?.[axis]||0),coordinates.map(axis=>actor.rotation?.[axis]||0),coordinates.map(axis=>actor.scale?.[axis]??1));
  const transformed=constructionMultiply(matrix,constructionMatrix([0,.3,0]));
  return [{part:'steel-beam',objectId:actor.id,size,matrix:transformed,center:constructionTransform(transformed,[0,0,0])}];
 }
 if(actor.constructionStructure){const size=actor.constructionStructure.size;return [constructionBox('tower-'+actor.constructionStructure.kind,{...actor.position,y:actor.position.y+size.y/2},size,actor.id,actor.rotation)];}
 return [];
}
function prepare(box){
 if(prepared.has(box))return prepared.get(box);
 const m=box.matrix||constructionMatrix(coordinates.map(axis=>box.center?.[axis]||0)),s=box.size,center=[m[12],m[13],m[14]],edges=coordinates.map((axis,index)=>[m[index*4]*s[axis]/2,m[index*4+1]*s[axis]/2,m[index*4+2]*s[axis]/2]);
 const radius=coordinates.map((axis,index)=>edges.reduce((sum,edge)=>sum+Math.abs(edge[index]),0)),bounds={min:{},max:{}};
 coordinates.forEach((axis,index)=>{bounds.min[axis]=center[index]-radius[index];bounds.max[axis]=center[index]+radius[index];});
 const result={center,edges,bounds,faces:[cross(edges[0],edges[1]),cross(edges[1],edges[2]),cross(edges[2],edges[0])]};prepared.set(box,result);return result;
}
export const constructionColliderBounds=box=>prepare(box).bounds;
const boundsOverlap=(a,b,padding=0)=>coordinates.every(axis=>a.min[axis]<b.max[axis]+padding&&a.max[axis]>b.min[axis]-padding);
/** Separating axis test for oriented (and non-uniformly scaled) solid boxes. */
export function constructionBoxContact(first,second,tolerance=.025){
 const a=prepare(first),b=prepare(second);if(!boundsOverlap(a.bounds,b.bounds))return null;
 const delta=b.center.map((value,index)=>value-a.center[index]);let penetration=Infinity;
 for(const axis of [...a.faces,...b.faces,...a.edges.flatMap(edge=>b.edges.map(other=>cross(edge,other)))]){
  const length=Math.hypot(...axis);if(length<1e-10)continue;
  const overlap=[...a.edges,...b.edges].reduce((sum,edge)=>sum+Math.abs(dot(axis,edge)),0)-Math.abs(dot(delta,axis));
  if(overlap<=tolerance*length)return null;penetration=Math.min(penetration,overlap/length);
 }
 return {penetration};
}
function interpolation(from,to,t){
 const actor={...to,position:{},rotation:{},construction:{...to.construction},driving:{...to.driving}};
 for(const axis of coordinates){actor.position[axis]=(from.position?.[axis]||0)+((to.position?.[axis]||0)-(from.position?.[axis]||0))*t;const a=from.rotation?.[axis]||0,b=to.rotation?.[axis]||0;actor.rotation[axis]=a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;}
 for(const key of ['slew','trolley','hoist','boom','stick','bucket','swing','blade','bed','loadYaw']){const a=Number(from.construction?.[key])||0,b=Number(to.construction?.[key])||0;actor.construction[key]=a+(b-a)*t;}
 actor.driving.steering=(from.driving?.steering||0)+((to.driving?.steering||0)-(from.driving?.steering||0))*t;return actor;
}
/** Sweeps every rigid mechanism, including long jib/payload arcs, in short steps.
 * Existing overlaps may be exited; motion may never deepen an overlap.
 */
export function constructionMotionBlocked(from,to,obstacles=[],{spacing=.08,ignoreIds=[],tolerance=.025}={}){
 const start=constructionColliders(from),finish=constructionColliders(to),ignored=new Set([from.id,to.id,from.construction?.load,...ignoreIds]);
 for(const id of [null,undefined])ignored.delete(id);
 const candidates=obstacles.filter(box=>!ignored.has(box.objectId));if(!start.length||!candidates.length)return null;
 let span=Math.hypot(...coordinates.map(axis=>(to.position?.[axis]||0)-(from.position?.[axis]||0)));
 for(let index=0;index<start.length;index++){
  const a=prepare(start[index]),b=finish[index]&&prepare(finish[index]);if(!b)continue;
  span=Math.max(span,Math.hypot(...a.center.map((value,i)=>value-b.center[i]))+a.edges.reduce((sum,edge,j)=>sum+Math.hypot(...edge.map((value,k)=>value-b.edges[j][k])),0));
 }
 const steps=Math.max(1,Math.ceil(span/spacing));
 // Broadphase the entire arc, rather than only its endpoints. A turning jib
 // can hit a wall that lies outside the straight endpoint bounding boxes.
 const perPart=start.map((part,index)=>{
  const end=finish[index];if(!end||part.matrix.every((value,i)=>Math.abs(value-end.matrix[i])<1e-9)&&coordinates.every(axis=>part.size[axis]===end.size[axis]))return [];
  const a=prepare(part).bounds,b=prepare(end).bounds,swept={min:{},max:{}};coordinates.forEach(axis=>{swept.min[axis]=Math.min(a.min[axis],b.min[axis])-span;swept.max[axis]=Math.max(a.max[axis],b.max[axis])+span;});
  return candidates.filter(obstacle=>boundsOverlap(swept,prepare(obstacle).bounds));
 });
 const baseline=start.map((part,index)=>new Map(perPart[index].map(obstacle=>[obstacle,constructionBoxContact(part,obstacle,tolerance)?.penetration||0])));
 for(let step=1;step<=steps;step++){
  const parts=step===steps?finish:constructionColliders(interpolation(from,to,step/steps));
  for(let index=0;index<parts.length;index++)for(const obstacle of perPart[index]){
   const contact=constructionBoxContact(parts[index],obstacle,tolerance);if(!contact)continue;
   if(contact.penetration<=(baseline[index]?.get(obstacle)||0)+.002)continue;
   return {part:parts[index].part,objectId:obstacle.objectId,obstaclePart:obstacle.part,reason:parts[index].part+' blocked by '+(obstacle.part||'site structure')};
  }
 }
 return null;
}
