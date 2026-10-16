import test from 'node:test';
import assert from 'node:assert/strict';
import {WalkingMotion} from '../public/js/walking-motion.js';
import {resolvePlacedSolids} from '../public/js/placed-item-collision.js';
import {placedCollisionWorld} from '../server-placed-collision.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const box=(min,max)=>({min:{x:min[0],y:min[1],z:min[2]},max:{x:max[0],y:max[1],z:max[2]}});
test('solids support step-ups, stacked landings, ceilings and walking off edges',()=>{
 const boxes=[box([0,0,-1],[1,.4,1]),box([1,0,-1],[2,.8,1])];
 let p={x:-.5,y:0,z:0};for(let i=0;i<18;i++)p=resolvePlacedSolids(p,{x:p.x+.1,y:Math.max(0,p.y-.03),z:0},boxes);assert.ok(p.x>1);assert.equal(p.y,.8);assert.equal(p.grounded,true);
 const fall=resolvePlacedSolids({x:1.5,y:2,z:0},{x:1.5,y:.5,z:0},boxes);assert.equal(fall.y,.8);assert.equal(fall.grounded,true);
 const off=resolvePlacedSolids({x:2.2,y:.8,z:0},{x:2.5,y:.72,z:0},boxes);assert.equal(off.grounded,false);assert.equal(off.y,.72);
 const ceiling=resolvePlacedSolids({x:0,y:0,z:0},{x:0,y:1,z:0},[box([-1,2,-1],[1,2.2,1])]);assert.equal(ceiling.hitCeiling,true);assert.ok(ceiling.y<=.31);
});
test('swept movement cannot pass through a thin wall and can slide alongside it',()=>{
 const boxes=[box([0,0,-5],[.1,3,5])],p={x:-2,y:0,z:0};const hit=resolvePlacedSolids(p,{x:2,y:0,z:1},boxes);assert.ok(hit.x<0);assert.ok(hit.z>.8);
});
test('actual building pieces produce stair treads and leave an arch passage clear',()=>{
 const records={steps:{id:'steps',materialId:'steps',position:[0,.6,0],rotation:[0,0,0],scale:[1,1,1]}};
 const world=placedCollisionWorld({},records);assert.equal(world.boxes.length,4);assert.ok(new Set(world.boxes.map(box=>box.max.y)).size===4);
 let p={x:0,y:0,z:-1.8};for(let i=0;i<30;i++)p=resolvePlacedSolids(p,{x:0,y:Math.max(0,p.y-.02),z:p.z+.1},world.boxes);assert.ok(p.y>=1.1);
 const arch=placedCollisionWorld({},{arch:{id:'arch',materialId:'arch',position:[0,1.2,0],rotation:[0,0,0],scale:[1,1,1]}});const through=resolvePlacedSolids({x:0,y:0,z:-1},{x:0,y:0,z:1},arch.boxes);assert.equal(through.z,1);
 records.steps.open=true;assert.equal(placedCollisionWorld({},records).boxes.length,0);
 records.steps.materialId='water';records.steps.open=false;assert.equal(placedCollisionWorld({},records).boxes.length,0);
});
test('rotated drawn items use saved shape/depth and stop colliding when held or inactive',()=>{
 const mask=Array(256).fill(0);for(let i=0;i<16;i++)mask[240+i]=255;
 const actor={id:'drawing',spawned:true,active:true,position:{x:0,y:1,z:0},rotation:{x:0,y:0,z:0},scale:{x:2,y:2,z:2},asset:{id:'art',renderKind:'image',configuration:{collisionMask:mask,depth:80,yaw:90}}};
 const world=placedCollisionWorld({drawing:actor});assert.equal(world.boxes.length,16);assert.ok(Math.min(...world.boxes.map(box=>box.min.y))>=.999);assert.ok(Math.max(...world.boxes.map(box=>box.max.y))<1.2);
 actor.holderId='player';assert.equal(placedCollisionWorld({drawing:actor}).boxes.length,0);actor.holderId=null;actor.active=false;assert.equal(placedCollisionWorld({drawing:actor}).boxes.length,0);
});
test('server supports resting on dropped items and updates cached colliders after repositioning',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'placed-solids-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000;const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now,resolveAsset:async()=>({id:'floor',buildAssetId:'grand-floor',behavior:'decor'})}),environment={id:'solids',proceduralLand:true,builderScene:{layout:'urban-downtown',mapSize:80,objects:[]}},identity={accountId:'alice',username:'Alice'};
 const send=(action,id,extra={})=>runtime.command('solids',environment,identity,{action,requestId:id,...extra});await send('join','join');const spawned=await send('spawn','floor',{placement:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}});const id=spawned.result.spawnedId;
 await store.update('solids',room=>{room.simulation.players['account:alice'].position={x:0,y:1,z:0};room.simulation.players['account:alice'].velocityY=-1;});for(let i=0;i<10;i++){now+=50;await send('input','step-'+i,{input:{}});}const player=(await store.get('solids')).simulation.players['account:alice'];assert.ok(player.position.y>=.23&&player.position.y<=.25);assert.equal(player.grounded,true);
 const collision=new ServerBuilderCollision(),before=collision.placedWorld(spawned.actors).boxes.find(box=>box.objectId===id).min.x;spawned.actors[id].position.x+=5;spawned.actors[id].placementRevision++;assert.ok(collision.placedWorld(spawned.actors).boxes.find(box=>box.objectId===id).min.x>before+4);
});

test('solid paint is shared, durable, deduplicated and only its owner can clear it',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'solid-paint-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000,charges=0;const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now,charge:async()=>{charges++;}}),environment={id:'paint',proceduralLand:true,builderScene:{layout:'urban-downtown',mapSize:80,objects:[]}};
 const alice={accountId:'alice',username:'Alice'},bob={accountId:'bob',username:'Bob'},send=(person,action,requestId,extra={})=>runtime.command('paint',environment,person,{action,requestId,...extra});
 await send(alice,'join','join-a');await send(bob,'join','join-b');
 const painted=await send(alice,'draw-paint','stroke',{direction:[0,-1,0],color:0xff33aa}),stroke=Object.values(painted.actors).find(actor=>actor.asset?.renderKind==='paint-stroke');assert.ok(stroke);await send(alice,'draw-paint','stroke',{direction:[0,-1,0],color:0xff33aa});assert.equal(charges,1);
 assert.ok(runtime.collision.placedWorld(painted.actors).boxes.length);await assert.rejects(send(alice,'draw-paint','too-fast',{direction:[0,-1,0],color:1}),{statusCode:429});await send(bob,'clear-paint','clear-other');assert.ok((await store.get('paint')).simulation.actors[stroke.id]);
 const restored=new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>now});assert.ok((await restored.snapshot('paint',environment)).actors[stroke.id]);now+=300;await send(alice,'clear-paint','clear-own',{lastOnly:true});assert.equal((await store.get('paint')).simulation.actors[stroke.id],undefined);
});
test('local walking prediction remains outside a placed wall under held input',()=>{
 const motion=new WalkingMotion(),target={x:-1,y:0,z:0},boxes=[box([0,0,-2],[.1,3,2])];motion.reconcile(target,{serverTime:0,simulationTime:0,sentAt:0,receivedAt:0});let previous={...target};
 for(let frame=1;frame<=24;frame++){motion.sample(frame*16, .016,{side:1},4,target);const fixed=resolvePlacedSolids(previous,target,boxes);if(fixed.x!==target.x)motion.constrain(fixed);target.x=fixed.x;previous={...target};assert.ok(target.x<-.29);}
});
