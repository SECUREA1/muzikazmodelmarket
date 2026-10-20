// Shared player dimensions and swept movement for confirmed placed solids.
export function resolvePlacedSolids(previous,next,boxes,{radius=.3,height=1.7,step=.45}={}){
 if(!boxes.length)return {...next,grounded:false};
 let result={...next},grounded=false;const falling=next.y<=previous.y+.001;
 const overlap=(box,x,z,padding=radius)=>x>box.min.x-padding&&x<box.max.x+padding&&z>box.min.z-padding&&z<box.max.z+padding;
 const support=(x,z)=>boxes.filter(box=>overlap(box,x,z,radius+.015)&&box.max.y<=previous.y+(falling?step:.02)&&box.max.y>=next.y-.04).sort((a,b)=>b.max.y-a.max.y).find(box=>!boxes.some(ceiling=>overlap(ceiling,x,z)&&ceiling.min.y>box.max.y+.03&&ceiling.min.y<box.max.y+height&&ceiling.max.y>box.max.y+.03));
 const blocked=(x,z,y)=>boxes.some(box=>overlap(box,x,z)&&y<box.max.y-.025&&y+height>box.min.y+.025);
 const count=Math.max(1,Math.ceil(Math.hypot(next.x-previous.x,next.z-previous.z)/.15));let x=previous.x,z=previous.z;
 for(let index=1;index<=count;index++){
  const targetX=x+(next.x-previous.x)/count,targetZ=z+(next.z-previous.z)/count;
  const floor=support(targetX,targetZ),y=floor&&falling?Math.max(next.y,floor.max.y):next.y;
  if(!blocked(targetX,z,y))x=targetX;if(!blocked(x,targetZ,y))z=targetZ;
 }
 result.x=Math.abs(x-next.x)<1e-10?next.x:x;result.z=Math.abs(z-next.z)<1e-10?next.z:z;const floor=support(x,z);
 if(floor&&falling&&result.y<=floor.max.y+.04){result.y=floor.max.y;grounded=true;result.floorY=floor.max.y;}
 if(!falling)for(const box of boxes)if(overlap(box,x,z)&&previous.y+height<=box.min.y+.03&&result.y+height>box.min.y){result.y=Math.min(result.y,box.min.y-height);result.hitCeiling=true;}
 return {...result,grounded};
}
export function drawingCollisionMask(source){
 const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const context=canvas.getContext('2d');context.drawImage(source,0,0,16,16);const pixels=context.getImageData(0,0,16,16).data;
 return Array.from({length:256},(_,index)=>pixels[index*4+3]<96?0:Math.max(1,Math.round((pixels[index*4]+pixels[index*4+1]+pixels[index*4+2])/3)));
}
export function drawingCollisionModel(THREE,settings={}){
 const root=new THREE.Group(),mask=settings.collisionMask,depth=Math.max(.01,Math.min(.5,(Number(settings.depth)||28)/200));
 const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshBasicMaterial();
 for(let index=0;index<(mask?.length===256?256:1);index++){
  if(mask?.length===256&&!mask[index])continue;
  const relief=settings.depthMode==='relief'&&mask?.length===256?.25+.75*mask[index]/255:1,d=depth*relief;
  const mesh=new THREE.Mesh(geometry,material),cell=mask?.length===256;
  mesh.scale.set(cell?1.5/16:1.5,cell?1.5/16:1.5,d);mesh.position.set(cell?(index%16+.5)/16*1.5-.75:0,cell?1.5-(Math.floor(index/16)+.5)/16*1.5:.75,d/2);root.add(mesh);
 }
 root.rotation.set((Number(settings.tilt)||0)*Math.PI/180,(Number(settings.yaw)||0)*Math.PI/180,(Number(settings.orientation)||0)*Math.PI/180);if(settings.mirrored)root.scale.x=-1;return root;
}

// Share exactly the same physical meshes for anchoring, placement and walking.
// Explicit authored colliders replace decorative geometry; avatar selection
// boxes and child helpers never become a support surface.
export function placementMeshes(root){
 const meshes=[],dedicated=[];
 if(!root||root.userData.solid===false)return meshes;
 root.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.avatarCollider||mesh.userData.brickPaintPart==='stud')return;
  let collider=false;
  for(let node=mesh;node;node=node.parent){
   if(node.userData.collisionDisabled||node.userData.solid===false||node.userData.collider===false||node.userData.collision===false)return;
   collider ||=node.userData.collider===true||node.userData.collision===true||/(^|[_ .-])(COLLIDER|COLLISION|NAVMESH)([_ .-]|$)/i.test(node.name||'');
   if(node===root)break;
  }
  for(let node=mesh;node;node=node.parent){if(node.visible===false&&!collider)return;if(node===root)break;}
  meshes.push(mesh);if(collider)dedicated.push(mesh);
 });
 return dedicated.length?dedicated:meshes;
}
export function placementMeshMatrices(THREE,mesh){
 if(!mesh.isInstancedMesh)return [mesh.matrixWorld];
 const matrices=[];
 for(let i=0;i<mesh.count;i++){const local=new THREE.Matrix4();mesh.getMatrixAt(i,local);matrices.push(new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld,local));}
 return matrices;
}
export function placementBounds(THREE,root){
 root.updateWorldMatrix(true,true);const bounds=new THREE.Box3();
 for(const mesh of placementMeshes(root)){
  // setFromObject includes descendants, including nonphysical helper boxes.
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  if(mesh.geometry.boundingBox)for(const matrix of placementMeshMatrices(THREE,mesh))bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
 }
 return bounds;
}
export function placementBoxes(THREE,roots,accept=()=>true){
 const boxes=[];
 for(const root of roots){
  if(!root||root.visible===false||!accept(root))continue;root.updateWorldMatrix(true,true);
  for(const mesh of placementMeshes(root)){
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
   if(mesh.geometry.boundingBox)for(const matrix of placementMeshMatrices(THREE,mesh))boxes.push(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
  }
 }
 return boxes;
}
const placementTriangleCache=new WeakMap();
export function placementTriangles(THREE,roots){
 const triangles=[];
 for(const root of roots){
  root.updateWorldMatrix(true,true);
  for(const mesh of placementMeshes(root)){
   const geometry=mesh.geometry,positions=geometry.attributes.position,index=geometry.index;
   if(!positions)continue;
   const end=Math.min(index?index.count:positions.count,geometry.drawRange.start+geometry.drawRange.count);
   const matrix=mesh.matrixWorld.elements,cached=placementTriangleCache.get(mesh);
   if(cached&&cached.geometry===geometry&&cached.positions===positions.version&&cached.index===index?.version&&cached.start===geometry.drawRange.start&&cached.end===end&&cached.instances===mesh.instanceMatrix?.version&&cached.count===mesh.count&&matrix.every((value,i)=>value===cached.matrix[i])){for(const triangle of cached.triangles)triangles.push(triangle);continue;}
   const meshTriangles=[];
   if(!geometry.boundingBox)geometry.computeBoundingBox();
   for(const transform of placementMeshMatrices(THREE,mesh)){
    const point=i=>new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(i):i).applyMatrix4(transform);
    const solidBounds=geometry.boundingBox.clone().applyMatrix4(transform);
    for(let i=geometry.drawRange.start;i+2<end;i+=3){const triangle=new THREE.Triangle(point(i),point(i+1),point(i+2));if(transform.determinant()<0){const b=triangle.b;triangle.b=triangle.c;triangle.c=b;}triangle.solidBounds=solidBounds;meshTriangles.push(triangle);}
   }
   placementTriangleCache.set(mesh,{geometry,positions:positions.version,index:index?.version,start:geometry.drawRange.start,end,matrix:[...matrix],instances:mesh.instanceMatrix?.version,count:mesh.count,triangles:meshTriangles});
   for(const triangle of meshTriangles)triangles.push(triangle);
  }
 }
 return triangles;
}

export function placementHitNormal(THREE,hit){
 if(!hit.face)return null;
 let matrix=hit.object.matrixWorld;
 if(hit.object.isInstancedMesh&&hit.instanceId!==undefined){const instance=new THREE.Matrix4();hit.object.getMatrixAt(hit.instanceId,instance);matrix=new THREE.Matrix4().multiplyMatrices(matrix,instance);}
 return hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix));
}
export function placementFloorPoint(THREE,point,meshes,maxDrop=18){
 // Search below the aim height, never down from the map's highest roof.
 const ray=new THREE.Raycaster(point.clone(),new THREE.Vector3(0,-1,0),0,maxDrop);
 const hit=ray.intersectObjects(meshes,false).find(hit=>!hit.object.userData.avatarCollider&&!hit.object.userData.collisionDisabled&&hit.object.userData.brickPaintPart!=='stud'&&placementHitNormal(THREE,hit)?.y>.45);
 return hit?hit.point.clone():null;
}
