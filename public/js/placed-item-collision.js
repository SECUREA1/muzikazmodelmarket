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

export function placementBoxes(THREE,roots,accept=()=>true){
 const boxes=[];for(const root of roots){if(!root||root.userData.solid===false||root.visible===false||!accept(root))continue;root.updateWorldMatrix(true,true);root.traverse(mesh=>{if(!mesh.isMesh||mesh.isInstancedMesh||mesh.userData.collisionDisabled||mesh.userData.brickPaintPart==='stud'||mesh.userData.avatarCollider)return;if(mesh.visible===false&&!mesh.userData.collider)return;boxes.push(new THREE.Box3().setFromObject(mesh));});}return boxes;
}
