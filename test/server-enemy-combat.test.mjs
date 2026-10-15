import test from 'node:test';
import assert from 'node:assert/strict';
import {stepEnemyCombat} from '../server-enemy-combat.mjs';
import {createSharedEnemyEffects} from '../public/js/shared-enemy-effects.js';
import * as THREE from '../public/vendor/three/three.module.min.js';
function arena(kind='ghost',blocked=false){
 let now=100000;const player={position:{x:0,y:0,z:0},health:100,lastSeen:now};
 const actor={id:'enemy',radTox:true,kind,position:{x:0,y:0,z:kind==='snake'||kind==='toxic'?-.8:-4},health:100,active:true};
 const sim={players:{mobile:player,desktop:{position:{x:20,y:0,z:0},health:100,lastSeen:now}},actors:{enemy:actor},events:[],match:{state:'active'}};
 const tick=(elapsed=100)=>{now+=elapsed;for(const player of Object.values(sim.players))player.lastSeen=now;stepEnemyCombat(sim,{now,dt:elapsed/1000,environment:{},collision:{blocksShot:()=>blocked}});};
 return {sim,player,actor,tick};
}
test('ghost gas, brain spray and boss projectiles attack the same players on the server',()=>{
 for(const kind of ['ghost','brain','boss']){
  const {sim,player,tick}=arena(kind);tick();assert.equal(Object.keys(sim.projectiles).length,1);assert.ok(sim.events.some(event=>event.action==='enemy-attack'&&event.kind===kind));
  for(let i=0;i<9;i++)tick();assert.ok(player.health<100);assert.equal(sim.players.desktop.health,100);assert.equal(player.combat.hitsTaken,1);assert.ok(sim.events.some(event=>event.action==='enemy-hit'));
 }
});
test('projectiles respect walls, can be dodged, and cannot bypass spawn protection',()=>{
 const wall=arena('ghost',true);for(let i=0;i<20;i++)wall.tick();assert.equal(wall.player.health,100);assert.equal(Object.keys(wall.sim.projectiles).length,0);
 const dodge=arena();dodge.tick();dodge.player.position.x=8;for(let i=0;i<10;i++)dodge.tick();assert.equal(dodge.player.health,100);
 const shield=arena();shield.player.spawnProtectedUntil=110000;for(let i=0;i<10;i++)shield.tick();assert.equal(shield.player.health,100);
});
test('snake and toxic contact attacks keep cooldowns and the 45-hit health rule',()=>{
 for(const kind of ['snake','toxic']){const {player,tick}=arena(kind);tick();const first=player.health;tick();assert.equal(player.health,first);for(let i=0;i<44;i++)tick(1201);assert.equal(player.health,0);assert.equal(player.combat.hitsTaken,45);assert.equal(player.combat.deaths,1);}
});
test('shared projectile visuals interpolate and remove expired effects without deciding damage',()=>{
 const scene=new THREE.Scene();let now=0;const effects=createSharedEnemyEffects({THREE,scene,resources:()=>({}),now:()=>now});
 const snapshot={projectiles:{gas:{id:'gas',kind:'ghost',position:{x:0,y:1,z:0},velocity:[0,0,6]}}};effects.sync(snapshot);assert.equal(scene.children.length,1);now=100;effects.update(.1);assert.ok(scene.children[0].position.z>0);effects.sync({projectiles:{}});assert.equal(scene.children.length,0);effects.clear();
});
