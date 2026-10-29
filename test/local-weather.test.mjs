import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherType,createLocalWeather} from '../public/js/local-weather.js';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createOutdoorScenery} from '../public/js/environments/outdoor-scenery.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('forecast weather codes cover rain, snow, storms and clouds',()=>{
 for(const [code,type] of [[0,'clear'],[1,'clear'],[3,'overcast'],[45,'overcast'],[67,'rain'],[86,'snow'],[99,'storm']])assert.equal(weatherType(code),type);
 assert.throws(()=>weatherType(null));assert.throws(()=>weatherType(900));
});
test('location is opt in, forecasts refresh locally and stopping clears weather',async()=>{
 let calls=0;const states=[];
 const service=createLocalWeather({now:()=>1000000,geolocation:{getCurrentPosition(resolve){calls++;resolve({coords:{latitude:12.345,longitude:45.678}});}},fetchWeather:async url=>{assert.equal(url.searchParams.get('latitude'),'12.35');return {ok:true,json:async()=>({current:{time:1000,weather_code:95}})};},onChange:s=>states.push(s)});
 assert.equal(calls,0);service.start();await flush();assert.equal(states.at(-1).weather,'storm');service.stop();assert.equal(states.at(-1).weather,null);
});
test('permission denial falls back and late responses cannot reenable weather',async()=>{
 const states=[];let resolveLocation;
 const service=createLocalWeather({geolocation:{getCurrentPosition(resolve){resolveLocation=resolve;}},fetchWeather:()=>{throw Error('Must not fetch after stop');},onChange:s=>states.push(s)});
 service.start();service.stop();resolveLocation({coords:{latitude:1,longitude:1}});await flush();assert.equal(states.at(-1).status,'off');
 const denied=createLocalWeather({geolocation:{getCurrentPosition(resolve,reject){reject(Error('Denied'));}},onChange:s=>states.push(s)});
 denied.start();await flush();assert.equal(states.at(-1).status,'unavailable');denied.dispose();
});
test('weather refreshes every ten minutes using the latest location and forecast',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let calls=0;const states=[];
 const service=createLocalWeather({now:()=>1000000,geolocation:{getCurrentPosition(resolve){calls++;resolve({coords:{latitude:calls,longitude:2}});}},fetchWeather:async url=>({ok:true,json:async()=>({current:{time:1000,weather_code:url.searchParams.get('latitude')==='1.00'?0:61}})}),onChange:s=>states.push(s)});
 t.after(()=>service.dispose());
 service.start();await flush();assert.equal(states.at(-1).weather,'clear');
 t.mock.timers.tick(599999);await flush();assert.equal(calls,1);
 t.mock.timers.tick(1);await flush();assert.equal(calls,2);assert.equal(states.at(-1).weather,'rain');
 service.stop();t.mock.timers.tick(600000);await flush();assert.equal(calls,2);
});
test('a cancelled request cannot abort a new sync when its deadline expires',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const requests=[],states=[];
 const service=createLocalWeather({now:()=>1000000,geolocation:{getCurrentPosition(resolve){resolve({coords:{latitude:1,longitude:2}});}},fetchWeather:async(_url,{signal})=>new Promise(resolve=>requests.push({signal,resolve})),onChange:s=>states.push(s)});
 t.after(()=>service.dispose());
 service.start();await flush();t.mock.timers.tick(1000);service.stop();service.start();await flush();
 assert.equal(requests[0].signal.aborted,true);
 t.mock.timers.tick(14000);assert.equal(requests[1].signal.aborted,false);
 requests[0].resolve({ok:true,json:async()=>({current:{time:1000,weather_code:0}})});
 requests[1].resolve({ok:true,json:async()=>({current:{time:1000,weather_code:73}})});
 await flush();assert.equal(states.at(-1).weather,'snow');
});
test('invalid, stale and failed forecasts restore map weather',async()=>{
 const responses=[{ok:false},{ok:true,json:async()=>null},...[
  {time:null,weather_code:0},{time:-1000,weather_code:61},{time:1000,weather_code:999}
 ].map(current=>({ok:true,json:async()=>({current})}))];
 for(const response of responses){
  const states=[],service=createLocalWeather({now:()=>1000000,geolocation:{getCurrentPosition(resolve){resolve({coords:{latitude:1,longitude:2}});}},fetchWeather:async()=>response,onChange:s=>states.push(s)});
  try{service.start();await flush();assert.deepEqual(states.at(-1),{status:'unavailable',weather:null});}finally{service.dispose();}
 }
});
test('local weather survives map changes, restores defaults and respects indoor maps',()=>{
 const scene=new THREE.Scene(),scenery=createOutdoorScenery({scene});
 scenery.setLocalWeather('snow');scenery.setEnvironment({id:'forest'});
 let sky=scene.getObjectByName('WEATHER_SKY_SPHERE');assert.equal(sky.material.uniforms.snow.value,1);
 scenery.setLocalWeather('storm');assert.equal(sky.material.uniforms.snow.value,0);assert.equal(sky.material.uniforms.rain.value,1);
 scenery.setEnvironment({id:'desert'});sky=scene.getObjectByName('WEATHER_SKY_SPHERE');assert.equal(sky.material.uniforms.rain.value,1);
 scenery.setLocalWeather(null);assert.equal(sky.material.uniforms.rain.value,0);
 scenery.setEnvironment({indoor:true});scenery.setLocalWeather('rain');assert.equal(scene.getObjectByName('WEATHER_SKY_SPHERE'),undefined);scenery.dispose();
});
