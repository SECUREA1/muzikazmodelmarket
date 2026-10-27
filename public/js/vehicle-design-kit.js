// Cosmetic vehicle details use the original factory's coordinate system and rig
// parents. The original precise envelope remains the placement/collision limit.
export function createVehicleDesignKit(T,root,id){
 root.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(root,true),source=[];
 root.traverse(node=>{if(!node.userData.vehicleDesignDetail)source.push(node);});
 const palette=new Map(),retained=new Set(source.filter(n=>n.isMesh).map(n=>n.geometry));
 let meshes=0,details=0,rejected=0;
 const kit={source,bounds,id,detailMeshBudget:96};
 kit.material=(name,options={})=>{
  if(!palette.has(name))palette.set(name,new T.MeshStandardMaterial({name,...options}));
  return palette.get(name);
 };
 kit.add=(parent,node,name)=>{
  const discard=()=>{node.removeFromParent();if(node.geometry&&!retained.has(node.geometry))node.geometry.dispose();rejected++;return false;};
  if(!parent||meshes>=kit.detailMeshBudget)return discard();
  node.name=name;node.userData={...node.userData,vehicleDesignDetail:true,nativeDesignDetail:true,collisionDisabled:true,collider:false,builderRoot:root};
  node.castShadow=false;node.receiveShadow=true;parent.add(node);root.updateMatrixWorld(true);
  const fitted=new T.Box3().setFromObject(node,true),epsilon=1e-5;
  if(fitted.isEmpty()||!['x','y','z'].every(axis=>Number.isFinite(fitted.min[axis])&&Number.isFinite(fitted.max[axis])&&fitted.min[axis]>=bounds.min[axis]-epsilon&&fitted.max[axis]<=bounds.max[axis]+epsilon))return discard();
  retained.add(node.geometry);meshes++;details+=node.isInstancedMesh?node.count:1;return true;
 };
 kit.box=(parent,size,position,material,name,rotation=[0,0,0])=>{
  const node=new T.Mesh(new T.BoxGeometry(...size),material);node.position.set(...position);node.rotation.set(...rotation);kit.add(parent,node,name);return node.parent?node:null;
 };
 kit.tube=(parent,from,to,radius,material,name,segments=10)=>{
  const a=new T.Vector3(...from),b=new T.Vector3(...to),direction=b.clone().sub(a);
  if(direction.lengthSq()<1e-12)return null;
  const node=new T.Mesh(new T.CylinderGeometry(radius,radius,direction.length(),segments),material);
  node.position.copy(a.add(b).multiplyScalar(.5));node.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());
  kit.add(parent,node,name);return node.parent?node:null;
 };
 kit.torus=(parent,radius,tube,position,material,name,rotation=[0,0,0])=>{
  const node=new T.Mesh(new T.TorusGeometry(radius,tube,6,32),material);node.position.set(...position);node.rotation.set(...rotation);kit.add(parent,node,name);return node.parent?node:null;
 };
 kit.cylinder=(parent,radiusTop,radiusBottom,height,position,material,name,rotation=[0,0,0])=>{
  const node=new T.Mesh(new T.CylinderGeometry(radiusTop,radiusBottom,height,24),material);node.position.set(...position);node.rotation.set(...rotation);kit.add(parent,node,name);return node.parent?node:null;
 };
 kit.batchBoxes=(parent,boxes,material,name)=>{
  if(!boxes.length)return null;
  const node=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material,boxes.length),matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Euler(),quaternion=new T.Quaternion();
  boxes.forEach((box,index)=>{position.set(...box.position);scale.set(...box.size);rotation.set(...(box.rotation||[0,0,0]));quaternion.setFromEuler(rotation);matrix.compose(position,quaternion,scale);node.setMatrixAt(index,matrix);});
  node.instanceMatrix.needsUpdate=true;node.computeBoundingBox();node.computeBoundingSphere();kit.add(parent,node,name);return node.parent?node:null;
 };
 kit.stats=()=>({details,detailMeshes:meshes,rejectedDetails:rejected});
 kit.disposeUnusedMaterials=()=>{const used=new Set();root.traverse(n=>{if(n.isMesh)for(const m of [].concat(n.material||[]))used.add(m);});for(const m of palette.values())if(!used.has(m))m.dispose();};
 return kit;
}

// Curved native hulls and wings originally had positions/normals only. Supply
// finite surface coordinates without changing any vertex, index or rig anchor.
export function addVehicleSurfaceUvs(T,root){
 const geometries=new Set();let count=0;
 root.traverse(node=>{
  const geometry=node.geometry,position=geometry?.getAttribute('position');
  if(!node.isMesh||!position||geometry.getAttribute('uv')||node.userData.collisionOnly||node.userData.mediaScreen||geometries.has(geometry))return;
  geometries.add(geometry);geometry.computeBoundingBox();
  const box=geometry.boundingBox,span=box.getSize(new T.Vector3()),normal=geometry.getAttribute('normal'),uv=new Float32Array(position.count*2);
  for(let i=0;i<position.count;i++){
   const n=normal?[Math.abs(normal.getX(i)),Math.abs(normal.getY(i)),Math.abs(normal.getZ(i))]:[0,1,0];
   const axis=n.indexOf(Math.max(...n)),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1];
   for(let j=0;j<2;j++){const a=axes[j],value=position.getComponent(i,a);uv[i*2+j]=(value-box.min.getComponent(a))/Math.max(1e-6,span.getComponent(a));}
  }
  geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.userData={...geometry.userData,vehicleSurfaceUv:true};count++;
 });
 return count;
}
