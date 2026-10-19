import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {enemyBodyRadius,steerEnemyApart,enemyStepKeepsSpace} from '../public/js/enemy-spacing.js';
import {stepRadToxEnemy} from '../rad-tox-campaign.mjs';
import {ENEMY_BEHAVIORS} from '../server-enemy-combat.mjs';
import {moveWalkingCapsule} from '../public/js/walking-capsule.js';
import {BuilderGameplayRuntime,compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';

const player=()=>({id:'alice',position:{x:0,y:0,z:0},health:100});
const enemy=(id,kind='toxic',position={x:0,y:0,z:0})=>({id,kind,radTox:true,active:true,health:100,position:{...position},rotation:{y:0}});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const tick=(sim,actor,players,now,resolve=(_p,next)=>next,attack=false)=>stepRadToxEnemy(sim,actor,players,now,.05,()=>false,resolve,attack);

test('every enemy escapes an exact player overlap without changing the player position',()=>{
 for(const kind of Object.keys(ENEMY_BEHAVIORS)){
  const target=player(),actor=enemy(kind,kind),sim={actors:{[kind]:actor},events:[]},initial={...target.position};
  for(let frame=0;frame<100;frame++){
   const previous={...actor.position};tick(sim,actor,[target],1000+frame*50);
   assert.ok(distance(actor.position,previous)<=ENEMY_BEHAVIORS[kind].moveSpeed*.05+1e-8);
   assert.deepEqual(target.position,initial);
  }
  assert.ok(distance(actor.position,target.position)>enemyBodyRadius(kind)+.42);
 }
});

test('melee enemies retreat after striking and later return for another competitive attack',()=>{
 for(const kind of ['toxic','snake']){
  const target=player(),actor=enemy(kind,kind,{x:0,y:0,z:ENEMY_BEHAVIORS[kind].range*.85}),sim={actors:{[kind]:actor},events:[]};
  actor.attackStartedAt=0;let afterFirst=null,greatest=0;
  for(let frame=0;frame<160;frame++){
   tick(sim,actor,[target],2000+frame*50,undefined,true);
   if(sim.events.length&&!afterFirst)afterFirst=distance(actor.position,target.position);
   if(afterFirst)greatest=Math.max(greatest,distance(actor.position,target.position));
  }
  assert.ok(sim.events.length>=2,`${kind} keeps attacking after recovery`);
  assert.ok(greatest>afterFirst+.5,`${kind} visibly leaves the player after striking`);
  assert.deepEqual(target.position,{x:0,y:0,z:0});
 }
});

test('a dense eight-enemy overlap spreads into separate approach positions',()=>{
 const target=player(),actors=Object.fromEntries(Array.from({length:8},(_,i)=>['enemy-'+i,enemy('enemy-'+i)])),sim={actors,events:[]};
 for(let frame=0;frame<240;frame++)for(const actor of Object.values(actors))tick(sim,actor,[target],1000+frame*50);
 const rows=Object.values(actors);
 for(let i=0;i<rows.length;i++){
  assert.ok(distance(rows[i].position,target.position)>.92);
  for(let j=i+1;j<rows.length;j++)assert.ok(distance(rows[i].position,rows[j].position)>1.1);
 }
 assert.deepEqual(target.position,{x:0,y:0,z:0});
});

test('body sweeps reject tunnelling through a player while permitting a smooth exit from overlap',()=>{
 const context={id:'enemy',radius:.5,players:[player()],enemies:[]};
 assert.equal(enemyStepKeepsSpace({x:-2,y:0,z:0},{x:2,y:0,z:0},context),false);
 assert.equal(enemyStepKeepsSpace({x:0,y:0,z:0},{x:.1,y:0,z:0},context),true);
 assert.equal(enemyStepKeepsSpace({x:.2,y:0,z:0},{x:.1,y:0,z:0},context),false);
 assert.equal(enemyStepKeepsSpace({x:-2,y:3,z:0},{x:2,y:3,z:0},context),true);
});

test('escape and obstacle alternatives always pass through the provided wall resolver',()=>{
 const target=player();target.position.x=2;
 const actor=enemy('blocked','ghost'),sim={actors:{blocked:actor},events:[]};let calls=0;
 const resolve=(previous,next)=>{calls++;return {...next,x:Math.min(next.x,.6)};};
 for(let frame=0;frame<200;frame++){
  tick(sim,actor,[target],1000+frame*50,resolve);
  assert.ok(actor.position.x<=.6);
 }
 assert.ok(calls>100);
 assert.deepEqual(target.position,{x:2,y:0,z:0});
});

class Capsule {
 constructor(start,end,radius){this.start=start;this.end=end;this.radius=radius;}
 clone(){return new Capsule(this.start.clone(),this.end.clone(),this.radius);}
}
const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const localMethod=source.slice(source.indexOf('    moveEnemy(root,previous,delta,'),source.indexOf('    update(delta,elapsed,',source.indexOf('    moveEnemy(root,previous,delta,')));
const LocalEnemyMotion=new Function('THREE','Capsule','enemyBodyRadius','steerEnemyApart','enemyStepKeepsSpace','moveWalkingCapsule','walkingSurfaces','FLOOR_ENTRY_OFFSET','builderDecor','builderGameplay',`return class {${localMethod}}`)(THREE,Capsule,enemyBodyRadius,steerEnemyApart,enemyStepKeepsSpace,moveWalkingCapsule,()=>[],.02,{children:[]},{actor:()=>null});

function localWorld(triangles=[]){
 const world=new LocalEnemyMotion();world.bubbles=[];world.getPlayerPosition=()=>new THREE.Vector3(100,0,100);
 world.loader={octree:{getCapsuleTriangles(_capsule,result){result.push(...triangles);}}};return world;
}

test('native local enemy movement clips both sides of a thin mesh wall for walking and airborne enemies',()=>{
 const wall=[new THREE.Triangle(new THREE.Vector3(1,-2,-100),new THREE.Vector3(1,8,-100),new THREE.Vector3(1,-2,100)),new THREE.Triangle(new THREE.Vector3(1,8,-100),new THREE.Vector3(1,8,100),new THREE.Vector3(1,-2,100))];
 for(const side of [-1,1])for(const kind of ['snake','ghost','brain','boss','toxic']){
  const world=localWorld(wall),root=new THREE.Group();root.position.set(1+side*2,['snake','toxic'].includes(kind)?.02:1,0);world.bubbles=[root];
  for(let frame=0;frame<120;frame++){
   const previous=root.position.clone();root.position.x-=side*.2;
   world.moveEnemy(root,previous,.05,{kind,speed:4,...(kind==='toxic'?{grounded:true,feetBased:true}:{})});
   assert.ok(side*(root.position.x-1)>=enemyBodyRadius(kind)-.0001);
   assert.ok(root.position.distanceTo(previous)<=.20001);
  }
 }
});

test('native local enemies separate from the player and cap an old anchor jump after retreat',()=>{
 const world=localWorld(),root=new THREE.Group();world.getPlayerPosition=()=>new THREE.Vector3();root.position.set(0,.9,0);world.bubbles=[root];
 for(let frame=0;frame<60;frame++){
  const previous=root.position.clone();world.moveEnemy(root,previous,.05,{kind:'toxic',speed:2});
 }
 assert.ok(Math.hypot(root.position.x,root.position.z)>.92);
 const previous=root.position.clone();root.position.set(100,.9,100);world.moveEnemy(root,previous,5,{kind:'toxic',speed:2});
 assert.ok(root.position.distanceTo(previous)<=.20001);
 assert.deepEqual(world.getPlayerPosition().toArray(),[0,0,0]);
});

const bossSource=await readFile(new URL('../public/js/enemies/airborne-honey-bee.js',import.meta.url),'utf8');
const Boss=new Function('THREE','BEE_CONFIG','disposeObject',bossSource.slice(bossSource.indexOf('export class AirborneHoneyBee')).replace('export class','class')+';return AirborneHoneyBee;')(THREE,{},root=>root.traverse(part=>{part.geometry?.dispose();part.material?.dispose();}));
const bossConfig={id:'bee',label:'Honey bee',airborne:true,retreatDistance:2.75,retreatResumeDistance:4.25,attackRange:7,detectionRadius:13,attackCooldown:1.25,roamRadius:8,maxHealth:20,minimumGroundClearance:1.75,hoverSpeed:2.1,hoverAmount:.18,sprayCount:3,spraySpread:.1,projectileSpeed:9,projectileLifetime:3,playerDamageCooldown:.7,honeyDamage:7};

test('native honey bosses resolve movement before attack and honey is removed at solid geometry',()=>{
 let movement=0,damage=0;
 const boss=new Boss({scene:new THREE.Scene(),environmentMeshes:()=>[],getPlayerPosition:()=>new THREE.Vector3(),damagePlayer:()=>damage++,spawn:new THREE.Vector3(0,1.75,4),config:bossConfig,resolveMovement:()=>movement++,hasLineOfSight:()=>false});
 boss.ready=true;boss.root.position.copy(boss.spawn);boss.update(.05,2);
 assert.equal(movement,1);assert.equal(boss.projectiles.length,0);
 boss.hasLineOfSight=()=>true;boss.update(.05,4);assert.equal(boss.projectiles.length,3);
 boss.hasLineOfSight=()=>false;boss.updateProjectiles(.1,4.1);assert.equal(boss.projectiles.length,0);assert.equal(damage,0);
 boss.dispose();
});


test('solo Builder enemies resume after a suspended frame at bounded speed and inactive actors stay still',()=>{
 const manifest=compileBuilderScene({objects:[{id:'enemy',position:{x:0,y:0,z:0},functionalSettings:{behavior:'hostile'},movementSettings:{speed:2},aiSettings:{detectionRange:5}}]});
 const runtime=new BuilderGameplayRuntime({manifest});let traveled=0;
 const adapter={active:true,getPosition:()=>({x:0,y:0,z:0}),moveToward:(_target,speed,delta)=>{traveled+=speed*delta;}};
 runtime.register('enemy',adapter);runtime.update(30,{x:2,y:0,z:0});assert.ok(traveled<=.2);
 adapter.active=false;const previous=traveled;runtime.update(.05,{x:2,y:0,z:0});assert.equal(traveled,previous);
});
