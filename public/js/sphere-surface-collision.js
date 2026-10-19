import * as THREE from '../vendor/three/three.module.min.js';
import {isSolidSurface} from './collision-surfaces.js';

const EPSILON=1e-8,trees=new WeakMap();
const vector=point=>new THREE.Vector3(point.x,point.y,point.z);

function isBallSurface(object){
 if(!isSolidSurface(object))return false;
 for(let node=object;node;node=node.parent)if(node.userData?.ballCollisionDisabled)return false;
 return true;
}

// Cache local triangles and their spatial tree once per geometry revision.
// Ball substeps query only the nodes crossed by their swept sphere.
function triangleTree(geometry){
 const position=geometry.attributes.position,index=geometry.index;
 const key=[position.version,index?.version,geometry.drawRange.start,geometry.drawRange.count].join(':');
 const existing=trees.get(geometry);if(existing?.key===key&&existing.position===position&&existing.index===index)return existing.tree;
 const start=geometry.drawRange.start,end=Math.min(index?.count??position.count,start+geometry.drawRange.count),count=Math.max(0,Math.floor((end-start)/3));
 // Detailed house GLBs contain half a million triangles. Keep compact numeric
 // bounds/indices rather than retaining a Triangle and Box3 for every face.
 const bounds=new Float32Array(count*6),ids=new Uint32Array(count),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 for(let id=0;id<count;id++){
  const offset=start+id*3;ids[id]=id;
  a.fromBufferAttribute(position,index?index.getX(offset):offset);b.fromBufferAttribute(position,index?index.getX(offset+1):offset+1);c.fromBufferAttribute(position,index?index.getX(offset+2):offset+2);
  bounds.set([Math.min(a.x,b.x,c.x),Math.min(a.y,b.y,c.y),Math.min(a.z,b.z,c.z),Math.max(a.x,b.x,c.x),Math.max(a.y,b.y,c.y),Math.max(a.z,b.z,c.z)],id*6);
 }
 const center=(id,axis)=>bounds[id*6+axis]+bounds[id*6+axis+3];
 const partition=(begin,end,middle,axis)=>{
  let low=begin,high=end-1;
  while(low<high){
   const pivot=center(ids[(low+high)>>>1],axis);let left=low,right=high;
   while(left<=right){
    while(center(ids[left],axis)<pivot)left++;while(center(ids[right],axis)>pivot)right--;
    if(left<=right){const value=ids[left];ids[left++]=ids[right];ids[right--]=value;}
   }
   if(middle<=right)high=right;else if(middle>=left)low=left;else break;
  }
 };
 const build=(begin,end)=>{
  const box=new THREE.Box3();
  for(let i=begin;i<end;i++){
   const offset=ids[i]*6;box.min.x=Math.min(box.min.x,bounds[offset]);box.min.y=Math.min(box.min.y,bounds[offset+1]);box.min.z=Math.min(box.min.z,bounds[offset+2]);box.max.x=Math.max(box.max.x,bounds[offset+3]);box.max.y=Math.max(box.max.y,bounds[offset+4]);box.max.z=Math.max(box.max.z,bounds[offset+5]);
  }
  if(end-begin<=24)return {bounds:box,indices:ids.subarray(begin,end)};
  const size=box.getSize(new THREE.Vector3()),axis=size.x>=size.y&&size.x>=size.z?0:size.y>=size.z?1:2,middle=(begin+end)>>>1;
  partition(begin,end,middle,axis);return {bounds:box,left:build(begin,middle),right:build(middle,end)};
 };
 geometry.computeBoundingBox();
 const tree=build(0,count);trees.set(geometry,{key,position,index,tree});return tree;
}

function triangleContact(start,motion,radius,triangle){
 let best=null;
 const consider=(time,normal)=>{
  if(time< -EPSILON||time>1+EPSILON||motion.dot(normal)>=-EPSILON)return;
  if(!best||time<best.time)best={time:Math.max(0,time),normal:normal.clone()};
 };
 const normal=triangle.getNormal(new THREE.Vector3()),distance=normal.dot(start.clone().sub(triangle.a)),rate=normal.dot(motion);
 if(normal.lengthSq()>EPSILON){
  for(const side of [-1,1]){
   if(Math.abs(rate)<EPSILON)continue;
   const outward=normal.clone().multiplyScalar(side),time=(side*radius-distance)/rate;
   const point=start.clone().addScaledVector(motion,time).addScaledVector(outward,-radius);
   if(triangle.containsPoint(point))consider(time,outward);
  }
  if(Math.abs(distance)<radius){
   const side=Math.abs(distance)>EPSILON?Math.sign(distance):-Math.sign(rate),outward=normal.clone().multiplyScalar(side);
   const projected=start.clone().addScaledVector(normal,-distance);
   if(triangle.containsPoint(projected))consider(0,outward);
  }
 }
 // Continuous edge/vertex tests stop a sphere grazing a thin wall's edge.
 for(const [a,b] of [[triangle.a,triangle.b],[triangle.b,triangle.c],[triangle.c,triangle.a]]){
  const edge=b.clone().sub(a),length=edge.length();if(length<EPSILON)continue;edge.divideScalar(length);
  const offset=start.clone().sub(a),along=offset.dot(edge),speed=motion.dot(edge);
  const relative=offset.clone().addScaledVector(edge,-along),travel=motion.clone().addScaledVector(edge,-speed);
  const A=travel.lengthSq(),B=relative.dot(travel),C=relative.lengthSq()-radius*radius;
  if(along>=0&&along<=length&&C<0&&relative.lengthSq()>EPSILON)consider(0,relative.clone().normalize());
  const determinant=B*B-A*C;
  if(A>EPSILON&&determinant>=0){
   const time=(-B-Math.sqrt(determinant))/A,projection=along+speed*time;
   if(projection>=0&&projection<=length)consider(time,relative.clone().addScaledVector(travel,time).normalize());
  }
  for(const endpoint of [a,b]){
   const radial=start.clone().sub(endpoint),A=motion.lengthSq(),B=radial.dot(motion),C=radial.lengthSq()-radius*radius;
   if(C<0&&radial.lengthSq()>EPSILON)consider(0,radial.clone().normalize());
   const determinant=B*B-A*C;
   if(A>EPSILON&&determinant>=0){const time=(-B-Math.sqrt(determinant))/A;consider(time,radial.addScaledVector(motion,time).normalize());}
  }
 }
 return best;
}

/** Prepare static indices while the map loading screen owns the main thread. */
export function prepareSphereSurfaces(roots){
 const seen=new Set(),geometries=new Set();
 const visit=object=>{
  if(!object||seen.has(object))return;seen.add(object);
  if(isBallSurface(object)&&!geometries.has(object.geometry)){triangleTree(object.geometry);geometries.add(object.geometry);}
  for(const child of object.children||[])visit(child);
 };
 for(const root of Array.isArray(roots)?roots:[roots])visit(root);
}

/** First contact of a moving sphere with actual solid mesh triangles, both sides. */
export function sweepSphereSurfaces(previous,next,radius,roots){
 const start=vector(previous),motion=vector(next).sub(start);if(motion.lengthSq()<EPSILON*EPSILON)return null;
 const finish=vector(next),seen=new Set(),worldTriangle=new THREE.Triangle();let nearest=null;
 const inspect=(mesh,matrix)=>{
  const inverse=new THREE.Matrix4().copy(matrix).invert(),localStart=start.clone().applyMatrix4(inverse),localEnd=finish.clone().applyMatrix4(inverse);
  // A world sphere becomes an ellipsoid in a scaled mesh's local frame.
  // Row lengths give conservative axis bounds, including parent shear.
  const e=inverse.elements,extent=new THREE.Vector3(Math.hypot(e[0],e[4],e[8]),Math.hypot(e[1],e[5],e[9]),Math.hypot(e[2],e[6],e[10])).multiplyScalar(radius+.002);
  const bounds=new THREE.Box3().setFromPoints([localStart,localEnd]);bounds.min.sub(extent);bounds.max.add(extent);
  const geometry=mesh.geometry,cached=trees.get(geometry),position=geometry.attributes.position;
  if(!geometry.boundingBox||cached&&(cached.position!==position||cached.index!==geometry.index||cached.key!==[position.version,geometry.index?.version,geometry.drawRange.start,geometry.drawRange.count].join(':')))geometry.computeBoundingBox();
  if(!bounds.intersectsBox(geometry.boundingBox))return;
  const visit=node=>{
   if(!bounds.intersectsBox(node.bounds))return;
   if(node.left){visit(node.left);visit(node.right);return;}
   for(const id of node.indices){
    const offset=geometry.drawRange.start+id*3,index=geometry.index;
    worldTriangle.a.fromBufferAttribute(position,index?index.getX(offset):offset).applyMatrix4(matrix);worldTriangle.b.fromBufferAttribute(position,index?index.getX(offset+1):offset+1).applyMatrix4(matrix);worldTriangle.c.fromBufferAttribute(position,index?index.getX(offset+2):offset+2).applyMatrix4(matrix);
    const hit=triangleContact(start,motion,radius,worldTriangle);
    if(hit&&(!nearest||hit.time<nearest.time))nearest={...hit,object:mesh};
   }
  };visit(triangleTree(mesh.geometry));
 };
 const visit=object=>{
  if(!object||seen.has(object))return;seen.add(object);
  if(isBallSurface(object)){
   object.updateWorldMatrix(true,false);
   if(object.isInstancedMesh){
    const instance=new THREE.Matrix4(),matrix=new THREE.Matrix4();
    for(let i=0;i<object.count;i++){object.getMatrixAt(i,instance);matrix.multiplyMatrices(object.matrixWorld,instance);inspect(object,matrix);}
   }else inspect(object,object.matrixWorld);
  }
  for(const child of object.children||[])visit(child);
 };
 for(const root of Array.isArray(roots)?roots:[roots])visit(root);
 return nearest;
}

/** Clip a held object's requested center without pushing its holder or bouncing. */
export function clampSphereSurfaces(previous,next,radius,roots,skin=.002){
 const hit=sweepSphereSurfaces(previous,next,radius,roots);if(!hit)return {...next};
 const delta=vector(next).sub(vector(previous)),point=vector(previous).addScaledVector(delta,hit.time).addScaledVector(hit.normal,skin);
 return {x:point.x,y:point.y,z:point.z};
}

/** Mutates a ball's proposed bottom position/velocity before goals or catches. */
export function bounceBallSurfaces(ball,previous,next,roots,{radius=.12,restitution=.72,skin=.002}={}){
 if(!ball.ballVelocity)return null;
 let start={x:previous.x,y:previous.y+radius,z:previous.z},finish={x:next.x,y:next.y+radius,z:next.z},first=null;
 for(let contacts=0;contacts<3;contacts++){
  const hit=sweepSphereSurfaces(start,finish,radius,roots);if(!hit)break;first||=hit;
  const delta=vector(finish).sub(vector(start)),contact=vector(start).addScaledVector(delta,hit.time).addScaledVector(hit.normal,skin);
  const velocity=vector(ball.ballVelocity),into=velocity.dot(hit.normal);
  if(into<0)velocity.addScaledVector(hit.normal,-(1+restitution)*into);
  if(hit.normal.y>.55){velocity.x*=.82;velocity.z*=.82;}
  Object.assign(ball.ballVelocity,{x:velocity.x,y:velocity.y,z:velocity.z});
  const remainder=delta.multiplyScalar(1-hit.time),normalMotion=remainder.dot(hit.normal);
  if(normalMotion<0)remainder.addScaledVector(hit.normal,-(1+restitution)*normalMotion);
  start={x:contact.x,y:contact.y,z:contact.z};finish=contact.add(remainder);
  if(hit.normal.y>.55&&Math.abs(velocity.y)<.3){finish.y=start.y;delete ball.ballVelocity;break;}
 }
 next.x=finish.x;next.y=finish.y-radius;next.z=finish.z;
 return first;
}
