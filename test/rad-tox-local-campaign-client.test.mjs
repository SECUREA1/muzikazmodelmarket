import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {healthAfterHit} from '../public/js/rpg-combat-rules.js';
import {RadToxLocalCampaign,radToxWaveSeconds} from '../public/js/rad-tox-local-campaign.js';

const snapshot=(phaseId='wave-1',changes={})=>({serverTime:100000,match:{id:'level-1'},radTox:{combatMode:'local',phaseId,phaseKind:'wave',state:'active',startedAt:100000,endsAt:220000,wave:1,...changes}});

test('shared phase starts local enemies once and clock advances between snapshots',async()=>{
  let now=0,starts=0,stops=0;
  const local=new RadToxLocalCampaign({now:()=>now,start:()=>starts++,stop:()=>stops++});
  await local.sync(snapshot());
  await local.sync(snapshot());
  assert.equal(starts,1);assert.equal(stops,1);assert.equal(local.seconds,120);
  now=3500;assert.equal(local.seconds,117);
  now=120000;assert.equal(local.tick(),false);assert.equal(stops,2);
  local.tick();assert.equal(stops,2);
});

test('stale preparation cannot spawn enemies after the server changes waves or maps',async()=>{
  const waits=[],starts=[];
  const local=new RadToxLocalCampaign({prepare:()=>new Promise(resolve=>waits.push(resolve)),start:campaign=>starts.push(campaign.phaseId)});
  const first=local.sync(snapshot());
  const second=local.sync(snapshot('wave-2',{wave:2}));
  waits[0]();await first;assert.deepEqual(starts,[]);
  waits[1]();await second;assert.deepEqual(starts,['wave-2']);
  const third=local.sync(snapshot('wave-3',{wave:3}));
  local.reset();waits[2]();await third;assert.deepEqual(starts,['wave-2']);
});

test('boss waits for local combat completion rather than a wave timer',async()=>{
  let now=0,starts=0;
  const local=new RadToxLocalCampaign({now:()=>now,start:()=>starts++});
  await local.sync(snapshot('boss',{phaseKind:'boss',wave:5,endsAt:null}));
  now=500000;assert.equal(local.tick(),true);assert.equal(local.seconds,null);assert.equal(starts,1);
  await local.sync(snapshot('boss',{phaseKind:'boss',wave:5,state:'finished',endsAt:null}));
  assert.equal(local.active,false);assert.equal(starts,1);
  assert.equal(radToxWaveSeconds(null,0),null);
});

const game=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const bossReports=[];
const prototype=runInNewContext(game.slice(game.indexOf('  class ToxicBubbleSystem'),game.indexOf('  let viewActive = true'))+'\nToxicBubbleSystem.prototype;',{
  usesLocalRadTox:()=>true,healthAfterHit,
  RAD_TOX_STATES:{ACTIVE:'active',CLEARED:'cleared'},
  BEE_CONFIG:{id:'bee',maxHealth:20},AAPE_BOSS_CONFIG:{id:'aape',maxHealth:20},BEEDUCK_BOSS_CONFIG:{id:'beeduck',maxHealth:20},
  THREE,recordLocalCombat:(stats,status)=>bossReports.push({stats,status}),recordLocalEnemyDamage(){},flushLocalCombat(){},
  AirborneHoneyBee:class {
    constructor(options){this.options=options;this.health=20;}
    async load(){} setSpawnFromGround(){}
    takeDamage(amount){if(this.health===0)return false;this.health=Math.max(0,this.health-amount);if(this.health===0)this.options.onDefeated();return true;}
  }
});

test('clearing local enemies cannot advance the shared wave or map before the server clock',()=>{
  let advanced=0,spawned=0;
  const system={state:'active',health:100,bubbles:[],enemyRepopulations:0,
    setState(state,message){this.state=state;this.message=message;},
    spawnInitial(){spawned++;},advanceLevel(){advanced++;}};
  assert.equal(prototype.completeLevelIfReady.call(system),false);
  assert.equal(spawned,0);assert.equal(advanced,0);assert.equal(system.state,'active');
  assert.match(system.message,/shared timer/);
  system.endBossDefeated=true;prototype.completeLevelIfReady.call(system);
  assert.match(system.message,/other players/);assert.equal(advanced,0);
});

test('local enemy damage respects shields and the full 45 hit player health',()=>{
  const system={health:100,active:true,isShieldActive:()=>false,setState(state){this.state=state;}};
  for(let hit=0;hit<44;hit++)assert.equal(prototype.takeDamage.call(system,8,'enemy attack'),true);
  assert.ok(system.health>0);prototype.takeDamage.call(system,8,'enemy attack');
  assert.equal(system.health,0);assert.equal(system.active,false);
  assert.equal(prototype.takeDamage.call(system,8,'enemy attack'),false);
  system.health=100;system.isShieldActive=()=>true;
  assert.equal(prototype.takeDamage.call(system,8,'enemy attack'),false);assert.equal(system.health,100);
  assert.equal(prototype.bossConfigForLevel.call({level:1}).id,'bee');
  assert.equal(prototype.bossConfigForLevel.call({level:2}).id,'aape');
  assert.equal(prototype.bossConfigForLevel.call({level:4}).id,'beeduck');
});

test('all multiplayer RAD-TOX attacks execute locally while ordinary shared builder firing stays connected',()=>{
  const names=['handlePointerInteraction','handleXRInteraction','fireFlame','fireExtraWeapon','swingBat','fireTaser','fireToxin','throwDynamite','useUtility','sprayAt'];
  const calls=[],network=[];let local=true;
  const system=Object.fromEntries(names.map(name=>[name,()=>{calls.push(name);return true;}]));system.tool='laser';
  const wrapper=game.slice(game.indexOf("  for(const name of ['handlePointerInteraction'"),game.indexOf('  async function createOwnedPreview'));
  runInNewContext(wrapper,{toxicBubbleSystem:system,isBasketballEnvironment:()=>false,activeEnvironment:{},ownedPlacement:{active:false},isExternalView:()=>false,serverHostedRoom:true,usesLocalRadTox:()=>local,camera:{getWorldDirection:()=>({toArray:()=>[0,0,-1]})},THREE:{Vector3:class{}},serverCommand:(...args)=>network.push(args),SPRAY_COLORS:[{hex:0xffffff}]});
  for(const name of names)assert.equal(system[name](),true);
  assert.deepEqual(calls,names);assert.equal(network.length,0);
  local=false;system.handlePointerInteraction();assert.equal(network.length,1);assert.equal(network[0][0],'fire');
});

test('enemy placement yields to rendering and cancels stale wave spawning',async()=>{
  let yielded=0,current=true;
  const source=game.slice(game.indexOf('  async function spawnTimedLocalWave'),game.indexOf('  const localCampaign=new'));
  const spawn=runInNewContext(source+'\nspawnTimedLocalWave;',{
    requestAnimationFrame:callback=>{yielded++;queueMicrotask(callback);},
    TOXIC_BUBBLE_CONFIG:{brainBugsPerWave:2}
  });
  const calls=[],system={baseEnemyTarget:8,snakeCountForLevel:()=>2,
    placeOne:kind=>{calls.push(kind);return true;},spawnSnakes:()=>{calls.push('snake');return 1;},spawnBrainBug:()=>{calls.push('brain');return 1;}};
  assert.equal(await spawn(system,{wave:1},()=>current),true);
  assert.equal(system.levelTarget,12);assert.equal(yielded,12);
  assert.equal(calls.filter(kind=>kind==='ghost').length,4);
  calls.length=0;yielded=0;
  system.placeOne=kind=>{calls.push(kind);if(calls.length===2)current=false;return true;};
  assert.equal(await spawn(system,{wave:2},()=>current),false);
  assert.equal(calls.length,2);assert.equal(yielded,2);
});

test('tournament ranged accuracy counts enemies while building hits cannot earn a streak',()=>{
  let target,landed;
  const method=runInNewContext(`class Weapon {${prototype.fireExtraWeapon.toString()}};Weapon.prototype.fireExtraWeapon;`,{
    canActivateTool:()=>true,rangeActive:false,document:{querySelector:()=>null},usesLocalRadTox:()=>true,
    THREE:{},fireWeapon:(_three,_tool,options)=>{options.damage(target,20);return {cooldown:.2,ammo:9};}
  });
  const brick={parent:{}},enemy={parent:{}},system={tool:'laser',state:'active',ammo:10,weaponCooldown:0,
    flameSystem:{},flameColliders:()=>[],bricks:[brick],bubbles:[enemy],lootBlocks:[],avatarTargets:()=>[],
    damageBrick(){},damageTarget(){},tone(){},registerLaserShot:hit=>{landed=hit;}};
  target=brick;assert.equal(method.call(system,{},{}),true);assert.equal(landed,false);
  target=enemy;assert.equal(method.call(system,{},{}),true);assert.equal(landed,true);
});

test('the authored boss takes twenty local hits and reports one tournament boss defeat',async()=>{
  bossReports.length=0;let completed=0;
  const system={level:1,score:0,state:'active',bossConfigForLevel:prototype.bossConfigForLevel,
    validEnvironment:()=>true,getPlayerPosition:()=>new THREE.Vector3(),environmentSurfaces:()=>[],
    setState(){},completeLevelIfReady(){completed++;}};
  await prototype.spawnEndBoss.call(system);
  for(let hit=0;hit<19;hit++)assert.equal(system.endBoss.takeDamage(100),true);
  assert.equal(system.endBoss.health,1);assert.equal(bossReports.length,0);
  system.endBoss.takeDamage(100);system.endBoss.takeDamage(100);
  assert.equal(system.endBossDefeated,true);assert.equal(completed,1);assert.equal(system.score,10);
  assert.equal(bossReports.length,1);assert.equal(bossReports[0].stats.enemyKills,1);
  assert.equal(bossReports[0].stats.bossKills,1);assert.equal(bossReports[0].stats.score,10);
  assert.equal(bossReports[0].status.bossDefeated,true);
});
