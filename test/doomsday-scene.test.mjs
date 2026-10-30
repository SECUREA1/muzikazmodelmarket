import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createDoomsdayScene} from '../public/js/doomsday-scene.js';

const environment={id:'test-sky'},position={x:0,y:0,z:0};
const state=(phase,phaseElapsedMs=0)=>({id:'test-event',phase,phaseElapsedMs,objectives:[]});

test('detonation expands distant fireballs and shockwaves then changes the sky and starts falling ash',()=>{
 const scene=new THREE.Scene();scene.background=new THREE.Color('#124567');scene.fog=new THREE.Fog('#224466',20,160);
 const effects=createDoomsdayScene({scene,performanceMode:true}),original=scene.background.getHex(),fog=scene.fog.color.getHex();
 effects.update(state('warning'),environment,position,0);const warning=effects.root.userData.skyColor;
 const sky=effects.root.getObjectByName('DOOMSDAY_COLOURED_SKY');assert.ok(sky.material.uniforms.opacity.value>.2);
 effects.update(state('detonation',800),environment,position,1);const first=effects.root.getObjectByName('DOOMSDAY_DISTANT_BLAST_1'),ball=first.getObjectByName('GROWING_FIREBALL'),wave=first.getObjectByName('EXPANDING_SHOCKWAVE'),initial=ball.scale.x;
 assert.equal(ball.visible,true);assert.equal(wave.visible,true);
 effects.update(state('detonation',2500),environment,position,2);assert.ok(ball.scale.x>initial);assert.ok(wave.scale.x>30);assert.notEqual(effects.root.userData.skyColor,warning);
 effects.update(state('fallout'),environment,position,8);const dust=effects.root.getObjectByName('DOOMSDAY_FALLING_ASH');assert.equal(dust.visible,true);const height=dust.geometry.attributes.position.getY(0);
 effects.update(state('fallout'),environment,position,9);assert.notEqual(dust.geometry.attributes.position.getY(0),height);
 assert.equal(scene.background.getHex(),original);assert.equal(scene.fog.color.getHex(),fog,'authored weather stays intact under the effect');
 effects.update(state('all-clear'),environment,position,12);assert.equal(effects.root.visible,false);effects.dispose();assert.equal(scene.children.length,0);
});

test('reduced motion gives a settled cloud and steady ash without expanding blasts or shockwaves',()=>{
 const scene=new THREE.Scene(),effects=createDoomsdayScene({scene,performanceMode:true});
 effects.update(state('detonation',1500),environment,position,1,{reducedMotion:true});
 const blast=effects.root.getObjectByName('DOOMSDAY_DISTANT_BLAST_1');assert.equal(blast.getObjectByName('GROWING_FIREBALL').visible,false);assert.equal(blast.getObjectByName('EXPANDING_SHOCKWAVE').visible,false);assert.equal(blast.getObjectByName('RISING_FALLOUT_CLOUD').visible,true);
 effects.update(state('fallout'),environment,position,2,{reducedMotion:true});const ash=effects.root.getObjectByName('DOOMSDAY_FALLING_ASH'),heights=Array.from(ash.geometry.attributes.position.array);
 effects.update(state('fallout'),environment,position,7,{reducedMotion:true});assert.deepEqual(Array.from(ash.geometry.attributes.position.array),heights);
 effects.reset();assert.equal(effects.root.visible,false);effects.dispose();effects.dispose();
});

test('synchronized presentation time drives progress even when a viewer joins during the explosion',()=>{
 const effects=createDoomsdayScene({scene:new THREE.Scene(),performanceMode:true});
 effects.update({id:'shared',phase:'detonation',phaseStartedAt:100000,presentationTime:103000,phaseElapsedMs:2000,objectives:[]},environment,position,0);
 assert.equal(effects.root.userData.phaseAge,3,'interpolated clock takes precedence over an older snapshot age');assert.ok(effects.root.getObjectByName('DOOMSDAY_DISTANT_BLAST_1').userData.progress>.5);effects.dispose();
});
