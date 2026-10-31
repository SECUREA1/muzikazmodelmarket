import test from 'node:test';
import assert from 'node:assert/strict';
import {heldForgeEquipment,activateForgeGuard} from '../public/js/forge-equipment.js';
import {damagePlayer} from '../rpg-match.mjs';
import {forgeEquipmentCommand} from '../server-forge-equipment.mjs';

test('held forge equipment uses canonical model profiles and rejects false holder or inactive props',()=>{
 const player={actorId:'smith',heldId:'blade'},actors={blade:{id:'blade',holderId:'smith',modelId:'forge-damascus-blade',active:true,health:100,functionalSettings:{damage:9999,range:900}}};
 assert.deepEqual(heldForgeEquipment(actors,player),{kind:'melee',label:'Stormfold Damascus Blade',damage:38,range:3,cooldownMs:550,actorId:'blade',buildAssetId:'forge-damascus-blade'});
 actors.blade.holderId='someone-else';assert.equal(heldForgeEquipment(actors,player),null);actors.blade.holderId='smith';actors.blade.active=false;assert.equal(heldForgeEquipment(actors,player),null);
 actors.blade.active=true;actors.blade.modelId='material:cube';actors.blade.functionalSettings.forgeProduct='forge-warhammer';assert.equal(heldForgeEquipment(actors,player),null);
});

test('a canonical held shield blocks hits during its guard, needs recovery and loses protection immediately on release',()=>{
 const player={actorId:'smith',heldId:'shield',health:100},actors={shield:{id:'shield',holderId:'smith',modelId:'forge-aegis-shield',health:100}};
 const guard=activateForgeGuard(actors,player,1000);assert.equal(guard.guardUntil,1900);assert.equal(guard.readyAt,2500);
 assert.equal(damagePlayer(player,1500),false);assert.equal(player.health,100);assert.throws(()=>activateForgeGuard(actors,player,1800),/recover/);
 assert.equal(damagePlayer(player,2000),true);const damaged=player.health;
 activateForgeGuard(actors,player,2500);player.heldId=null;assert.equal(damagePlayer(player,2600),true);assert.ok(player.health<damaged);
 assert.throws(()=>activateForgeGuard(actors,player,5000),/Hold an Aegis/);
});

function arena(modelId='forge-damascus-blade'){
 const player={actorId:'smith',heldId:'equipment',health:100,position:{x:0,y:0,z:0},lastSeen:1000},enemy={id:'enemy',health:100,active:true,position:{x:0,y:0,z:-2},definition:{gameplay:{behavior:'hostile'}}};
 const sim={players:{smith:player},actors:{equipment:{id:'equipment',holderId:'smith',modelId,active:true,health:100},enemy},events:[]};
 const environment={id:'arena',builderScene:{gameplay:{friendlyFire:true}}},collision={blocksShot:()=>false,destructibleHit:()=>null};
 const send=(now=1000,fields={})=>forgeEquipmentCommand(sim,player,environment,{action:'forge-use',direction:[0,0,-1],damage:9999,range:9999,equipmentId:'forge-warhammer',...fields},now,{collision});
 return {sim,player,enemy,environment,collision,send};
}

test('forged melee uses canonical close range damage, cooldowns and wall checks independent of client stats',()=>{
 const f=arena(),hit=f.send();assert.equal(hit.damage,38);assert.equal(f.enemy.health,62);assert.equal(hit.equipmentId,'forge-damascus-blade');
 assert.throws(()=>f.send(1100),/recover/);f.collision.blocksShot=()=>true;assert.equal(f.send(1600).hitId,null);assert.equal(f.enemy.health,62);
 f.collision.blocksShot=()=>false;f.enemy.position.z=-8;assert.equal(f.send(2200).hitId,null);assert.equal(f.enemy.health,62);
 f.enemy.position.z=-2;f.sim.actors.equipment.holderId='someone-else';assert.throws(()=>f.send(2800),/Pick up/);
});

test('forged weapon strikes ignore friendly forge characters and apply PvP hit capacity and shield rules',()=>{
 const f=arena();f.enemy.resident={forge:true};assert.equal(f.send().hitId,null);assert.equal(f.enemy.health,100);
 const rival={actorId:'rival',health:100,position:{x:0,y:0,z:-2},lastSeen:2000};f.sim.players.rival=rival;
 const accepted=f.send(2000);assert.equal(accepted.hitId,'rival');assert.equal(rival.combat.hitsTaken,1);assert.ok(accepted.damage<3);
 rival.heldId='shield';f.sim.actors.shield={id:'shield',holderId:'rival',modelId:'forge-aegis-shield',active:true,health:100};activateForgeGuard(f.sim.actors,rival,2600);
 assert.equal(f.send(2700).damage,0);assert.equal(rival.combat.hitsTaken,1);
 f.environment.builderScene.gameplay.friendlyFire=false;assert.equal(f.send(3300).hitId,null);assert.equal(rival.combat.hitsTaken,1);
});

test('forged melee defeats hostile targets and leaves existing score, loot and quest restrictions intact',()=>{
 const f=arena('forge-warhammer');f.enemy.questOwner='other';f.enemy.questRole='hostile';f.enemy.questInstance='other-quest';assert.equal(f.send().hitId,null);
 delete f.enemy.questOwner;delete f.enemy.questRole;f.enemy.health=50;const defeat=f.send(2000);assert.equal(defeat.damage,50);assert.equal(defeat.defeated,true);assert.equal(f.enemy.active,false);assert.equal(f.player.combat.enemyKills,1);assert.equal(f.player.progress.defeat,1);assert.ok(Object.values(f.sim.actors).some(actor=>actor.loot));
 assert.throws(()=>f.send(3000,{direction:[NaN,0,-1]}),/valid melee aim/);
});
