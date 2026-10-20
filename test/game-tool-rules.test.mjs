import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import { TOOL_IDS,validTool,canActivateTool } from '../public/js/game-tool-rules.js';
import { RANGED_WEAPONS,fireWeapon } from '../public/js/game-weapons.js';
import { UtilityKit } from '../public/js/game-utilities.js';
import { readFileSync } from 'node:fs';

test('every tool is explicitly recognized; menus and inactive rounds reject activation',()=>{
 assert.equal(new Set(TOOL_IDS).size,TOOL_IDS.length);
 for(const id of TOOL_IDS)assert.equal(validTool(id),true);
 assert.equal(validTool('unknown'),false);assert.equal(validTool('scatter-blaster'),true);
 assert.equal(canActivateTool('active',false,false),true);
 assert.equal(canActivateTool('standby',true,false),true);
 assert.equal(canActivateTool('standby',false,false),false);
 assert.equal(canActivateTool('active',true,true),false);
});

test('original ranged weapons now apply their configured damage, range and cooldown',()=>{
 for(const id of ['laser','pulse-rifle','rail-cannon']){
  const profile=RANGED_WEAPONS[id],root={};let total=0;
  const result=fireWeapon(THREE,id,{origin:new THREE.Vector3(),direction:new THREE.Vector3(0,0,-1),
   raycast:(start,end)=>{assert.ok(Math.abs(start.distanceTo(end)-profile.range)<1e-8);return {target:{root},point:end};},
   damage:(_,amount)=>total+=amount,feedback:()=>{}});
  assert.equal(total,profile.damage*profile.pellets);assert.equal(result.cooldown,profile.interval);
 }
});

test('full health and full supplies do not spend a kit; partial healing reports actual amount',()=>{
 const kit=new UtilityKit();let healed=0;
 assert.equal(kit.use('medkit',{health:100,maxHealth:100},0).ok,false);
 const result=kit.use('medkit',{health:90,maxHealth:100,heal:value=>healed=value},0);
 assert.equal(healed,10);assert.ok(result.message.includes('10 health'));
 assert.equal(kit.use('supply-kit',{paintFuel:80,maxPaintFuel:80,igniterFuel:100,maxIgniterFuel:100},0).ok,false);
 assert.equal(kit.used.get('supply-kit'),undefined);
});

test('jetpack avoids firing fallback, utility targeting is occluded, and resets clear combat',()=>{
 const source=readFileSync('public/js/house-explorer-glb.js','utf8');
 assert.ok(source.includes("if(this.tool==='jetpack'){this.setState"));
 assert.ok(source.includes('const target=hit&&hit.distance<=8&&this.bricks.includes(hit.target.root)'));
 assert.match(source,/resetRun\(\)\{[^}]*this\.clearCombatEffects\(\)/);
 assert.ok(source.includes('if(message)setStatus(message)'));
 const flameDamage=source.slice(source.indexOf('    damageFlameTarget('),source.indexOf('    damageTarget('));
 assert.ok(!flameDamage.includes('gameplayHit'));
});
