import * as THREE from './public/vendor/three/three.module.min.js';
import {PLAYER_BODY_RADIUS,PLAYER_BODY_HEIGHT,PLAYER_STEP_HEIGHT} from './public/js/player-collision.js';
export const PLAYER_RADIUS=PLAYER_BODY_RADIUS,PLAYER_HEIGHT=PLAYER_BODY_HEIGHT,PLAYER_STEP=PLAYER_STEP_HEIGHT;
const EPS=1e-5;
/** Static world-space triangles, indexed once for capsule contacts and small steps. */
export function playerCollisionTree(meshes){
 const triangles=[];
 for(const mesh of meshes){
  const position=mesh.geometry?.attributes.position,index=mesh.geometry?.index;if(!position)continue;
  let owner=mesh;while(owner&&!owner.userData.builderObjectId)owner=owner.parent;
  const count=Math.floor((index?.count||position.count)/3);
  for(let face=0;face<count;face++){
   const vertices=[0,1,2].map(corner=>new THREE.Vector3().fromBufferAttribute(position,index?index.getX(face*3+corner):face*3+corner).applyMatrix4(mesh.matrixWorld));
   const triangle=new THREE.Triangle(...vertices),normal=triangle.getNormal(new THREE.Vector3());
   if(Math.abs(normal.y)>=.55||normal.lengthSq()<.5)continue;
   triangles.push({triangle,normal,box:new THREE.Box3().setFromPoints(vertices),mesh,objectId:owner?.userData.builderObjectId});
  }
 }
 function build(items){
  const box=new THREE.Box3();for(const item of items)box.union(item.box);
  if(items.length<=20)return {box,items};
  const size=box.getSize(new THREE.Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';
  items.sort((a,b)=>a.box.min[axis]+a.box.max[axis]-b.box.min[axis]-b.box.max[axis]);const middle=items.length>>1;
  return {box,left:build(items.slice(0,middle)),right:build(items.slice(middle))};
 }
 const tree=build(triangles);tree.triangleCount=triangles.length;return tree;
}
function query(tree,box,results){if(!tree||!tree.box.intersectsBox(box))return;if(tree.items){for(const item of tree.items)if(item.box.intersectsBox(box))results.push(item);}else{query(tree.left,box,results);query(tree.right,box,results);}}

// Segment/triangle closest points cover the complete upright capsule, including
// table edges and posts that a single ray at chest height cannot detect.
const a=new THREE.Vector3(),b=new THREE.Vector3(),p=new THREE.Vector3(),q=new THREE.Vector3(),bestP=new THREE.Vector3(),bestQ=new THREE.Vector3(),direction=new THREE.Vector3(),crossing=new THREE.Vector3(),plane=new THREE.Plane();
const d1=new THREE.Vector3(),d2=new THREE.Vector3(),r=new THREE.Vector3();
const clamp=value=>Math.max(0,Math.min(1,value));
function segmentPair(p1,q1,p2,q2,out1,out2){
 d1.subVectors(q1,p1);d2.subVectors(q2,p2);r.subVectors(p1,p2);
 const aa=d1.lengthSq(),ee=d2.lengthSq(),ff=d2.dot(r);let s=0,t=0;
 if(aa<=EPS&&ee<=EPS){out1.copy(p1);out2.copy(p2);return;}
 if(aa<=EPS)t=clamp(ff/ee);else{
  const cc=d1.dot(r);if(ee<=EPS)s=clamp(-cc/aa);else{
   const bb=d1.dot(d2),denom=aa*ee-bb*bb;s=denom?clamp((bb*ff-cc*ee)/denom):0;t=(bb*s+ff)/ee;
   if(t<0){t=0;s=clamp(-cc/aa);}else if(t>1){t=1;s=clamp((bb-cc)/aa);}
  }
 }
 out1.copy(p1).addScaledVector(d1,s);out2.copy(p2).addScaledVector(d2,t);
}
function capsuleContact(position,item,previous){
 a.set(position.x,position.y+PLAYER_RADIUS,position.z);b.set(position.x,position.y+PLAYER_HEIGHT-PLAYER_RADIUS,position.z);
 const triangle=item.triangle;let best=Infinity;
 const record=()=>{const value=p.distanceToSquared(q);if(value<best){best=value;bestP.copy(p);bestQ.copy(q);}};
 p.copy(a);triangle.closestPointToPoint(a,q);record();p.copy(b);triangle.closestPointToPoint(b,q);record();
 for(const [start,end]of [[triangle.a,triangle.b],[triangle.b,triangle.c],[triangle.c,triangle.a]]){segmentPair(a,b,start,end,p,q);record();}
 plane.setFromNormalAndCoplanarPoint(item.normal,triangle.a);direction.subVectors(b,a);const denominator=item.normal.dot(direction);
 if(Math.abs(denominator)>EPS){const t=-plane.distanceToPoint(a)/denominator;if(t>=0&&t<=1){crossing.copy(a).addScaledVector(direction,t);if(triangle.containsPoint(crossing)){best=0;bestP.copy(crossing);bestQ.copy(crossing);}}}
 if(best>=PLAYER_RADIUS*PLAYER_RADIUS-EPS)return null;
 const dx=bestP.x-bestQ.x,dz=bestP.z-bestQ.z,dy=bestP.y-bestQ.y,horizontal=Math.hypot(dx,dz);
 if(Math.abs(dy)>=PLAYER_RADIUS)return null;
 if(horizontal>EPS){const depth=Math.sqrt(Math.max(0,PLAYER_RADIUS*PLAYER_RADIUS-dy*dy))-horizontal;return depth>EPS?{x:dx/horizontal,z:dz/horizontal,depth}:null;}
 const span=Math.hypot(item.normal.x,item.normal.z);if(span<EPS)return null;
 const side=plane.distanceToPoint(new THREE.Vector3(previous.x,previous.y+PLAYER_HEIGHT/2,previous.z))>=0?1:-1;
 return {x:item.normal.x/span*side,z:item.normal.z/span*side,depth:PLAYER_RADIUS};
}

/** Validate an entry without repeatedly pushing a capsule through nearby faces. */
export function playerCapsuleOverlaps(tree,position,actors={}){
 const box=new THREE.Box3(new THREE.Vector3(position.x-PLAYER_RADIUS,position.y,position.z-PLAYER_RADIUS),new THREE.Vector3(position.x+PLAYER_RADIUS,position.y+PLAYER_HEIGHT,position.z+PLAYER_RADIUS)),nearby=[];query(tree,box,nearby);
 return nearby.some(item=>{const actor=item.objectId&&actors[item.objectId];return !(actor&&(actor.open||actor.active===false||actor.holderId))&&item.box.max.y>position.y+PLAYER_STEP&&Boolean(capsuleContact(position,item,position));});
}

/** Resolve short swept steps and preserve tangential travel across wall seams. */
export function slidePlayerCapsule(tree,previous,next,{actors={},canStep=()=>true}={}){
 const position={...previous},normals=[],steps=Math.max(1,Math.ceil(Math.max(Math.hypot(next.x-previous.x,next.z-previous.z),Math.abs(next.y-previous.y))/.1));
 const dx=(next.x-previous.x)/steps,dz=(next.z-previous.z)/steps,dy=(next.y-previous.y)/steps,box=new THREE.Box3(),nearby=[];
 for(let step=0;step<steps;step++){
  const before={...position};position.x+=dx;position.z+=dz;position.y+=dy;
  for(let iteration=0;iteration<5;iteration++){
   box.min.set(position.x-PLAYER_RADIUS,position.y,position.z-PLAYER_RADIUS);box.max.set(position.x+PLAYER_RADIUS,position.y+PLAYER_HEIGHT,position.z+PLAYER_RADIUS);nearby.length=0;query(tree,box,nearby);let changed=false;
   for(const item of nearby){
    const actor=item.objectId&&actors[item.objectId];if(actor&&(actor.open||actor.active===false||actor.holderId))continue;
    if(item.box.max.y<=previous.y+PLAYER_STEP+EPS&&canStep(position,item.box.max.y))continue;
    const contact=capsuleContact(position,item,before);if(!contact)continue;
    // Do not pull a player back into a shallow existing overlap while leaving.
    const old=capsuleContact(before,item,before),separating=(position.x-before.x)*contact.x+(position.z-before.z)*contact.z>EPS;
    if(old&&separating&&contact.depth<old.depth+EPS)continue;
    position.x+=contact.x*(contact.depth+EPS);position.z+=contact.z*(contact.depth+EPS);changed=true;
    if(!normals.some(normal=>normal.x*contact.x+normal.z*contact.z>.99))normals.push({x:contact.x,z:contact.z});
   }
   if(!changed)break;
  }
 }
 return {...position,collisionNormals:normals};
}
