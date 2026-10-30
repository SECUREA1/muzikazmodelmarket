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

test('warning beacons visibly rotate and pulse, with steady reduced-motion lamps',()=>{
 const effects=createDoomsdayScene({scene:new THREE.Scene(),performanceMode:true});
 const sites=[{id:'shelter',phase:'warning',name:'Shelter',position:{x:12,y:2,z:-10}}];
 effects.update({...state('warning'),objectives:sites},environment,position,0);
 const beacon=effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_0'),rotor=beacon.getObjectByName('ROTATING_SIREN_LAMP'),lens=beacon.getObjectByName('PULSING_WARNING_LENS'),angle=rotor.rotation.y,pulse=lens.material.opacity;
 assert.equal(rotor.children.filter(child=>child.name==='REVOLVING_WARNING_BEAM').length,2);
 const siteBeacon=effects.root.getObjectByName('DOOMSDAY_ROTATING_BEACON_2');assert.equal(siteBeacon.visible,true);assert.equal(siteBeacon.position.x,14.5);assert.equal(siteBeacon.position.y,2);
 effects.update({...state('warning',500),objectives:sites},environment,position,.5);assert.notEqual(rotor.rotation.y,angle);assert.notEqual(lens.material.opacity,pulse);
 const arrival=effects.root.getObjectByName('DOOMSDAY_ARRIVAL_WARNING_BEACONS');assert.equal(arrival.position.y,2);effects.update({...state('warning',800),objectives:sites},environment,{x:50,y:30,z:30},.8);assert.equal(arrival.position.x,0,'warning lamps stay grounded at the event arrival, not attached to a moving aircraft');assert.equal(arrival.position.y,2);
 effects.update({...state('warning',1000),objectives:sites},environment,position,1,{reducedMotion:true});const stillAngle=rotor.rotation.y,stillPulse=lens.material.opacity;
 effects.update({...state('warning',9000),objectives:sites},environment,position,9,{reducedMotion:true});assert.equal(rotor.rotation.y,stillAngle);assert.equal(lens.material.opacity,stillPulse);
 effects.dispose();
});

test('clearing fades the sky, clouds, ash and beacons and repeated quiet intervals retain no event props',()=>{
 const scene=new THREE.Scene();scene.background=new THREE.Color('#3388aa');const effects=createDoomsdayScene({scene,performanceMode:true}),original=scene.background.getHex();
 effects.update(state('idle'),environment,position,0);assert.equal(effects.root.visible,false);
 const clearing=age=>({id:'scheduled-1',phase:'clearing',phaseElapsedMs:age,phaseStartedAt:100000,phaseEndsAt:108000,objectives:[]});
 effects.update(clearing(0),environment,position,0);
 const sky=effects.root.getObjectByName('DOOMSDAY_COLOURED_SKY'),ash=effects.root.getObjectByName('DOOMSDAY_FALLING_ASH'),cloud=effects.root.getObjectByName('RISING_FALLOUT_CLOUD'),lamp=effects.root.getObjectByName('PULSING_WARNING_LENS');
 const skyStart=sky.material.uniforms.opacity.value,ashStart=ash.material.opacity,cloudStart=cloud.children[0].material.opacity;
 effects.update(clearing(4000),environment,position,4);assert.equal(effects.root.userData.effectOpacity,.5);assert.ok(sky.material.uniforms.opacity.value<skyStart);assert.ok(ash.material.opacity<ashStart);assert.ok(cloud.children[0].material.opacity<cloudStart);assert.ok(lamp.material.opacity<.6);
 effects.update(clearing(8000),environment,position,8);assert.equal(sky.material.uniforms.opacity.value,0);assert.equal(ash.material.opacity,0);assert.equal(lamp.material.opacity,0);
 effects.update(state('all-clear'),environment,position,9);assert.equal(effects.root.visible,false);assert.equal(scene.background.getHex(),original);
 const count=()=>{let total=0;effects.root.traverse(()=>total++);return total;},before=count();
 for(let index=0;index<20;index++){effects.update({...state('warning'),id:'repeat-'+index},environment,position,index);effects.update({...clearing(8000),id:'repeat-'+index},environment,position,index+1);effects.update(state('all-clear'),environment,position,index+2);}
 assert.equal(count(),before,'beacons and all other persistent effects are pooled across repeats');effects.dispose();
});
