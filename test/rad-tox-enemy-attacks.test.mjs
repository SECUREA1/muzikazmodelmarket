import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';

// Use the shipped browser enemy and Three geometry. Only texture loading is
// substituted because this test does not have a browser image element.
const vendor=new URL('../public/vendor/three/three.module.min.js',import.meta.url).href;
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const three=moduleUrl(`import * as THREE from '${vendor}';export * from '${vendor}';export class TextureLoader{load(){return new THREE.Texture();}}`);
const effect=moduleUrl((await readFile(new URL('../public/js/effects/animated-svg-effect.js',import.meta.url),'utf8')).replace('https://cdn.jsdelivr.net/npm/three@0.160.0/+esm',three));
const source=(await readFile(new URL('../public/js/enemies/neon-brain-bug.js',import.meta.url),'utf8')).replace('https://cdn.jsdelivr.net/npm/three@0.160.0/+esm',three).replace('../effects/animated-svg-effect.js',effect);
const {NeonBrainBug}=await import(moduleUrl(source));

test('local brain bugs pursue, show an attack tell and spray without a server update',()=>{
 const sprays=[],bug=new NeonBrainBug({position:new THREE.Vector3(0,.5,0),onSpray:(origin,target)=>sprays.push({origin,target})});
 const player=new THREE.Vector3(0,.5,5);
 try{
  bug.update(.1,100,player);assert.ok(bug.root.position.z>0,'the local update pursues the player');assert.equal(sprays.length,0);
  bug.update(.1,101.1,player);assert.equal(bug.attackTell.active,true);assert.equal(sprays.length,0);
  bug.update(.1,101.5,player);assert.equal(sprays.length,1);assert.equal(bug.attackTell.active,false);assert.equal(bug.attackFlash.active,true);
  assert.deepEqual(sprays[0].target.toArray(),player.toArray());assert.ok(sprays[0].origin.distanceTo(bug.root.position)<.2);
  bug.update(.1,101.6,player);assert.equal(sprays.length,1,'the browser attack cooldown prevents duplicate hits');
 }finally{bug.dispose();}
});

test('local brain bugs retreat at close range, then resume their attack cycle',()=>{
 const sprays=[],bug=new NeonBrainBug({position:new THREE.Vector3(0,.5,0),onSpray:()=>sprays.push(true)}),player=new THREE.Vector3(0,.5,1);
 try{
  bug.update(.1,100,player);assert.ok(bug.root.position.z<0,'close-range enemies retreat instead of overlapping the player');
  bug.update(.1,101.5,player);assert.equal(sprays.length,1);
  const before=bug.root.position.z;bug.update(.1,101.6,player);assert.ok(bug.root.position.z<before,'the firing enemy retreats locally');
  bug.update(.1,103.1,player);assert.equal(sprays.length,2,'the next local attack does not depend on network frames');
 }finally{bug.dispose();}
});

test('local brain bugs stop attack tells and do not spray at distant players',()=>{
 const sprays=[],bug=new NeonBrainBug({position:new THREE.Vector3(0,.5,0),onSpray:()=>sprays.push(true)}),player=new THREE.Vector3(0,.5,5);
 try{
  bug.update(.1,100,player);bug.update(.1,101.1,player);assert.equal(bug.attackTell.active,true);
  player.z=30;bug.update(.1,101.6,player);assert.equal(bug.attackTell.active,false);assert.equal(sprays.length,0);
  for(let frame=0;frame<10;frame++)bug.update(.1,102+frame,player);assert.equal(sprays.length,0);
 }finally{bug.dispose();}
});
