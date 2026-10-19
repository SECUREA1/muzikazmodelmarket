import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {environmentGeometry} from '../server-glb-geometry.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

async function fixture(run,{instanced=false}={}){
 const directory=await mkdtemp(join(process.cwd(),'public/models/collision-metadata-'));
 try{
  const positions=new Float32Array([0,0,-2,0,3,-2,0,3,2,0,0,-2,0,3,2,0,0,2,-10,0,-5,-10,0,5,10,0,5,-10,0,-5,10,0,5,10,0,-5,2,0,0,6,0,0]);
  const binary=Buffer.from(positions.buffer);
  const data={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,2,3,4,5]}],nodes:[
   {name:'Disabled parent',extras:{collisionDisabled:true},children:[1]},
   {name:'Disabled wall',mesh:0},
   {name:'Invisible physical wall',mesh:1,translation:[2,0,0],extras:{collider:true}},
   {name:'Invisible guide',mesh:2,translation:[4,0,0]},
   {name:'Glass wall',mesh:3,translation:[6,0,0]},
   {name:'Floor',mesh:4}
  ],meshes:[
   {extras:{sourceTag:'authored-wall'},primitives:[{attributes:{POSITION:0},material:0,extras:{part:'panel'}}]},
   {primitives:[{attributes:{POSITION:0},material:1}]},
   {primitives:[{attributes:{POSITION:0},material:1}]},
   {primitives:[{attributes:{POSITION:0},material:2}]},
   {primitives:[{attributes:{POSITION:1},material:0}]}
  ],materials:[{}, {alphaMode:'BLEND',pbrMetallicRoughness:{baseColorFactor:[1,1,1,0]}}, {alphaMode:'BLEND',pbrMetallicRoughness:{baseColorFactor:[1,1,1,.35]}}],buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteLength:binary.length}],accessors:[
   {bufferView:0,byteOffset:0,componentType:5126,count:6,type:'VEC3'},
   {bufferView:0,byteOffset:72,componentType:5126,count:6,type:'VEC3'}
  ]};
  if(instanced){
   data.extensionsUsed=['EXT_mesh_gpu_instancing'];data.extensionsRequired=['EXT_mesh_gpu_instancing'];
   data.nodes=[{name:'Instanced panels',translation:[1,0,0],mesh:0,extensions:{EXT_mesh_gpu_instancing:{attributes:{TRANSLATION:2}}}},{name:'Floor',mesh:4}];data.scenes[0].nodes=[0,1];
   data.accessors.push({bufferView:0,byteOffset:144,componentType:5126,count:2,type:'VEC3'});
  }
  const json=Buffer.from(JSON.stringify(data)),padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binaryHeader=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+binary.length,8);jsonHeader.writeUInt32LE(padded.length);jsonHeader.writeUInt32LE(0x4e4f534a,4);binaryHeader.writeUInt32LE(binary.length);binaryHeader.writeUInt32LE(0x004e4942,4);
  const file=join(directory,'walls.glb');await writeFile(file,Buffer.concat([header,jsonHeader,padded,binaryHeader,binary]));
  await run({id:'collision-metadata',modelUrl:'/'+relative(process.cwd(),file)});
 }finally{await rm(directory,{recursive:true,force:true});}
}

test('server GLB geometry retains authored collision flags, inherited exclusions, and material transparency',()=>fixture(async environment=>{
 const root=environmentGeometry(environment),meshes=[];root.traverse(object=>{if(object.isMesh)meshes.push(object);});
 const disabled=meshes.find(mesh=>mesh.name==='Disabled wall');
 assert.equal(disabled.parent.parent.userData.collisionDisabled,true);
 assert.equal(disabled.userData.sourceTag,'authored-wall');assert.equal(disabled.userData.part,'panel');
 const physical=meshes.find(mesh=>mesh.name==='Invisible physical wall');
 assert.equal(physical.userData.collider,true);assert.equal(physical.material.opacity,0);
 assert.equal(meshes.find(mesh=>mesh.name==='Glass wall').material.opacity,.35);
}));

test('authoritative collision ignores invisible guides and disabled parents while keeping glass and explicit invisible walls',()=>fixture(async environment=>{
 const collision=new ServerBuilderCollision();
 const hitsAt=x=>collision.blocksShot(environment,{x:x-1,y:1,z:0},[1,0,0],2);
 assert.equal(hitsAt(0),false,'a child of collision-disabled scenery is not a phantom wall');
 assert.equal(hitsAt(2),true,'authored invisible physical walls still collide');
 assert.equal(hitsAt(4),false,'a fully transparent ordinary guide is not a solid obstacle');
 assert.equal(hitsAt(6),true,'visible transparent glass remains solid');
}));

test('server GLB instancing collides at each rendered panel without leaving a phantom at the base origin',()=>fixture(async environment=>{
 const collision=new ServerBuilderCollision(),panels=collision.world(environment).floors.filter(mesh=>mesh.name==='Instanced panels');
 assert.equal(panels.length,2,'each rendered instance has its own physical transform');
 const hitsAt=x=>collision.blocksShot(environment,{x:x-.5,y:1,z:0},[1,0,0],1);
 assert.equal(hitsAt(3),true);assert.equal(hitsAt(7),true);assert.equal(hitsAt(1),false,'the unused base mesh must not block empty space');
},{instanced:true}));
