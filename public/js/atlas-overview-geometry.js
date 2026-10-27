import * as THREE from '../vendor/three/three.module.min.js';

// A static, texture-free copy of the actual room. Geometry is merged by render
// side and transparency, rather than replacing buildings with invented shapes.
// All positions are baked into world space so the room's usual atlas transform
// can be applied to this group exactly as it is applied to the detailed scene.
export function createAtlasOverviewGeometry(root){
 const overview=new THREE.Group();overview.name='Atlas room overview';
 if(!root)return overview;
 root.updateWorldMatrix(true,true);
 const buckets=new Map(),instanceMatrix=new THREE.Matrix4(),instanceColor=new THREE.Color();
 const vertexIndex=(geometry,index)=>geometry.index?geometry.index.getX(index):index;
 function addSegment(mesh,material,start,end,matrix,tint){
  if(!material||material.visible===false)return;
  const geometry=mesh.geometry,position=geometry.attributes.position;
  start=Math.max(0,Math.floor(start));end=Math.min(geometry.index?.count??position.count,Math.floor(end));
  end=start+Math.floor((end-start)/3)*3;if(end<=start)return;
  const seen=new Uint8Array(position.count);let vertices=0,indices=0;
  for(let offset=start;offset<end;offset+=3){
   const triangle=[vertexIndex(geometry,offset),vertexIndex(geometry,offset+1),vertexIndex(geometry,offset+2)];
   if(triangle.some(index=>index<0||index>=position.count))continue;
   indices+=3;for(const index of triangle)if(!seen[index]){seen[index]=1;vertices++;}
  }
  if(!indices)return;
  const transparent=!!material.transparent,side=material.side??THREE.FrontSide,key=side+':'+transparent;
  if(!buckets.has(key))buckets.set(key,{side,transparent,vertices:0,indices:0,segments:[]});
  const bucket=buckets.get(key);bucket.vertices+=vertices;bucket.indices+=indices;
  bucket.segments.push({mesh,material,start,end,matrix:matrix.clone(),tint:tint.clone(),vertices});
 }
 root.traverseVisible(mesh=>{
  if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
  const geometry=mesh.geometry,limit=geometry.index?.count??geometry.attributes.position.count;
  const drawStart=geometry.drawRange.start||0,drawEnd=Math.min(limit,drawStart+geometry.drawRange.count);
  const count=mesh.isInstancedMesh?mesh.count:1;
  for(let instance=0;instance<count;instance++){
   const matrix=mesh.matrixWorld.clone(),tint=new THREE.Color(1,1,1);
   if(mesh.isInstancedMesh){mesh.getMatrixAt(instance,instanceMatrix);matrix.multiply(instanceMatrix);if(mesh.instanceColor){mesh.getColorAt(instance,instanceColor);tint.copy(instanceColor);}}
   if(Array.isArray(mesh.material)){
    for(const group of geometry.groups)addSegment(mesh,mesh.material[group.materialIndex],Math.max(drawStart,group.start),Math.min(drawEnd,group.start+group.count),matrix,tint);
   }else addSegment(mesh,mesh.material,drawStart,drawEnd,matrix,tint);
  }
 });
 const point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
 const ab=new THREE.Vector3(),ac=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 let triangleCount=0;
 for(const bucket of buckets.values()){
  const positions=new Float32Array(bucket.vertices*3),normals=new Float32Array(bucket.vertices*3),colors=new Float32Array(bucket.vertices*4);
  const indices=bucket.vertices>65535?new Uint32Array(bucket.indices):new Uint16Array(bucket.indices);
  let nextVertex=0,nextIndex=0;
  for(const segment of bucket.segments){
   const {mesh,material,start,end,matrix,tint}=segment,source=mesh.geometry,sourcePositions=source.attributes.position,sourceColors=material.vertexColors?source.attributes.color:null;
   const lookup=new Uint32Array(sourcePositions.count),color=material.color||material.uniforms?.diffuse?.value||material.uniforms?.color?.value;
   const baseColor=color?.isColor?color:new THREE.Color(0xb0c2c2),opacity=material.opacity??1;
   const deformed=mesh.isSkinnedMesh||mesh.morphTargetInfluences?.some(value=>value!==0),sourceNormals=deformed?null:source.attributes.normal;
   normalMatrix.getNormalMatrix(matrix);const mirrored=matrix.determinant()<0,segmentStart=nextVertex;
   function copyVertex(index){
    if(lookup[index])return lookup[index]-1;
    const target=nextVertex++;lookup[index]=target+1;
    // Mesh.getVertexPosition includes the current morph and skin deformation.
    mesh.getVertexPosition(index,point);point.applyMatrix4(matrix);point.toArray(positions,target*3);
    if(sourceNormals){normal.fromBufferAttribute(sourceNormals,index).applyNormalMatrix(normalMatrix);normal.toArray(normals,target*3);}
    colors[target*4]=baseColor.r*tint.r*(sourceColors?sourceColors.getX(index):1);
    colors[target*4+1]=baseColor.g*tint.g*(sourceColors?sourceColors.getY(index):1);
    colors[target*4+2]=baseColor.b*tint.b*(sourceColors?sourceColors.getZ(index):1);
    colors[target*4+3]=opacity*(sourceColors?.itemSize===4?sourceColors.getW(index):1);
    return target;
   }
   for(let offset=start;offset<end;offset+=3){
    const triangle=[vertexIndex(source,offset),vertexIndex(source,offset+1),vertexIndex(source,offset+2)];
    if(triangle.some(index=>index<0||index>=sourcePositions.count))continue;
    const targets=triangle.map(copyVertex);if(mirrored)[targets[1],targets[2]]=[targets[2],targets[1]];
    indices.set(targets,nextIndex);nextIndex+=3;
    if(!sourceNormals){
     a.fromArray(positions,targets[0]*3);b.fromArray(positions,targets[1]*3);c.fromArray(positions,targets[2]*3);
     normal.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a));
     for(const target of targets){normals[target*3]+=normal.x;normals[target*3+1]+=normal.y;normals[target*3+2]+=normal.z;}
    }
   }
   if(!sourceNormals)for(let index=segmentStart;index<nextVertex;index++){normal.fromArray(normals,index*3).normalize();normal.toArray(normals,index*3);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,4));geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,color:0xffffff,roughness:.9,metalness:0,side:bucket.side,transparent:bucket.transparent,depthWrite:!bucket.transparent});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Atlas baked room surfaces';overview.add(mesh);triangleCount+=indices.length/3;
 }
 overview.userData.triangleCount=triangleCount;
 return overview;
}
