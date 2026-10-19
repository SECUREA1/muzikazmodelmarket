import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {environmentGeometry} from '../server-glb-geometry.mjs';

const floor=[-10,0,-10,-10,0,10,10,0,10,-10,0,-10,10,0,10,10,0,-10];
const wall=[-4,0,0,4,0,0,-4,3,0,4,3,0];
async function fixture(make,run){
 const directory=await mkdtemp(join(process.cwd(),'public/models/collision-format-'));
 try{
  const chunks=[],json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[]}],buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
  const bufferView=data=>{const offset=chunks.reduce((sum,chunk)=>sum+chunk.length,0),bytes=Buffer.from(data.buffer,data.byteOffset,data.byteLength);chunks.push(bytes,Buffer.alloc((4-bytes.length%4)%4));json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});return json.bufferViews.length-1;};
  const accessor=(data,components=3,componentType=5126)=>{json.accessors.push({bufferView:bufferView(data),componentType,count:data.length/components,type:components===1?'SCALAR':'VEC'+components});return json.accessors.length-1;};
  json.meshes[0].primitives.push({attributes:{POSITION:accessor(new Float32Array(floor))}});
  make({json,accessor,bufferView});
  const binary=Buffer.concat(chunks);json.buffers[0].byteLength=binary.length;
  const raw=Buffer.from(JSON.stringify(json)),padded=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+padded.length+8+binary.length,8);jh.writeUInt32LE(padded.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
  const file=join(directory,'room.glb');await writeFile(file,Buffer.concat([header,jh,padded,bh,binary]));
  await run({id:directory,modelUrl:'/'+relative(process.cwd(),file)},new ServerBuilderCollision());
 }finally{await rm(directory,{recursive:true,force:true});}
}

for(const mode of [5,6])test(`GLB triangle ${mode===5?'strip':'fan'} walls block both sides and high-speed walking without filling open space`,()=>fixture(({json,accessor})=>{
 const vertices=mode===5?wall:[-4,0,0,4,0,0,4,3,0,-4,3,0];
 json.meshes[0].primitives.push({mode,attributes:{POSITION:accessor(new Float32Array(vertices))}});
},(environment,collision)=>{
 for(const side of [-1,1]){
  assert.equal(collision.blocksShot(environment,{x:0,y:1.5,z:side*2},[0,0,-side],4),true);
  const moved=collision.resolve(environment,{x:0,y:.02,z:side*2},{x:1,y:.02,z:-side*20});
  assert.ok(moved.z*side>=.301);assert.ok(Math.abs(moved.x-1)<1e-8,'wall contact preserves tangent controls');
 }
 assert.equal(collision.blocksShot(environment,{x:5,y:1.5,z:2},[0,0,-1],4),false,'real wall ends leave open space');
}));

test('sparse GLB positions form physical faces instead of collapsed missing walls',()=>fixture(({json,bufferView})=>{
 json.accessors.push({componentType:5126,count:4,type:'VEC3',sparse:{count:4,indices:{bufferView:bufferView(new Uint8Array([0,1,2,3])),componentType:5121},values:{bufferView:bufferView(new Float32Array(wall))}}});
 json.meshes[0].primitives.push({mode:5,attributes:{POSITION:json.accessors.length-1}});
},(environment,collision)=>assert.equal(collision.blocksShot(environment,{x:0,y:1.5,z:2},[0,0,-1],4),true)));

test('quantized normalized positions retain node transforms and solid GLB walls',()=>fixture(({json,accessor})=>{
 const position=accessor(new Int16Array([-32767,0,0,32767,0,0,-32767,32767,0,32767,32767,0]),3,5122);json.accessors[position].normalized=true;
 json.nodes[0].scale=[4,3,1];json.nodes[0].translation=[3,0,-2];
 json.meshes[0].primitives.push({mode:5,attributes:{POSITION:position}});
},(environment,collision)=>{
 assert.equal(collision.blocksShot(environment,{x:3,y:1.5,z:0},[0,0,-1],4),true);
 assert.equal(collision.blocksShot(environment,{x:8,y:1.5,z:0},[0,0,-1],4),false);
}));

test('GLB collider metadata propagates from nodes and primitive extras',()=>fixture(({json,accessor})=>{
 json.nodes[0].extras={collisionDisabled:true};json.meshes[0].primitives.push({mode:5,attributes:{POSITION:accessor(new Float32Array(wall))},extras:{collider:true}});
},(environment,collision)=>{
 const geometry=environmentGeometry(environment);assert.equal(geometry.children[0].children[0].userData.collisionDisabled,true);
 assert.equal(collision.world(environment).floors.length,0,'explicit disabling also wins over a primitive collider');
 assert.equal(collision.blocksShot(environment,{x:0,y:1.5,z:2},[0,0,-1],4),false);
}));

test('GPU-instanced GLB wall transforms preserve a walkable doorway',()=>fixture(({json,accessor})=>{
 const positions=accessor(new Float32Array([-1,0,0,1,0,0,-1,3,0,1,3,0]));
 json.nodes[0]={mesh:1,translation:[4,0,-1],extensions:{EXT_mesh_gpu_instancing:{attributes:{TRANSLATION:accessor(new Float32Array([-2,0,0,2,0,0]))}}}};
 json.meshes.push({primitives:[{mode:5,attributes:{POSITION:positions}}]});json.nodes.push({mesh:0});json.scenes[0].nodes.push(1);
},(environment,collision)=>{
 for(const x of [2,6])assert.equal(collision.blocksShot(environment,{x,y:1.5,z:1},[0,0,-1],4),true);
 assert.equal(collision.blocksShot(environment,{x:4,y:1.5,z:1},[0,0,-1],4),false);
 const moved=collision.resolve(environment,{x:4,y:.02,z:1},{x:4,y:.02,z:-3});assert.equal(moved.z,-3);
}));


test('a reversed elevated GLB floor supports authoritative walking from either material face',()=>fixture(({json,accessor})=>{
 const reversed=[-2,1,-2,2,1,2,-2,1,2,-2,1,-2,2,1,-2,2,1,2];
 json.meshes[0].primitives.push({attributes:{POSITION:accessor(new Float32Array(reversed))}});
},(environment,collision)=>{
 const moved=collision.resolve(environment,{x:0,y:2,z:0},{x:0,y:.5,z:0});assert.ok(Math.abs(moved.y-1.02)<1e-6);
 assert.equal(collision.blocksShot(environment,{x:0,y:.5,z:0},[0,1,0],1),true,'the underside also blocks projectiles');
}));
