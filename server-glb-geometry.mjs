import {readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import * as THREE from './public/vendor/three/three.module.min.js';
import {accelerateStaticRaycast} from './server-mesh-raycast.mjs';
function localModelPath(url){
 const path=new URL(url,'http://local').pathname;
 let root=process.cwd(),relative=path.replace(/^\//,'');
 if(!/^\/(public\/models|uploads)\//.test(path)||!path.toLowerCase().endsWith('.glb'))throw Error('No local collision model is available for this map.');
 const upload=path.match(/^\/uploads\/(environments|models|assets)\/(.+)$/);
 if(upload){root=upload[1]==='environments'?(process.env.MUZIKAZ_ENVIRONMENT_UPLOAD_DIR||resolve(root,'uploads/environments')):upload[1]==='models'?(process.env.UPLOAD_STORAGE_PATH||resolve(root,'uploads/models')):(process.env.MUZIKAZ_ASSET_UPLOAD_DIR||resolve(root,'uploads/assets'));relative=upload[2];}
 const file=resolve(root,relative);if(!file.startsWith(resolve(root)+sep))throw Error('Invalid collision model path.');return file;
}
function glbGeometry(url){
 const buffer=readFileSync(localModelPath(url));
 if(buffer.length<20||buffer.readUInt32LE(0)!==0x46546c67||buffer.readUInt32LE(4)!==2||buffer.readUInt32LE(8)!==buffer.length)throw Error('Invalid collision model.');
 let json,binary;
 for(let offset=12;offset+8<=buffer.length;){
  const size=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4),end=offset+8+size;
  if(end>buffer.length)throw Error('Invalid collision model chunk.');
  if(type===0x4e4f534a)json=JSON.parse(buffer.subarray(offset+8,end).toString());
  if(type===0x004e4942)binary=buffer.subarray(offset+8,end);
  offset=end;
 }
 if(!json||!binary||json.extensionsRequired?.some(name=>/draco|meshopt/i.test(name)))throw Error('This collision model requires an unsupported decoder.');
 const view=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
 const readers={5120:['getInt8',1,127],5121:['getUint8',1,255],5122:['getInt16',2,32767],5123:['getUint16',2,65535],5125:['getUint32',4,4294967295],5126:['getFloat32',4,1]};
 function accessor(index,components){
  const a=json.accessors?.[index],reader=a&&readers[a.componentType];
  if(!a||!reader)throw Error('Unsupported collision accessor.');
  const out=components===1?new Uint32Array(a.count):new Float32Array(a.count*components);
  const value=offset=>{const number=view[reader[0]](offset,true);return a.normalized?Math.max(a.componentType===5120||a.componentType===5122?-1:0,number/reader[2]):number;};
  if(a.bufferView!==undefined){
   const b=json.bufferViews?.[a.bufferView];if(!b||b.buffer!==0)throw Error('Unsupported collision buffer.');
   const stride=b.byteStride||reader[1]*components,offset=(b.byteOffset||0)+(a.byteOffset||0);
   for(let i=0;i<a.count;i++)for(let c=0;c<components;c++)out[i*components+c]=value(offset+i*stride+c*reader[1]);
  }
  // Sparse geometry is valid glTF, including an accessor with no base buffer.
  // Ignoring its replacements leaves holes or collapses authored wall faces.
  if(a.sparse){
   const sparse=a.sparse,indices=json.bufferViews?.[sparse.indices.bufferView],values=json.bufferViews?.[sparse.values.bufferView],indexReader=readers[sparse.indices.componentType];
   if(!indices||!values||indices.buffer!==0||values.buffer!==0||![5121,5123,5125].includes(sparse.indices.componentType))throw Error('Unsupported sparse collision accessor.');
   const indexOffset=(indices.byteOffset||0)+(sparse.indices.byteOffset||0),valueOffset=(values.byteOffset||0)+(sparse.values.byteOffset||0);
   for(let i=0;i<sparse.count;i++){
    const target=view[indexReader[0]](indexOffset+i*indexReader[1],true);
    if(target>=a.count)throw Error('Invalid sparse collision index.');
    for(let c=0;c<components;c++)out[target*components+c]=value(valueOffset+(i*components+c)*reader[1]);
   }
  }
  return out;
 }
 function primitiveMesh(primitive,source,definition){
  const mode=primitive.mode??4;if(![4,5,6].includes(mode)||primitive.attributes?.POSITION===undefined)return null;
  const geometry=new THREE.BufferGeometry(),positions=accessor(primitive.attributes.POSITION,3);
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  let indices=primitive.indices!==undefined?accessor(primitive.indices,1):null;
  if(mode!==4){
   const vertices=indices||Array.from({length:positions.length/3},(_,index)=>index),triangles=[];
   for(let i=2;i<vertices.length;i++){
    if(mode===6)triangles.push(vertices[0],vertices[i-1],vertices[i]);
    else if(i%2===0)triangles.push(vertices[i-2],vertices[i-1],vertices[i]);
    else triangles.push(vertices[i-1],vertices[i-2],vertices[i]);
   }
   indices=new Uint32Array(triangles);
  }
  if(indices)geometry.setIndex(new THREE.BufferAttribute(indices,1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  mesh.name=source.name||definition.name||'';
  mesh.userData={...(definition.extras||{}),...(primitive.extras||{})};
  return mesh;
 }
 function node(index){
  const source=json.nodes[index],root=new THREE.Group();root.name=source.name||'';root.userData={...(source.extras||{})};
  if(source.matrix){root.matrixAutoUpdate=false;root.matrix.fromArray(source.matrix);}
  else{if(source.translation)root.position.fromArray(source.translation);if(source.rotation)root.quaternion.fromArray(source.rotation);if(source.scale)root.scale.fromArray(source.scale);}
  if(source.mesh!==undefined){
   const definition=json.meshes[source.mesh],meshes=definition.primitives.map(primitive=>primitiveMesh(primitive,source,definition)).filter(Boolean),instancing=source.extensions?.EXT_mesh_gpu_instancing?.attributes;
   if(instancing){
    const translations=instancing.TRANSLATION===undefined?null:accessor(instancing.TRANSLATION,3),rotations=instancing.ROTATION===undefined?null:accessor(instancing.ROTATION,4),scales=instancing.SCALE===undefined?null:accessor(instancing.SCALE,3),count=translations?translations.length/3:rotations?rotations.length/4:scales?scales.length/3:0;
    for(let instance=0;instance<count;instance++){
     const copy=new THREE.Group();
     if(translations)copy.position.fromArray(translations,instance*3);if(rotations)copy.quaternion.fromArray(rotations,instance*4);if(scales)copy.scale.fromArray(scales,instance*3);
     for(const mesh of meshes)copy.add(mesh.clone(false));root.add(copy);
    }
   }else root.add(...meshes);
  }
  for(const child of source.children||[])root.add(node(child));return root;
 }
 const group=new THREE.Group();for(const index of json.scenes?.[json.scene??0]?.nodes||[])group.add(node(index));return group;
}
export function environmentGeometry(environment){
 const root=new THREE.Group();for(const url of environment.modelUrls?.length?environment.modelUrls:[environment.modelUrl])root.add(glbGeometry(url));
 root.scale.setScalar((Number(environment.scale)||1)*(Number(environment.spaceScale)||1));root.rotation.set(environment.rotation?.x||0,environment.rotation?.y||0,environment.rotation?.z||0);root.updateMatrixWorld(true);
 const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()),footprint=Math.max(size.x,size.z);
 if(environment.playableSize>0&&footprint>0)root.scale.multiplyScalar(THREE.MathUtils.clamp(environment.playableSize/footprint,.01,100));root.updateMatrixWorld(true);root.traverse(mesh=>{if(mesh.isMesh)accelerateStaticRaycast(mesh);});return root;
}

