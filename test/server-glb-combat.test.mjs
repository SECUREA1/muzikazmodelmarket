import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

async function collisionFixture(run){
 const dir=await mkdtemp(join(process.cwd(),'public/models/combat-fixture-'));
 try{
  // A 10m floor and a solid wall at z=0, sharing one GLB mesh as real houses do.
  const vertices=new Float32Array([-5,0,-5,-5,0,5,5,0,5, -5,0,-5,5,0,5,5,0,-5, -5,0,0,5,0,0,5,3,0, -5,0,0,5,3,0,-5,3,0, -5,3,-5,-5,3,5,5,3,5,-5,3,-5,5,3,5,5,3,-5]);
  const bin=Buffer.from(vertices.buffer),json=Buffer.from(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteLength:bin.length}],accessors:[{bufferView:0,componentType:5126,count:vertices.length/3,type:'VEC3'}]}));
  const padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+padded.length+8+bin.length,8);jh.writeUInt32LE(padded.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
  const file=join(dir,'room.glb');await writeFile(file,Buffer.concat([header,jh,padded,bh,bin]));
  await run({id:'collision-fixture',modelUrl:'/'+relative(process.cwd(),file),spawn:{x:0,y:1,z:2},playableSize:10});
 }finally{await rm(dir,{recursive:true,force:true});}
}

test('GLB room shots stop at actual wall triangles and safe spawns use the rendered floor',()=>collisionFixture(async map=>{
 const collision=new ServerBuilderCollision(),origin={x:0,y:1.5,z:2};
 assert.equal(collision.blocksShot(map,origin,[0,0,-1],4),true,'the wall blocks a target behind it');
 assert.equal(collision.blocksShot(map,origin,[0,0,-1],1),false,'a visible target before the wall can be hit');
 assert.equal(collision.blocksShot(map,origin,[1,0,0],4),false,'floor bounds are not treated as solid walls');
 const roofSpawn=collision.safeSpawn(map,{x:0,y:3,z:2});assert.equal(roofSpawn.y,.02,'a stale roof-height spawn is repaired to the ground floor even when roof and floor share one mesh');
 const spawn=collision.safeSpawn(map,map.spawn);assert.equal(spawn.y,.02);assert.equal(spawn.x,0);assert.equal(spawn.z,2);
 const moved=collision.resolve(map,{x:0,y:.02,z:2},{x:0,y:.02,z:-1},{});assert.ok(moved.z>0,'movement cannot cross the wall');
 assert.equal(collision.world(map),collision.world(map),'decoded collision geometry is cached');
}));

test('changing a GLB map transform invalidates its collision cache even when the map ID stays the same',()=>collisionFixture(async map=>{
 const collision=new ServerBuilderCollision(),first=collision.world(map),origin={x:1,y:1.5,z:2};
 assert.equal(collision.blocksShot(map,origin,[0,0,-1],4),true);
 const rotated={...map,rotation:{x:0,y:Math.PI/2,z:0}},updated=collision.world(rotated);
 assert.notEqual(updated,first,'newly rendered transforms cannot keep the old wall collider');
 assert.equal(collision.blocksShot(rotated,origin,[0,0,-1],4),false,'the old doorway direction is now clear');
 assert.equal(collision.blocksShot(rotated,{x:2,y:1.5,z:1},[-1,0,0],4),true,'the rotated wall remains solid at its rendered position');
 assert.equal(collision.world(rotated),updated,'the unchanged version reuses the collision tree');
}));

test('the bundled main house has a safe server entry and valid collision triangles',()=>{
 const collision=new ServerBuilderCollision(),map={id:'main-floor',modelUrl:'/public/models/environments/muzimakzmain.glb',playableSize:32,spawn:{x:0,y:1,z:2}};
 const roofSpawn=collision.safeSpawn(map,{x:0,y:100,z:2});assert.ok(Number.isFinite(roofSpawn.y));
 const spawn=collision.safeSpawn(map,map.spawn);assert.ok([spawn.x,spawn.y,spawn.z].every(Number.isFinite));assert.ok(collision.world(map).floors.length>0);
 let position=collision.groundAt(map,{x:-1.5,y:spawn.y,z:2});assert.ok(position);
 for(let step=0;step<60;step++){const next=collision.resolve(map,position,{...position,z:position.z+.06,y:position.y-.01});assert.ok(Math.abs(next.y-position.y)<.15,'crossing the scanned doorway keeps a stable floor');position={x:next.x,y:next.y,z:next.z};}
 assert.ok(position.z>5.5,'the actual main-floor doorway can be crossed');
 for(let step=0;step<60;step++){const next=collision.resolve(map,position,{...position,z:position.z-.06,y:position.y-.01});position={x:next.x,y:next.y,z:next.z};}assert.ok(position.z<2.1,'the actual doorway can also be exited');
});
