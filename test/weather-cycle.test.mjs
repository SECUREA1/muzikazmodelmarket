import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {WEATHER_MODES,simulatedWeather} from '../public/js/weather-cycle.js';
import {createOutdoorScenery} from '../public/js/environments/outdoor-scenery.js';

test('fallback visits every weather type without repeating adjacent conditions',()=>{
 const seen=new Set();let previous;
 for(let i=0;i<30;i++){
  const weather=simulatedWeather('clear',i*180000);assert.notEqual(weather,previous);seen.add(weather);previous=weather;
 }
 assert.deepEqual([...seen].sort(),Object.keys(WEATHER_MODES).sort());
 assert.equal(simulatedWeather('snow',179999),'snow');
});

test('weather transitions reuse scenery, preserve gameplay geometry, and local forecasts take priority',()=>{
 let time=0;const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 const scenery=createOutdoorScenery({scene,now:()=>time});scenery.setEnvironment({id:'public-commons'});
 const sky=scene.getObjectByName('WEATHER_SKY_SPHERE'),geometry=sky.geometry,count=scene.children.length;
 time=180000;scenery.update(10,camera);assert.equal(scenery.weather,'overcast');
 assert.ok(sky.material.uniforms.cloudCover.value>.3&&sky.material.uniforms.cloudCover.value<.78);
 scenery.setLocalWeather('snow');time=720000;scenery.update(20,camera);
 assert.equal(scenery.weather,'snow');assert.equal(sky.material.uniforms.snow.value,1);
 scenery.setLocalWeather(null);assert.equal(scenery.weather,'sleet');
 assert.equal(sky.geometry,geometry);assert.equal(scene.children.length,count);
 scenery.setEnvironment({indoor:true});time+=180000;scenery.update(30,camera);assert.equal(scenery.profile,null);
 scenery.dispose();
});

test('storm effects respect reduced motion and thunder fires once per distant strike',()=>{
 let thunder=0;const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 const scenery=createOutdoorScenery({scene,onThunder:()=>thunder++});scenery.setEnvironment({id:'coast',weather:'storm'});
 const u=scene.getObjectByName('WEATHER_SKY_SPHERE').material.uniforms;
 scenery.update(0,camera);assert.equal(u.lightning.value,0);assert.equal(thunder,0);
 scenery.update(2.2,camera);assert.ok(u.lightning.value>.9);
 scenery.update(3.2,camera);scenery.update(3.3,camera);assert.equal(thunder,1);
 scenery.setEnvironment({indoor:true});scenery.update(30.2,camera);assert.equal(thunder,1);scenery.dispose();
});
