import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,relative} from 'node:path';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {sweepWalkingMotion} from '../public/js/walking-sweep.js';

const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} should equal ${expected}`);
const wall={a:{x:-5,z:0},b:{x:5,z:0}};
const floor=[-10,0,-10,-10,0,10,10,0,10,-10,0,-10,10,0,10,10,0,-10];
function box(size,position,rotation=0){
 const geometry=new THREE.BoxGeometry(...size).toNonIndexed();
 geometry.rotateY(rotation);geometry.translate(...position);
 const positions=[...geometry.attributes.position.array];geometry.dispose();return positions;
}
async function fixture(extra,run,{floorVertices=floor}={}){
 const directory=await mkdtemp(join(process.cwd(),'public/models/walking-fixture-'));
 try{
  // Real GLB loading, including a floor and walls merged in one authored mesh.
  const vertices=new Float32Array([...floorVertices,...extra]);
  const bin=Buffer.from(vertices.buffer),json=Buffer.from(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteLength:bin.length}],accessors:[{bufferView:0,componentType:5126,count:vertices.length/3,type:'VEC3'}]}));
  const padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+padded.length+8+bin.length,8);jsonHeader.writeUInt32LE(padded.length);jsonHeader.writeUInt32LE(0x4e4f534a,4);binHeader.writeUInt32LE(bin.length);binHeader.writeUInt32LE(0x004e4942,4);
  const file=join(directory,'walking.glb');await writeFile(file,Buffer.concat([header,jsonHeader,padded,binHeader,bin]));
  const environment={id:directory,modelUrl:'/'+relative(process.cwd(),file)};
  await run(new ServerBuilderCollision(),environment);
 }finally{await rm(directory,{recursive:true,force:true});}
}

test('wall contact clips only blocked motion and slides without tunneling',()=>{
 const moved=sweepWalkingMotion({x:0,z:1},{x:2,z:-9},[wall]);
 near(moved.x,2);near(moved.z,.302);
 const tangent=sweepWalkingMotion(moved,{x:3,z:moved.z},[wall]);
 near(tangent.x,3);near(tangent.z,moved.z);
 const corner=sweepWalkingMotion({x:0,z:1},{x:2,z:-2},[wall,{a:{x:1,z:0},b:{x:1,z:5}}]);
 near(corner.x,.698);near(corner.z,.302);
});

test('initial overlap never relocates an idle player and permits moving away or along a wall',()=>{
 const start={x:0,y:.02,z:.1};
 assert.deepEqual(sweepWalkingMotion(start,start,[wall]),start);
 near(sweepWalkingMotion(start,{...start,z:1},[wall]).z,1);
 near(sweepWalkingMotion(start,{...start,x:1},[wall]).x,1);
 near(sweepWalkingMotion(start,{...start,z:.05},[wall]).z,.1);
});

test('authored walls clip a diagonal walking request instead of freezing its tangent',()=>fixture(box([10,3,.05],[0,1.5,0]),(collision,environment)=>{
 const start={x:0,y:.02,z:1};
 const moved=collision.resolve(environment,start,{x:1,y:-.1,z:-1});
 near(moved.x,1);near(moved.z,.327);near(moved.y,.02);near(moved.floorY,.02);
 for(let step=0;step<30;step++){
  const next=collision.resolve(environment,moved,{...moved,x:moved.x+.05,z:moved.z-.1});
  near(next.x,moved.x+.05);near(next.z,moved.z);
 }
}));

test('full player height stops low rails missed by a single waist-height ray',()=>fixture(box([10,.2,.04],[0,1.35,0]),(collision,environment)=>{
 const moved=collision.resolve(environment,{x:0,y:.02,z:1},{x:0,y:.02,z:-2});
 assert.ok(moved.z>=.321,'a thin rail blocks the swept capsule');
}));

test('touching geometry cannot lift, push, or drift a stationary player',()=>fixture([
 ...box([10,3,.05],[0,1.5,0]),...box([1,.24,1],[2,.12,2])
],(collision,environment)=>{
 for(const start of [{x:0,y:.02,z:.1},{x:2,y:.02,z:2}]){
  let position={...start};
  for(let step=0;step<100;step++)position=collision.resolve(environment,position,{...position,y:position.y-.02});
  near(position.x,start.x);near(position.z,start.z);near(position.y,start.y);
 }
}));

test('intentional walking follows supported steps but nearby edges do not lift the player',()=>fixture(box([1,.24,1],[0,.12,0]),(collision,environment)=>{
 const edge=collision.resolve(environment,{x:0,y:.02,z:.8},{x:0,y:-.01,z:.6});
 near(edge.z,.6);near(edge.y,.02);
 const stepped=collision.resolve(environment,edge,{x:0,y:-.01,z:.4});
 near(stepped.z,.4);near(stepped.y,.26);
 const slowTick=collision.resolve(environment,edge,{x:0,y:edge.y-18*.25*.25,z:.4});
 near(slowTick.z,.4);near(slowTick.y,.26);
 const idle=collision.resolve(environment,{x:0,y:.02,z:0},{x:0,y:.02,z:0});
 near(idle.y,.02);
}));

test('tall obstacles block instead of being treated as steps',()=>fixture(box([2,.45,1],[0,.225,0]),(collision,environment)=>{
 const moved=collision.resolve(environment,{x:0,y:.02,z:1},{x:.4,y:-.1,z:0});
 near(moved.x,.4);near(moved.z,.802);near(moved.y,.02);
}));

test('jump ceilings and downward landings use swept vertical motion',()=>fixture([
 ...box([4,.2,4],[0,2.1,0]),...box([2,.4,2],[4,.2,0])
],(collision,environment)=>{
 const jumped=collision.resolve(environment,{x:0,y:.02,z:0},{x:0,y:1.2,z:0});
 assert.equal(jumped.blockedCeiling,true);near(jumped.y,.298,1e-5);
 const landed=collision.resolve(environment,{x:4,y:2,z:0},{x:4,y:-1,z:0});
 near(landed.y,.42);near(landed.floorY,.42);
}));

test('a missing floor triangle keeps intended movement and fixed safety support',()=>fixture(box([.1,3,.1],[9,1.5,9]),(collision,environment)=>{
 const moved=collision.resolve(environment,{x:-.2,y:.02,z:0},{x:.4,y:-.1,z:0});
 near(moved.x,.4);near(moved.y,.02);
},{floorVertices:[-10,0,-10,-10,0,10,0,0,10,-10,0,-10,0,0,10,0,0,-10]}));

test('an explicitly relocated player beyond map bounds can return using controls without being clamped',()=>fixture([], (collision,environment)=>{
 const start={x:10.2,y:.02,z:0};
 const idle=collision.resolve(environment,start,start);near(idle.x,start.x);near(idle.z,start.z);
 const returning=collision.resolve(environment,start,{...start,x:9.5});near(returning.x,9.5);
}));

test('open and held builder actors stop contributing both wall and floor collisions',()=>{
 const environment={id:'builder-collision-state',builderScene:{layout:'grand-floor',objects:[{id:'door',modelId:'portal-door',position:{x:0,y:0,z:0}}]}};
 const collision=new ServerBuilderCollision(),world=collision.world(environment);
 assert.ok(world.triangles.length,'the authored builder object has collision triangles');
 const start={x:0,y:.02,z:2},next={x:0,y:.02,z:-2};
 assert.ok(collision.resolve(environment,start,next,{}).z>0);
 for(const state of [{open:true},{active:false},{holderId:'player'}])near(collision.resolve(environment,start,next,{door:state}).z,-2);
});

test('rotated placed walls use their actual footprint instead of an enlarged solid envelope',()=>{
 const environment={id:'rotated-placed-wall',builderScene:{layout:'grand-floor'}},collision=new ServerBuilderCollision();
 const objects={wall:{id:'wall',materialId:'wall',position:[0,1.2,0],rotation:[0,Math.PI/4,0],scale:[1,1,1]}};
 const moved=collision.resolve(environment,{x:.7,y:.02,z:1.2},{x:.7,y:-.02,z:.7},{},objects);
 near(moved.x,.7);near(moved.z,.7);near(moved.y,.02);
 const blocked=collision.resolve(environment,{x:1,y:.02,z:1},{x:-1,y:.02,z:-1},{},objects);
 assert.ok(blocked.x+blocked.z>.4,'crossing the actual wall is still blocked');
});

test('a placed solid enclosing a player permits controlled escape and never relocates on its own',()=>{
 const environment={id:'placed-overlap',builderScene:{layout:'grand-floor'}},collision=new ServerBuilderCollision();
 const objects={wall:{id:'wall',materialId:'wall',position:[0,1.2,0],rotation:[0,0,0],scale:[1,1,1]}};
 const start={x:0,y:.02,z:0};
 const idle=collision.resolve(environment,start,{...start,y:-.02},{},objects);
 near(idle.x,0);near(idle.z,0);near(idle.y,.02);
 const escaped=collision.resolve(environment,start,{x:0,y:-.02,z:1},{},objects);
 near(escaped.z,1);near(escaped.y,.02);
});

test('a low ceiling prevents stepping into the space underneath it',()=>fixture([
 ...box([2,.24,1],[0,.12,0]),...box([2,.2,1],[0,1.8,0])
],(collision,environment)=>{
 const moved=collision.resolve(environment,{x:0,y:.02,z:1},{x:0,y:-.02,z:.25});
 assert.ok(moved.z>=.801,'the failed step clips at the obstacle instead of entering its solid volume');
 near(moved.y,.02);
}));

test('map collider caches invalidate when the content revision changes',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'edited-builder-wall',builderScene:{layout:'grand-floor'}};
 const before=collision.world({...environment,contentUpdatedAt:'revision-one'});
 const after=collision.world({...environment,contentUpdatedAt:'revision-two',builderScene:{...environment.builderScene,objects:[{id:'door',modelId:'portal-door'}]}});
 assert.notEqual(before,after);assert.ok(after.triangles.length>before.triangles.length);
 const spawn=collision.safeSpawn(environment,{x:3,y:0,z:3});near(spawn.y,.02);
 const idle=collision.resolve(environment,spawn,{...spawn,y:spawn.y-.02});near(idle.y,spawn.y);
});

test('startup spawn clears corner walls and keeps calibrated feet on the floor',()=>fixture([
 ...box([.2,3,20],[0,1.5,0]),...box([20,3,.2],[0,1.5,0])
],(collision,environment)=>{
 const spawn=collision.safeSpawn(environment,{x:.2,y:1,z:.2});
 near(spawn.y,.02);assert.ok(collision.hasBodyClearance(environment,spawn,.8));
 for(let i=0;i<8;i++){const angle=i*Math.PI/4,step=collision.resolve(environment,spawn,{x:spawn.x+Math.cos(angle)*.5,y:spawn.y-.05,z:spawn.z+Math.sin(angle)*.5});assert.ok(Math.hypot(step.x-spawn.x,step.z-spawn.z)>.45,'the player can immediately move in every direction');}
}));

test('enemy placement keeps distance and never falls back onto the player',()=>fixture([], (collision,environment)=>{
 const player={x:0,y:.02,z:0},occupied=[];
 for(let i=0;i<8;i++){const enemy=collision.encounterSpawn(environment,player,player,occupied,{enemy:true,players:[player]});assert.ok(enemy);near(enemy.y,.02);assert.ok(Math.hypot(enemy.x,enemy.z)>=4);assert.ok(occupied.every(p=>Math.hypot(p.x-enemy.x,p.z-enemy.z)>=.65));occupied.push(enemy);}
 const old=collision.groundAt;collision.groundAt=()=>null;assert.equal(collision.encounterSpawn(environment,player,player,[],{enemy:true}),null);collision.groundAt=old;
}));
