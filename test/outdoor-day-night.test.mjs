import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createOutdoorScenery} from '../public/js/environments/outdoor-scenery.js';

const noon={daylight:1,twilight:0,night:0,sunVisibility:1,moonVisibility:0,sunDirection:{x:0,y:1,z:0},moonDirection:{x:0,y:-1,z:0}};
const midnight={daylight:0,twilight:0,night:1,sunVisibility:0,moonVisibility:1,sunDirection:{x:0,y:-1,z:0},moonDirection:{x:0,y:1,z:0}};
const brightness=color=>color.r+color.g+color.b;
function setup(){const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x050807,36,180);return {scene,scenery:createOutdoorScenery({scene}),camera:new THREE.PerspectiveCamera()};}

test('outdoor skies, fog and distant ground darken with the clock and use matching celestial directions',()=>{
 const {scene,scenery,camera}=setup();scenery.setEnvironment({id:'public-commons'},noon);
 const sky=scene.getObjectByName('WEATHER_SKY_SPHERE'),ground=scene.getObjectByName('DISTANT_GROUND_SURROUND');
 const daySky=brightness(scene.background),dayGround=brightness(ground.material.color);
 scenery.update(0,camera,midnight);
 assert.ok(brightness(scene.background)<daySky*.15);
 assert.ok(brightness(ground.material.color)<dayGround*.15);
 assert.ok(scene.fog.color.equals(scene.background));
 assert.equal(sky.material.uniforms.sunVisibility.value,0);assert.equal(sky.material.uniforms.moonVisibility.value,1);
 assert.deepEqual(sky.material.uniforms.moonDirection.value.toArray(),[0,1,0]);
 assert.equal(sky.material.uniforms.night.value,1);
 scenery.update(0,camera,noon);
 assert.ok(Math.abs(brightness(scene.background)-daySky)<1e-10);
 scenery.dispose();
});

test('clock state applies immediately during weather changes and indoor maps clear the sky',()=>{
 const {scene,scenery,camera}=setup();scenery.setEnvironment({id:'stormy-coast',weather:'storm'},midnight);
 const sky=scene.getObjectByName('WEATHER_SKY_SPHERE');
 assert.equal(sky.material.uniforms.night.value,1);assert.equal(sky.material.uniforms.rain.value,1);
 scenery.update(0,camera,{...noon,daylight:.35,twilight:1});
 const dusk=scene.background.clone();scenery.update(0,camera,noon);assert.ok(!dusk.equals(scene.background));
 scenery.setEnvironment({id:'interior',indoor:true},midnight);
 assert.equal(scenery.profile,null);assert.equal(scene.getObjectByName('WEATHER_SKY_SPHERE'),undefined);
 scenery.update(0,camera,noon);assert.equal(scene.background.getHex(),0x050807);
 scenery.dispose();assert.equal(scene.getObjectByName('OUTDOOR_SKY_AND_HORIZON'),undefined);
});

test('legacy calls keep a daytime sky while reduced motion leaves the clock state active',()=>{
 const {scene,scenery,camera}=setup();scenery.setEnvironment({id:'desert'});scenery.update(0,camera);
 const sky=scene.getObjectByName('WEATHER_SKY_SPHERE');assert.equal(sky.material.uniforms.daylight.value,1);
 camera.position.set(20,2,-10);scenery.update(0,camera,midnight);
 assert.deepEqual(sky.position.toArray(),[20,2,-10]);assert.equal(sky.material.uniforms.time.value,0);assert.equal(sky.material.uniforms.night.value,1);
 scenery.dispose();
});
