import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {boatMovementBlocked} from '../server-boat-assist.mjs';
import {isConstructionMachine} from '../public/js/construction-state.js';
import {isWatercraft,watercraftOverlap,watercraftSize,RESORT_BOATS} from '../public/js/harbor-water.js';
import {isShippingVessel} from '../public/js/shipping-vessel-specs.js';

// Frozen pre-change full-scan predicates: this reference does not call the new
// prepared-view helper. It retains the old ray ranges and actor filtering.
function legacyBlocksShot(collision,environment,origin,direction,distance,actors={},objects={}){
 if(!environment.builderScene&&!environment.proceduralLand&&!environment.modelUrl&&!environment.modelUrls?.length)return false;
 const world=collision.world(environment),start=new THREE.Vector3(origin.x,origin.y,origin.z),aim=new THREE.Vector3(...direction),ray=new THREE.Ray(start,aim);
 if(collision.placedWorld(actors,objects,environment).boxes.some(box=>{const point=ray.intersectBox(box,new THREE.Vector3());return point&&point.distanceTo(start)<distance-.05;}))return true;
 if(world.glb)return new THREE.Raycaster(start,aim,.02,Math.max(.02,distance-.05)).intersectObjects(world.floors,false).length>0;
 return world.walls.some(({box,objectId})=>{const actor=actors[objectId];if(actor&&(actor.open||!actor.active||(actor.holderId&&!isConstructionMachine(actor)&&!actor.constructionManaged)))return false;const point=ray.intersectBox(box,new THREE.Vector3());return point&&point.distanceTo(start)<distance-.05;});
}
function legacyBoatMovementBlocked(environment,boat,actors,collision,objects={}){
 const placed=collision?.placedObjects?.(objects)?.floors||[];
 return (from,to,yaw)=>{
  if(Object.values(actors).some(other=>other.id!==boat.id&&other.active!==false&&isWatercraft(other)&&watercraftOverlap(to,yaw,other.position,other.rotation?.y||0,.12,boat,other)))return true;
  const dx=to.x-from.x,dz=to.z-from.z,span=Math.hypot(dx,dz);if(span<.001)return false;
  const direction=[dx/span,0,dz/span];
  const [beam,length]=isShippingVessel(boat)||['harbor-yacht','harbor-patrol','harbor-fishing-boat',...RESORT_BOATS].includes(boat.modelId||boat.asset?.buildAssetId)?watercraftSize(boat):[.85,2];
  return [-beam,0,beam].some(side=>{
   const origin={x:from.x+Math.cos(yaw)*side-Math.sin(yaw)*length,y:.18,z:from.z-Math.sin(yaw)*side-Math.cos(yaw)*length};
   if(legacyBlocksShot(collision,environment,origin,direction,span+.12,Object.fromEntries(Object.entries(actors).filter(([id])=>id!==boat.id))))return true;
   return placed.length>0&&new THREE.Raycaster(new THREE.Vector3(origin.x,origin.y,origin.z),new THREE.Vector3(...direction),.001,span+.12).intersectObjects(placed,false).length>0;
  });
 };
}
const environment=()=>({id:'boat-shot-view',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:256,objects:[]}});
const boat=()=>({id:'pilot-hull',modelId:'harbor-skiff',active:true,health:200,position:{x:0,y:0,z:2},rotation:{x:0,y:0,z:0}});
const from={x:0,y:0,z:2},to={x:0,y:0,z:1};
const solid=()=>({id:'live-solid',modelId:'fixture-solid',spawned:true,active:true,
 asset:{id:'fixture-solid',renderKind:'image',configuration:{depth:40}},
 position:{x:0,y:0,z:-.5},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}});

test('three clear footprint rays prepare the real collision API only once',()=>{
 const collision=new ServerBuilderCollision();let worlds=0,placed=0,rays=0;
 collision.world=()=>{worlds++;return {glb:false,walls:[]};};
 collision.placedWorld=()=>{placed++;return {boxes:[],meshes:[]};};
 const prepare=collision.withShotCollisionView.bind(collision);
 collision.withShotCollisionView=(world,actors,objects,callback)=>prepare(world,actors,objects,query=>callback((...args)=>{rays++;return query(...args);}));
 const vessel=boat(),actors={[vessel.id]:vessel};
 assert.equal(boatMovementBlocked(environment(),vessel,actors,collision)(from,to,0),false);
 assert.equal(rays,3,'all three clear rays are still evaluated');
 assert.equal(worlds,1,'the callback shares one current static world');
 assert.equal(placed,1,'the callback shares one current placed view');
});

test('colliders implementing only blocksShot remain supported and exclude the own hull',()=>{
 const vessel=boat(),other={...boat(),id:'other-hull',position:{x:40,y:0,z:40}},actors={[vessel.id]:vessel,[other.id]:other},seen=[];
 const collision={blocksShot(world,origin,direction,distance,others){seen.push({origin,direction,distance,others});return false;}};
 assert.equal(boatMovementBlocked(environment(),vessel,actors,collision)(from,to,0),false);
 assert.equal(seen.length,3);assert.equal(seen[0].others,seen[1].others);assert.equal(seen[1].others,seen[2].others);
 for(const ray of seen){assert.equal(Object.hasOwn(ray.others,vessel.id),false);assert.equal(ray.others[other.id],other);assert.equal(ray.distance,1.12);assert.deepEqual(ray.direction,[0,0,-1]);}
 assert.deepEqual(seen.map(ray=>ray.origin.x),[-.85,0,.85]);
 assert.deepEqual(seen.map(ray=>ray.origin.z),[0,0,0]);
});

test('a reused blocked closure refreshes live membership, poses, activity and holders against the full-scan oracle',()=>{
 const env=environment(),vessel=boat(),actors={[vessel.id]:vessel};
 const collision=new ServerBuilderCollision(),reference=new ServerBuilderCollision();
 const query=boatMovementBlocked(env,vessel,actors,collision),oracle=legacyBoatMovementBlocked(env,vessel,actors,reference);
 const check=(label,expected)=>{const observed=query(from,to,0),baseline=oracle(from,to,0);assert.equal(observed,baseline,label);if(expected!==undefined)assert.equal(observed,expected,label);};
 check('own hull remains excluded',false);
 const obstacle=solid();actors[obstacle.id]=obstacle;check('inserted live geometry is not missed',true);
 obstacle.position.x=40;check('moved-away geometry is not stale',false);
 obstacle.position.x=0;check('moved-back geometry is current',true);
 obstacle.rotation.y=.3;obstacle.scale.x=1.2;check('rotation and scale match the original exact boxes');
 obstacle.active=false;check('inactive geometry is removed',false);
 obstacle.active=true;check('reactivated geometry matches the original result');
 obstacle.holderId='carrier';check('non-walkable held geometry is excluded',false);
 delete obstacle.holderId;check('released geometry is current again');
 delete actors[obstacle.id];check('removed actor is not retained',false);
});

test('prepared static-wall and GLB queries preserve full-scan ray ranges and predicates',()=>{
 const collision=new ServerBuilderCollision(),actors={door:{open:false,active:true}},box=new THREE.Box3(new THREE.Vector3(-1,0,-3),new THREE.Vector3(1,1,-2));
 let world={glb:false,walls:[{box,objectId:'door'}]},boxes=[];
 collision.world=()=>world;collision.placedWorld=()=>({boxes,meshes:[]});
 const rays=[
  [{x:0,y:.18,z:0},[0,0,-1],3],
  [{x:0,y:.18,z:-2.5},[0,0,-1],.1],
  [{x:0,y:.18,z:0},[0,0,-1],.01],
  [{x:3,y:.18,z:0},[0,0,-1],4],
  [{x:0,y:.18,z:0},[0,0,-2],3]
 ];
 const check=()=>collision.withShotCollisionView({id:'predicate-oracle',proceduralLand:true},actors,{},query=>{
  for(const args of rays){assert.equal(query(...args),legacyBlocksShot(collision,{id:'predicate-oracle',proceduralLand:true},...args,actors));assert.equal(collision.blocksShot({id:'predicate-oracle',proceduralLand:true},...args,actors),query(...args));}
 });
 check();actors.door.open=true;check();actors.door.open=false;actors.door.active=false;check();actors.door.active=true;actors.door.holderId='carrier';check();delete actors.door.holderId;
 boxes=[box];check();boxes=[];
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,1,.2),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.position.set(0,.5,-2.5);mesh.updateMatrixWorld(true);
 world={glb:true,walls:[],floors:[mesh]};check();
 mesh.geometry.dispose();mesh.material.dispose();
});

test('placed objects keep their separate exact raycast and are not added as shot-view AABBs',()=>{
 const vessel=boat(),objects={piece:{id:'piece'}},mesh=new THREE.Mesh(),collision=new ServerBuilderCollision();let floorRays=0,prepared=0;
 mesh.raycast=(ray,hits)=>{floorRays++;assert.equal(ray.near,.001);assert.equal(ray.far,1.12);hits.push({distance:.2,point:new THREE.Vector3(),object:mesh});};
 collision.placedObjects=value=>{assert.equal(value,objects);return {floors:[mesh]};};
 collision.world=()=>({glb:false,walls:[]});
 collision.placedWorld=(actors,value)=>{prepared++;assert.deepEqual(value,{},'the original blocksShot call did not receive placed pieces');return {boxes:[],meshes:[]};};
 assert.equal(boatMovementBlocked(environment(),vessel,{[vessel.id]:vessel},collision,objects)(from,to,0),true);
 assert.equal(prepared,1);assert.equal(floorRays,1);
 mesh.geometry.dispose();mesh.material.dispose();
});

test('an existing instance blocksShot override is never bypassed',()=>{
 const collision=new ServerBuilderCollision(),vessel=boat();let rays=0;
 collision.blocksShot=()=>{rays++;return false;};
 collision.world=()=>{throw new Error('a custom shot override must not prepare native geometry');};
 collision.placedWorld=()=>{throw new Error('a custom shot override must not prepare native geometry');};
 assert.equal(boatMovementBlocked(environment(),vessel,{[vessel.id]:vessel},collision)(from,to,0),false);
 assert.equal(rays,3);
});

test('a borrowed view cannot escape its synchronous callback',()=>{
 const collision=new ServerBuilderCollision();collision.world=()=>({glb:false,walls:[]});collision.placedWorld=()=>({boxes:[],meshes:[]});let escaped;
 collision.withShotCollisionView(environment(),{},{},query=>{escaped=query;assert.equal(query(from,[0,0,-1],1),false);});
 assert.throws(()=>escaped(from,[0,0,-1],1),/synchronous/);
});
