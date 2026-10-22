import * as THREE from './public/vendor/three/three.module.min.js';
// Static collision geometry gets a triangle tree once, rather than scanning the
// entire house for each player's floor, clearance and wall rays every tick.
export function accelerateStaticRaycast(mesh,{respectMaterialSide=false}={}) {
 const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;
 const count=Math.floor((index?.count||position.count)/3);
 if(count<128)return;
 const vertex=(triangle,corner,out)=>out.fromBufferAttribute(position,index?index.getX(triangle*3+corner):triangle*3+corner);
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 const triangles=Array.from({length:count},(_,id)=>{
  vertex(id,0,a);vertex(id,1,b);vertex(id,2,c);
  return {id,box:new THREE.Box3().setFromPoints([a,b,c])};
 });
 function build(items){
  const box=new THREE.Box3();for(const item of items)box.union(item.box);
  if(items.length<=24)return {box,items:items.map(item=>item.id)};
  const size=box.getSize(new THREE.Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';
  items.sort((a,b)=>a.box.min[axis]+a.box.max[axis]-b.box.min[axis]-b.box.max[axis]);
  const middle=items.length>>1;return {box,left:build(items.slice(0,middle)),right:build(items.slice(middle))};
 }
 const tree=build(triangles),inverse=new THREE.Matrix4(),localRay=new THREE.Ray(),point=new THREE.Vector3(),worldPoint=new THREE.Vector3(),edge=new THREE.Vector3(),normal=new THREE.Vector3();
 mesh.raycast=function(raycaster,hits){
  inverse.copy(this.matrixWorld).invert();localRay.copy(raycaster.ray).applyMatrix4(inverse);
  const visit=node=>{
   if(!localRay.intersectsBox(node.box))return;
   if(node.left){visit(node.left);visit(node.right);return;}
   for(const id of node.items){
    vertex(id,0,a);vertex(id,1,b);vertex(id,2,c);
    const side=respectMaterialSide?this.material.side:THREE.DoubleSide;
    if(!(side===THREE.BackSide?localRay.intersectTriangle(c,b,a,true,point):localRay.intersectTriangle(a,b,c,side!==THREE.DoubleSide,point)))continue;
    worldPoint.copy(point).applyMatrix4(this.matrixWorld);
    const distance=worldPoint.distanceTo(raycaster.ray.origin);
    if(distance<raycaster.near||distance>raycaster.far)continue;
    normal.subVectors(c,b).cross(edge.subVectors(a,b)).normalize();
    hits.push({distance,point:worldPoint.clone(),object:this,faceIndex:id,face:{normal:normal.clone(),materialIndex:0}});
   }
  };visit(tree);
 };
}
