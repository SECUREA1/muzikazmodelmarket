import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

function fixture({glb=true}={}){
 const root=new THREE.Group(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),collision=new ServerBuilderCollision();
 const add=(name,size,position,rotation=0)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.name=name;mesh.position.set(...position);mesh.rotation.y=rotation;root.add(mesh);return mesh;};
 add('FLOOR',[30,.2,30],[0,-.1,0]);
 const environment=glb?{id:'capsule-room',modelUrl:'/public/models/room.glb'}:{id:'capsule-room',builderScene:{layout:'grand-floor',mapSize:40}};
 const install=()=>{root.updateMatrixWorld(true);const floors=[];root.traverse(mesh=>{if(mesh.isMesh)floors.push(mesh);});collision.cache.set(environment.id+':',{root,glb,floors,walls:floors.filter(mesh=>mesh.name!=='FLOOR').map(mesh=>({box:new THREE.Box3().setFromObject(mesh)})),bounds:new THREE.Box3().setFromObject(root)});};
 return {root,add,collision,environment,install,close(){root.traverse(mesh=>mesh.geometry?.dispose());material.dispose();}};
}
const move=(f,previous,next,objects={})=>f.collision.resolve(f.environment,previous,next,{},objects);

test('a player capsule stops at a wall while retaining diagonal travel along it',()=>{
 const f=fixture();try{f.add('WALL',[10,3,.1],[0,1.5,0]);f.install();
  const next=move(f,{x:0,y:.02,z:.5},{x:.6,y:.02,z:-.2});
  assert.ok(next.x>.5,'wall contact preserves tangential motion');assert.ok(next.z>=.349&&next.z<.4,'the complete capsule keeps its radius from the wall');assert.ok(next.collisionNormals?.some(normal=>normal.z>.9));
 }finally{f.close();}
});

test('tables and thin posts collide with the full player body even when the center ray misses them',()=>{
 const f=fixture();try{f.add('TABLE_EDGE',[4,.12,.15],[0,.75,0]);f.install();
  const stopped=move(f,{x:0,y:.02,z:.8},{x:0,y:.02,z:-.8});assert.ok(stopped.z>.36,'a table edge below chest height remains solid');
 }finally{f.close();}
 const post=fixture();try{post.add('NARROW_POST',[.12,3,.12],[.22,1.5,0]);post.install();const stopped=move(post,{x:0,y:.02,z:.8},{x:0,y:.02,z:-.8});assert.ok(Math.hypot(stopped.x-.22,stopped.z)>.34,'the capsule cannot pass through a post beside its centerline');}finally{post.close();}
});

test('procedural rotated walls use their actual mesh footprint rather than a solid enclosing rectangle',()=>{
 const f=fixture({glb:false});try{f.add('ROTATED_WALL',[8,3,.15],[0,1.5,0],Math.PI/4);f.install();const moved=move(f,{x:1,y:.02,z:1.7},{x:1.5,y:.02,z:1.7});assert.ok(moved.x>1.49&&Math.abs(moved.z-1.7)<1e-5,'empty space beside the rotated wall stays walkable');}finally{f.close();}
});

test('placed multiplayer building blocks slide along walls without freezing vertical movement',()=>{
 const f=fixture();try{f.install();const objects={wall:{materialId:'wall',position:[0,1.2,0],rotation:[0,0,0],scale:[3,1,1]}};
  const moved=move(f,{x:0,y:.3,z:.7},{x:.5,y:.2,z:-.2},objects);assert.ok(moved.x>.49);assert.ok(moved.z>=.399);assert.ok(moved.y<.3,'gravity is preserved while sliding');
 }finally{f.close();}
});

test('an existing shallow overlap can be escaped and wall seams do not pin the capsule',()=>{
 const f=fixture();try{f.add('WALL_LEFT',[5,3,.1],[-2.5,1.5,0]);f.add('WALL_RIGHT',[5,3,.1],[2.5,1.5,0]);f.install();
  const escaped=move(f,{x:-.2,y:.02,z:.2},{x:.3,y:.02,z:.7});assert.ok(escaped.x>.29&&escaped.z>.69,'separating motion leaves an initial overlap');
  let current={x:-2,y:.02,z:.3502};for(let i=0;i<80;i++)current=move(f,current,{...current,x:current.x+.05,z:current.z-.015});assert.ok(current.x>1.9,'continuous input crosses adjacent wall triangles and mesh seams');assert.ok(current.z>=.349);
 }finally{f.close();}
});


test('jumping capsules stop at solid ceilings and can continue moving below them',()=>{
 const f=fixture();try{f.add('CEILING',[8,.2,8],[0,2.2,0]);f.install();const jumped=move(f,{x:0,y:.02,z:0},{x:.4,y:1,z:0});assert.ok(jumped.y<=.401&&jumped.y>.38);assert.ok(Math.abs(jumped.ceilingY-2.1)<1e-5);assert.ok(jumped.x>.39);assert.ok(jumped.floorY<.03);const below=move(f,{x:0,y:.02,z:0},{x:.4,y:.02,z:0});assert.ok(below.x>.39&&below.ceilingY===undefined); }finally{f.close();}
});

test('short steps climb without wall jitter, and support is queried at the accepted side of a wall',()=>{
 const f=fixture({glb:false});try{f.add('STEP',[1,.24,4],[0,.12,0]);f.add('TALL_WALL',[.1,3,8],[2,1.5,0]);f.add('FAR_PLATFORM',[3,.6,8],[3.55,.3,0]);f.install();
  let current={x:-1,y:0,z:0};for(let i=0;i<25;i++)current=move(f,current,{...current,x:current.x+.06,y:current.y-.01});assert.ok(current.x>.45&&current.y>=.239,'a shallow step stays climbable');
  const blocked=move(f,{x:1.5,y:0,z:0},{x:2.2,y:-.05,z:0});assert.ok(blocked.x<1.66);assert.ok(blocked.y<.03,'the floor behind a wall cannot lift a player on this side');assert.ok(blocked.floorY<.03);
 }finally{f.close();}
});


test('deployed ramps retain their real shallow treads instead of becoming a solid bounding box',()=>{
 const f=fixture();try{f.install();const objects={ramp:{materialId:'ramp',position:[0,.6,0],rotation:[0,0,0],scale:[1,1,1]}};let current={x:0,y:.02,z:-2};for(let step=0;step<54;step++)current=move(f,current,{...current,z:current.z+.06,y:current.y-.01},objects);assert.ok(current.z>1.1&&current.y>1.19,'a shared ramp can be climbed without jumping');}finally{f.close();}
});


test('a saved entry point inside the player radius of a wall is moved to clear capsule space',()=>{
 const f=fixture();try{f.add('WALL',[10,3,.1],[0,1.5,0]);f.install();f.collision.world(f.environment).capsuleTree=undefined;
  // Resolve once builds the same collision tree used by normal decoded worlds.
  move(f,{x:0,y:.02,z:1},{x:0,y:.02,z:1});
  const spawn=f.collision.safeSpawn(f.environment,{x:0,y:1,z:.1});assert.ok(Math.abs(spawn.z)>=.349,'safe spawn preserves the full body radius');
 }finally{f.close();}
});

test('a double-sided ceiling plane blocks the head even when its authored normal points upward',()=>{
 const f=fixture();try{
  const ceiling=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));ceiling.name='CEILING_PLANE';ceiling.rotation.x=-Math.PI/2;ceiling.position.y=2.1;f.root.add(ceiling);f.install();
  const jumped=move(f,{x:0,y:.02,z:0},{x:.3,y:1,z:0});
  assert.ok(jumped.y<=.401&&jumped.y>.38,'winding must not let a capsule jump through a double-sided ceiling');assert.ok(Math.abs(jumped.ceilingY-2.1)<1e-5);assert.ok(jumped.x>.29);
  ceiling.material.dispose();
 }finally{f.close();}
});
