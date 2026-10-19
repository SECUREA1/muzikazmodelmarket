import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const prototype=runInNewContext(source.slice(source.indexOf('  class ToxicBubbleSystem'),source.indexOf('  let viewActive = true'))+'\nToxicBubbleSystem.prototype;',{
  THREE,performance,visualQuality:{effects:0},mobileQualityMode:false,
  TOXIC_BUBBLE_CONFIG:{snakeApproachSpeed:1.15,snakeRetreatSpeed:1.85,snakeBiteRange:1.15,snakeBiteCooldown:2.2,snakeReturnDistance:4.4,ghostAvoidDistance:2.2,ghostPreferredDistance:3.7,ghostFollowSpeed:1.2,ghostGasCooldown:1.25,gasEmissionInterval:1.15}
});

function fixture(surfaces=[]){
  let checks=0;
  const system={loader:{bounds:new THREE.Box3(new THREE.Vector3(-30,-2,-30),new THREE.Vector3(30,5,30))},surfaceRaycaster:new THREE.Raycaster(),environmentSurfaces:()=>surfaces,
    floorAt:(x,z)=>{checks++;return {point:new THREE.Vector3(x,0,z)};},moveEnemy:prototype.moveEnemy};
  return {system,get checks(){return checks;}};
}

test('enemy velocities preserve authored speed at30/60/120Hz while floor queries remain staggered',()=>{
  const distances=[];
  for(const hz of [30,60,120]){
    const item=fixture(),root=new THREE.Group();root.position.y=.02;root.userData.phase=.3;
    for(let frame=0;frame<hz*2;frame++)prototype.moveEnemy.call(item.system,root,0,1,1.15/hz,frame/hz,true);
    distances.push(root.position.z);assert.ok(item.checks<=10,'floor work runs at4Hz rather than once per rendered frame');
  }
  for(const distance of distances)assert.ok(Math.abs(distance-2.3)<1e-8);
});

test('enemy steering slides along a real GLB-style wall instead of embedding or freezing',()=>{
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.1,3,8),new THREE.MeshBasicMaterial());wall.position.set(.8,1.5,0);wall.updateMatrixWorld(true);
  const {system}=fixture([wall]),root=new THREE.Group();root.position.y=.02;root.userData.phase=.2;
  for(let frame=0;frame<240;frame++)prototype.moveEnemy.call(system,root,1,0,1.15/60,frame/60,true);
  assert.ok(root.position.x<.7,'the actor stays out of the wall');assert.ok(Math.abs(root.position.z)>1.5,'a blocked chase keeps moving along cover');
});

test('brain steering refreshes without an optional phase and remains on its walkable floor',()=>{
  const item=fixture(),root=new THREE.Group();root.position.y=.62;
  for(let frame=0;frame<180;frame++)prototype.moveEnemy.call(item.system,root,1,0,2.65/60,frame/60,.62);
  assert.ok(Number.isFinite(root.userData.motionUntil));assert.ok(item.checks>8);assert.equal(root.position.y,.62);assert.ok(Math.abs(root.position.x-7.95)<1e-8);
});

test('real brain animation and steering preserve movement on GLB floors below world zero',()=>{
  const brainSource=readFileSync(new URL('../public/js/enemies/neon-brain-bug.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');
  const brainPrototype=runInNewContext(brainSource+'\nNeonBrainBug.prototype;',{THREE});
  const {system}=fixture(),root=new THREE.Group();root.position.set(0,-2.88,0);
  system.floorAt=(x,z)=>({point:new THREE.Vector3(x,-3.5,z)});system.loader.bounds.min.y=-5;
  const effect={update(){},stop(){},play(){}};
  const actor={root,baseY:-2.88,phase:0,toPlayer:new THREE.Vector3(),legs:[],aura:new THREE.Group(),attackTell:effect,attackFlash:effect,lastSprayAt:-Infinity,update:brainPrototype.update};
  root.userData={brainBug:true,actor};system.bubbles=[root];system.particleBursts=[];
  for(let frame=0;frame<60;frame++)prototype.updateEnemies.call(system,1/60,frame/60,new THREE.Vector3(0,-3.5,8));
  assert.ok(root.position.z>2.5,'negative floor coordinates cannot stall the chase');
  assert.ok(Math.abs(root.position.y-(-2.88))<.02,'the brain stays above its authored floor');
});

test('all local actors keep animating at low quality while decorative gas stays bounded',()=>{
  const fixtureValue=fixture(),system=fixtureValue.system;let attacks=0,brains=0;
  const snake=new THREE.Group();snake.position.set(0,.02,0);snake.userData={snake:true,mode:'approach',phase:0,lastBiteAt:-Infinity,parts:[new THREE.Group()]};
  const ghost=new THREE.Group();ghost.position.set(0,1,0);ghost.userData={ghost:true,anchorPosition:ghost.position.clone(),phase:0,lastGasAt:-Infinity,halo:new THREE.Sprite(new THREE.SpriteMaterial())};
  const brain=new THREE.Group();brain.position.set(0,.62,0);brain.userData={brainBug:true,actor:{phase:0,update(delta){brains++;brain.position.x+=2.65*delta;}}};
  Object.assign(system,{bubbles:[snake,ghost,brain],particleBursts:[],takeDamage(){attacks++;},tone(){},sprayGhostGas(){attacks++;},createPopParticles(){throw Error('Decorative gas must stay off at low quality.');}});
  for(let frame=0;frame<60;frame++)prototype.updateEnemies.call(system,1/60,frame/60,new THREE.Vector3(0,0,6));
  assert.equal(system.bubbles.length,3);assert.equal(brains,60);assert.ok(attacks>0);assert.ok(snake.position.z>0);assert.ok(ghost.position.z>0);assert.equal(ghost.userData.halo.visible,false);
});

test('repeated HUD requests skip all DOM queries until visible combat state changes',()=>{
  let queries=0;const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',style:{setProperty(){}}});return nodes.get(selector);};
  const hud={querySelector:selector=>{queries++;return node(selector);}};
  const update=runInNewContext(`class Hud {${prototype.updateHud.toString()}};Hud.prototype.updateHud;`,{
    window:{MZKWallet:{walletId:()=> 'player',balance:()=>5}},performance,serverHostedRoom:false,isLocalRadToxCampaign:()=>false,
    toxicHud:hud,demoBalance:{hidden:true,querySelector:()=>({textContent:''})},FLAME_CONFIG:{tank:100},hitsRemaining:()=>45,updateCompactHud(){}
  });
  const system={state:'active',level:1,health:100,ammo:120,sprayFuel:24,flameSystem:{fuel:100},tool:'laser',score:0,shotStreak:0,bubbles:[],enemyRepopulations:0,levelTarget:36,shieldUntil:0,backpackRewards:[],getEnvironment:()=>({name:'Arena'}),bossConfigForLevel:()=>null,updateInventory(){}};
  update.call(system);assert.ok(queries>0);queries=0;
  for(let request=0;request<100;request++)update.call(system);assert.equal(queries,0);
  system.ammo--;update.call(system);assert.ok(queries>0);assert.equal(node('[data-rad-tox-ammo]').textContent,'Ammo: 119');
  queries=0;system.health=80;update.call(system);assert.ok(queries>0);assert.match(node('[data-rad-tox-health]').textContent,/80%/);
});
