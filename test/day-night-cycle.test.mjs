import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {getDayNightState} from '../public/js/day-night-cycle.js';
import {createDayNightLighting} from '../public/js/environments/day-night-lighting.js';

const localTime = (hour, minute = 0, second = 0) => new Date(2026, 9, 28, hour, minute, second);

test('local-clock gameplay boundaries agree with sunrise, sunset and transition phases', () => {
  for (const [hour, minute, phase, isDay] of [
    [0,0,'night',false], [5,59,'dawn',false], [6,0,'dawn',true],
    [7,0,'day',true], [12,0,'day',true], [17,59,'dusk',true],
    [18,0,'dusk',false], [19,0,'night',false], [23,59,'night',false]
  ]) {
    const state = getDayNightState(localTime(hour, minute));
    assert.equal(state.phase, phase);
    assert.equal(state.isDay, isDay);
    assert.equal(state.isNight, !isDay);
  }
});

test('celestial paths are normalized and opposite with continuous midnight and twilight shading', () => {
  for (let hour = 0; hour < 24; hour++) {
    const state = getDayNightState(localTime(hour, 30));
    assert.ok(Math.abs(Math.hypot(...Object.values(state.sunDirection)) - 1) < 1e-10);
    for (const axis of ['x','y','z']) assert.equal(state.sunDirection[axis], -state.moonDirection[axis]);
    for (const key of ['daylight','night','twilight','sunVisibility','moonVisibility']) assert.ok(state[key] >= 0 && state[key] <= 1, key);
  }
  assert.equal(getDayNightState(localTime(12)).daylight, 1);
  assert.equal(getDayNightState(localTime(0)).daylight, 0);
  for (const hour of [0,6,18]) {
    const before = getDayNightState(localTime(hour, 0, -1));
    const after = getDayNightState(localTime(hour, 0, 1));
    assert.ok(Math.abs(before.daylight - after.daylight) < .001);
  }
});

function lightingFixture(t) {
  const scene = new THREE.Scene(), hemi = new THREE.HemisphereLight(0xe6f7ff,0x26321b,1.75);
  const fill = new THREE.DirectionalLight(0xbfe7ff,.8), sun = new THREE.DirectionalLight(0xfff4dc,2.45);
  sun.position.set(12,18,8); scene.add(hemi,fill,sun);
  const material = new THREE.MeshStandardMaterial({envMapIntensity:.7});
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(),material); scene.add(mesh);
  let date = localTime(12), changes = 0;
  const lighting = createDayNightLighting({scene,hemi,fill,sun,now:()=>date,onChange:()=>changes++});
  t.after(()=>{lighting.dispose();mesh.geometry.dispose();material.dispose();});
  return {scene,hemi,fill,sun,material,lighting,setDate:value=>{date=value;},changes:()=>changes};
}

test('wall-clock jumps immediately switch gameplay lighting and shadows follow distant players', t => {
  const f = lightingFixture(t), anchor = new THREE.Vector3(1200,8,-600);
  f.lighting.setEnvironment({id:'public-commons'});
  f.lighting.update(anchor);
  assert.equal(f.lighting.state.lightSource,'sun');
  const dayIntensity = f.sun.intensity;
  assert.deepEqual(f.sun.target.position,anchor);
  assert.ok(f.sun.position.y > anchor.y);
  const changes = f.changes();
  f.lighting.update(anchor.clone().addScalar(2));
  assert.equal(f.changes(),changes,'movement follows each frame without resampling materials or clock state');
  f.setDate(localTime(0)); f.lighting.update(anchor);
  assert.equal(f.scene.userData.dayNight.isNight,true);
  assert.equal(f.lighting.state.lightSource,'moon');
  assert.ok(f.sun.intensity > 0 && f.sun.intensity < dayIntensity);
  assert.ok(f.material.envMapIntensity < .7,'PBR reflections must darken with the world');
  f.setDate(localTime(12)); f.lighting.update(anchor);
  assert.equal(f.sun.intensity,dayIntensity,'clock changes backwards work without waiting for elapsed time');
});

test('outdoor-to-indoor travel restores authored lighting and reflections at midnight', t => {
  const f = lightingFixture(t);
  f.setDate(localTime(0));
  f.lighting.setEnvironment({id:'coast',weather:'storm'}); f.lighting.update(new THREE.Vector3(80,3,40));
  f.lighting.setEnvironment({id:'casino',builderScene:{layout:'casino'}});
  assert.equal(f.lighting.state.outdoors,false);
  assert.equal(f.lighting.state.isNight,true);
  assert.equal(f.lighting.state.lightSource,'indoor');
  assert.equal(f.hemi.intensity,1.75); assert.equal(f.fill.intensity,.8); assert.equal(f.sun.intensity,2.45);
  assert.equal(f.material.envMapIntensity,.7);
  assert.deepEqual(f.sun.position,new THREE.Vector3(12,18,8));
  assert.deepEqual(f.sun.target.position,new THREE.Vector3());
});
