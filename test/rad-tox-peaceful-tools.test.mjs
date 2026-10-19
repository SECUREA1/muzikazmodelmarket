import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const update=source.slice(source.indexOf('    update(delta,elapsed,'),source.indexOf('\n    updateVisualEffects(delta,elapsed)'));
const effects=source.slice(source.indexOf('    updateVisualEffects(delta,elapsed)'),source.indexOf('\n    clearBrainSpray()',source.indexOf('    updateVisualEffects(delta,elapsed)')));
const shocks=source.slice(source.indexOf('    updateElectricShocks(delta,elapsed)'),source.indexOf('\n    clearElectricShocks()',source.indexOf('    updateElectricShocks(delta,elapsed)')));
const enemyTargets=source.split('\n').filter(line=>line.startsWith('    beeAt(pointer)')||line.startsWith('    targetAt(pointer)')).join('\n');
const flameTargets=source.slice(source.indexOf('    flameColliders(){'),source.indexOf('\n    damageTarget(',source.indexOf('    flameColliders(){')));
const context=vm.createContext({rangeActive:false,RAD_TOX_STATES:{ACTIVE:'active'},TOXIC_BUBBLE_CONFIG:{batSwingDuration:.3,hoverRayInterval:1000,dynamiteFuse:.25},performance:{now:()=>0},builderDecor:{children:[]},playerRig:{},window:{dispatchEvent(){}},CustomEvent:class {constructor(type,detail){this.type=type;this.detail=detail;}}});
const Controller=vm.runInContext(`class Controller {${update}\n${effects}\n${shocks}\n${enemyTargets}\n${flameTargets}}; Controller`,context);

const pose=()=>({set(...values){this.values=values;}});
function visual(){
  return {position:pose(),rotation:pose(),material:{opacity:1,dispose(){this.disposed=true;}},geometry:{dispose(){this.disposed=true;}},removeFromParent(){this.removed=true;}};
}
function fixture(){
  const controller=new Controller();
  let bossFrames=0,flameFrames=0,hudUpdates=0,projectileFrames=0,explosions=0;
  Object.assign(controller,{
    utilityEffects:[],weaponCooldown:.25,flameModel:{},flameSystem:{update(){flameFrames++;}},flameTrigger:null,
    endBoss:{update(){bossFrames++;},isDisposed:false},tool:'laser',ownsBat:true,batSwing:0,batSwingQueue:0,
    batModel:visual(),taserModel:visual(),toxinModel:visual(),dynamiteModel:visual(),brickModel:visual(),
    taserCooldown:.25,toxinCooldown:.25,dynamiteCooldown:.25,electricShocks:[],
    state:'active',floorGas:[],bubbles:[],pickups:[],brainSpray:[],ghostGas:[],hoverTimer:0,
    shieldUntil:0,shieldShell:{visible:true,scale:{setScalar(){}}},
    particleBursts:[],toxinGlobs:[],dynamites:[],explosions:[],lasers:[],
    scene:{remove(object){object.removed=true;}},
    getPlayerPosition:()=>({}),updateHud(){hudUpdates++;},
    moveThrownProjectile(projectile,delta){projectileFrames++;projectile.position.x+=projectile.userData.velocity.x*delta;},
    explodeDynamite(projectile){explosions++;this.dynamites.splice(this.dynamites.indexOf(projectile),1);}
  });
  return {controller,counts:()=>({bossFrames,flameFrames,hudUpdates,projectileFrames,explosions})};
}

test('peaceful exploration advances weapon cooldowns and held tools without updating enemies',()=>{
  const {controller,counts}=fixture();
  controller.tool='toxin';
  // A paused encounter must keep its target objects and progress intact.
  const enemy={userData:{brainBug:true,actor:{update(){assert.fail('paused enemy updated');}}}};
  controller.bubbles=[enemy];controller.score=57;controller.totalPopped=4;controller.level=3;
  for(let frame=0;frame<3;frame++)controller.update(.1,frame*.1,false);
  for(const key of ['weaponCooldown','taserCooldown','toxinCooldown','dynamiteCooldown'])assert.equal(controller[key],0,key);
  assert.equal(controller.toxinModel.visible,true);
  assert.equal(controller.batModel.visible,false);
  assert.equal(controller.shieldShell.visible,false);
  assert.equal(counts().bossFrames,0);
  assert.equal(counts().flameFrames,3);
  assert.equal(controller.bubbles[0],enemy);
  assert.equal(controller.score,57);assert.equal(controller.totalPopped,4);assert.equal(controller.level,3);
});

test('peaceful exploration lets thrown dynamite travel, finish its fuse, and expire shot visuals',()=>{
  const {controller,counts}=fixture();
  const dynamite={position:{x:0},rotation:{x:0,z:0},userData:{age:0,velocity:{x:2,y:1},landed:false}};
  const laser=Object.assign(visual(),{userData:{age:0,lifetime:.15}});
  controller.dynamites.push(dynamite);controller.lasers.push(laser);
  for(let frame=0;frame<3;frame++)controller.update(.1,frame*.1,false);
  assert.ok(dynamite.position.x>.5,'the projectile keeps moving while enemies are paused');
  assert.equal(counts().projectileFrames,3);
  assert.equal(counts().explosions,1);
  assert.equal(controller.dynamites.length,0);
  assert.equal(controller.lasers.length,0);
  assert.equal(laser.removed,true);assert.equal(laser.material.disposed,true);assert.equal(laser.geometry.disposed,true);
});

test('peaceful exploration lets temporary utility markers fade and disappear',()=>{
  const {controller}=fixture();
  const marker=visual();marker.rotation.y=0;
  controller.utilityEffects.push({root:marker,age:0,seconds:.15});
  controller.update(.1,0,false);
  assert.ok(marker.material.opacity<.8);
  controller.update(.1,.1,false);
  assert.equal(controller.utilityEffects.length,0);
  assert.equal(marker.removed,true);assert.equal(marker.material.disposed,true);assert.equal(marker.geometry.disposed,true);
});

test('combat updates remain enabled by default and can resume without resetting encounter progress',()=>{
  const {controller,counts}=fixture();
  controller.score=57;controller.totalPopped=4;
  controller.update(.05,0,false);
  controller.update(.05,.05);
  controller.update(.05,.1,true);
  assert.equal(counts().bossFrames,2);
  assert.equal(counts().hudUpdates,2);
  assert.equal(controller.score,57);assert.equal(controller.totalPopped,4);
});

test('peaceful tools keep solid surfaces and props targetable while excluding paused enemies and boss',()=>{
  const {controller}=fixture();
  const root=()=>({userData:{},parent:null});
  const bubble=root(),boss=root(),wall=root(),brick=root(),loot=root(),avatar=root();
  controller.combatEnabled=false;controller.bubbles=[bubble];controller.endBoss.root=boss;
  controller.bricks=[brick];controller.lootBlocks=[loot];controller.drawingStrokes=[];
  controller.avatarTargets=()=>[avatar];controller.environmentSurfaces=()=>[wall];controller.loader={collisionMeshes:[]};
  const paused=controller.flameColliders().map(item=>item.root);
  for(const object of [wall,brick,loot,avatar])assert.ok(paused.includes(object));
  assert.ok(!paused.includes(bubble));assert.ok(!paused.includes(boss));
  controller.combatEnabled=true;
  const resumed=controller.flameColliders().map(item=>item.root);
  assert.ok(resumed.includes(bubble));assert.ok(resumed.includes(boss));
});

test('paused invisible enemies cannot be selected or damaged by lingering flame hits',()=>{
  const {controller}=fixture();
  const bubble={userData:{health:70}},boss={userData:{health:80}},prop={userData:{health:40}};
  controller.combatEnabled=false;controller.bubbles=[bubble];controller.endBoss.root=boss;
  controller.raycaster={setFromCamera(){assert.fail('paused enemies should not be raycast');}};
  controller.damageTarget=()=>assert.fail('paused bubble damaged');controller.endBoss.takeDamage=()=>assert.fail('paused boss damaged');
  assert.equal(controller.targetAt({}),null);assert.equal(controller.beeAt({}),null);
  controller.damageFlameTarget(bubble,10);controller.damageFlameTarget(boss,10);
  assert.equal(bubble.userData.health,70);assert.equal(boss.userData.health,80);
  controller.bricks=[];controller.lootBlocks=[];controller.avatarTargets=()=>[];
  controller.damageFlameTarget(prop,10);
  assert.equal(prop.userData.health,30,'normal tool interaction remains available');
});
