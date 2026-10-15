import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../public/vendor/three/three.module.min.js';
import { EXTRA_WEAPONS, fireWeapon, weaponDirections } from '../public/js/game-weapons.js';

test('new weapons apply distinct damage, ranges and cooldowns; scatter pellets aggregate damage', () => {
  for(const [id,profile] of Object.entries(EXTRA_WEAPONS)){
    const target={},hits=[],beams=[];
    const result=fireWeapon(THREE,id,{origin:new THREE.Vector3(),direction:new THREE.Vector3(0,0,-1),ammo:5,
      raycast:(start,end)=>{assert.ok(Math.abs(end.distanceTo(start)-profile.range)<1e-8);return {target:{root:target},point:end};},
      damage:(root,amount)=>hits.push([root,amount]),feedback:()=>beams.push(true)});
    assert.deepEqual(hits,[[target,profile.damage*profile.pellets]]);
    assert.equal(beams.length,profile.pellets);
    assert.equal(result.cooldown,profile.interval);
    assert.equal(result.ammo,4);
    assert.equal(result.hitAny,true);
  }
});

test('cooldown, empty ammo and zero aim reject firing without damage or feedback', () => {
  for(const options of [{cooldown:.1},{ammo:0},{direction:new THREE.Vector3()}]){
    assert.equal(fireWeapon(THREE,'marksman',{origin:new THREE.Vector3(),direction:new THREE.Vector3(0,0,-1),
      raycast:()=>assert.fail('rejected shot performed a collision check'),feedback:()=>assert.fail('feedback'),damage:()=>assert.fail('damage'),...options}),null);
  }
});

test('misses still render feedback; spread remains valid when aiming straight up', () => {
  let feedback=0;
  const result=fireWeapon(THREE,'scatter-shot',{origin:new THREE.Vector3(),direction:new THREE.Vector3(0,1,0),raycast:()=>null,damage:()=>assert.fail('miss damage'),feedback:()=>feedback++});
  assert.equal(feedback,5);assert.equal(result.hitAny,false);
  const rays=weaponDirections(THREE,new THREE.Vector3(0,1,0),EXTRA_WEAPONS['scatter-shot']);
  assert.ok(rays.every(ray=>Math.abs(ray.length()-1)<1e-8));
  assert.ok(rays[1].distanceTo(rays[2])>.01);
});

test('weapon category opens a native modal and selection equips through the game handler', () => {
  const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
  assert.ok(source.includes("document.createElement('dialog')"));
  assert.ok(source.includes('weaponsPopup.showModal()'));
  assert.ok(source.includes('toxicBubbleSystem.setTool(tool);weaponsPopup.close()'));
  const tools=source.slice(source.indexOf('const sprayTools ='),source.indexOf('const toolsToggle='));
  assert.ok(tools.includes('data-weapons-category'));
  for(const id of ['laser','bat','taser','dynamite'])assert.ok(!tools.includes(`toolButton('${id}'`),id+' must live in the popup');
  assert.ok(source.includes("if(EXTRA_WEAPONS[this.tool])return this.fireExtraWeapon(origin,direction)"));
  assert.ok(source.includes('return toxicBubbleSystem.fireExtraWeapon(rangeRaycaster.ray.origin'));
});
