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
 const buffer=readFileSync(localModelPath(url));if(buffer.readUInt32LE(0)!==0x46546c67)throw Error('Invalid collision model.');
 let json,binary;
 for(let offset=12;offset+8<=buffer.length;){const size=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4);if(type===0x4e4f534a)json=JSON.parse(buffer.subarray(offset+8,offset+8+size).toString());if(type===0x004e4942)binary=buffer.subarray(offset+8,offset+8+size);offset+=8+size;}
 if(!json||!binary||json.extensionsRequired?.some(name=>/draco|meshopt/i.test(name)))throw Error('This collision model requires an unsupported decoder.');
 const view=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
 function accessor(index,components){
  const a=json.accessors[index],b=json.bufferViews[a.bufferView];
  if(a.sparse||b.buffer!==0)throw Error('Unsupported collision accessor.');
  const readers={5120:['getInt8',1],5121:['getUint8',1],5122:['getInt16',2],5123:['getUint16',2],5125:['getUint32',4],5126:['getFloat32',4]},reader=readers[a.componentType];if(!reader)throw Error('Unsupported collision component.');
  const out=components===1?new Uint32Array(a.count):new Float32Array(a.count*components),stride=b.byteStride||reader[1]*components,offset=(b.byteOffset||0)+(a.byteOffset||0);
  for(let i=0;i<a.count;i++)for(let c=0;c<components;c++){
   let value=view[reader[0]](offset+i*stride+c*reader[1],true);
   if(a.normalized&&a.componentType!==5126){const signed=a.componentType===5120||a.componentType===5122;value=signed?Math.max(-1,value/(2**(reader[1]*8-1)-1)):value/(2**(reader[1]*8)-1);}
   out[i*components+c]=value;
  }
  return out;
 }
 function node(index){
  const source=json.nodes[index],root=new THREE.Group();root.name=source.name||'';root.userData={...source.extras};
  if(source.matrix)root.applyMatrix4(new THREE.Matrix4().fromArray(source.matrix));else{if(source.translation)root.position.fromArray(source.translation);if(source.rotation)root.quaternion.fromArray(source.rotation);if(source.scale)root.scale.fromArray(source.scale);}
  const instanceAttributes=source.extensions?.EXT_mesh_gpu_instancing?.attributes;
  const instanceCount=instanceAttributes?json.accessors[Object.values(instanceAttributes)[0]]?.count:0;
  const instanceTransforms=instanceAttributes?Object.fromEntries([['TRANSLATION',3],['ROTATION',4],['SCALE',3]].filter(([name])=>instanceAttributes[name]!==undefined).map(([name,components])=>[name,accessor(instanceAttributes[name],components)])):null;
  if(source.mesh!==undefined)for(const primitive of json.meshes[source.mesh].primitives){
   if(primitive.mode!==undefined&&primitive.mode!==4)continue;
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(accessor(primitive.attributes.POSITION,3),3));if(primitive.indices!==undefined)geometry.setIndex(new THREE.BufferAttribute(accessor(primitive.indices,1),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const authoredMaterial=json.materials?.[primitive.material],alpha=authoredMaterial?.pbrMetallicRoughness?.baseColorFactor?.[3];
   // Match the browser loader's physical metadata and fully transparent meshes.
   // Explicit invisible colliders remain eligible through their authored flags.
   const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:authoredMaterial?.alphaMode==='BLEND',opacity:authoredMaterial?.alphaMode==='BLEND'&&Number.isFinite(alpha)?alpha:1});
   material.userData={...authoredMaterial?.extras};
   const mesh=new THREE.Mesh(geometry,material);mesh.name=source.name||json.meshes[source.mesh].name||'';mesh.userData={...json.meshes[source.mesh].extras,...source.extras,...primitive.extras};
   if(instanceTransforms){
    for(let instance=0;instance<instanceCount;instance++){
     const placed=mesh.clone(false);
     if(instanceTransforms.TRANSLATION)placed.position.fromArray(instanceTransforms.TRANSLATION,instance*3);
     if(instanceTransforms.ROTATION)placed.quaternion.fromArray(instanceTransforms.ROTATION,instance*4).normalize();
     if(instanceTransforms.SCALE)placed.scale.fromArray(instanceTransforms.SCALE,instance*3);
     root.add(placed);
    }
   }else root.add(mesh);
  }
  for(const child of source.children||[])root.add(node(child));return root;
 }
 const group=new THREE.Group();for(const index of json.scenes[json.scene||0].nodes||[])group.add(node(index));return group;
}
export function environmentGeometry(environment,{accelerate=true}={}){
 const root=new THREE.Group();for(const url of environment.modelUrls?.length?environment.modelUrls:[environment.modelUrl])root.add(glbGeometry(url));
 root.scale.setScalar((Number(environment.scale)||1)*(Number(environment.spaceScale)||1));root.rotation.set(environment.rotation?.x||0,environment.rotation?.y||0,environment.rotation?.z||0);root.updateMatrixWorld(true);
 const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()),footprint=Math.max(size.x,size.z);
 if(environment.playableSize>0&&footprint>0)root.scale.multiplyScalar(THREE.MathUtils.clamp(environment.playableSize/footprint,.01,100));root.updateMatrixWorld(true);if(accelerate)root.traverse(mesh=>{if(mesh.isMesh)accelerateStaticRaycast(mesh);});return root;
}

