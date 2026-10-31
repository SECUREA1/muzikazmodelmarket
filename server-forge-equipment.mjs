import {heldForgeEquipment as equipmentForHeld,activateForgeGuard} from './public/js/forge-equipment.js';
import {damagePlayer,combatStats} from './rpg-match.mjs';
import {rayBoxDistance} from './server-combat-ray.mjs';
import {canEngageQuest} from './server-quest-teams.mjs';
import {dropRpgLoot} from './server-rpg-loot.mjs';

const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
export function heldForgeEquipment(sim,player){
 const profile=equipmentForHeld(sim?.actors,player);return profile?{actor:sim.actors[profile.actorId],profile}:null;
}
function hostile(actor){
 const behavior=actor.definition?.gameplay?.behavior||actor.functionalSettings?.behavior||actor.asset?.behavior;
 return actor.radTox||actor.questRole==='hostile'||['hostile','patrol','enemy'].includes(behavior);
}
function eligible(actor,sim,player){
 if(actor.id===player.heldId||actor.active===false||actor.health<=0||!Number.isFinite(actor.health)||actor.pendingSpawn||actor.loot||actor.resident||actor.forestSnakeManaged||actor.basketballManaged||actor.basketballMatchBall||actor.rangeManaged||actor.rangeTarget)return false;
 if(actor.questOwner&&!canEngageQuest(sim,player.actorId,actor))return false;
 return Boolean(hostile(actor)||actor.destructible===true);
}
/** Uses a server-owned held actor. Client equipment IDs and combat statistics
 * do not participate in profile selection, hit testing or shield timing. */
export function forgeEquipmentCommand(sim,player,environment,command,now,{collision,objects={}}={}){
 if(command.action!=='forge-use')fail('Choose a supported forge equipment action.',422);
 if(!Number.isFinite(now))fail('The forge equipment clock is unavailable.',422);
 if(player.health<=0||player.replacedByRoom||player.vehicleId||player.seatedId)fail('Stand with your forged equipment ready before using it.');
 const held=heldForgeEquipment(sim,player);if(!held)fail('Pick up a forged blade, axe, warhammer or shield before using it.');
 const {profile}=held;
 if(profile.kind==='shield')return activateForgeGuard(sim.actors,player,now);
 if(!collision||typeof collision.blocksShot!=='function')fail('Melee collision checks are unavailable.',503);
 const direction=command.direction;
 if(!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite)||Math.hypot(...direction)<.1)fail('Choose a valid melee aim direction.',422);
 const magnitude=Math.hypot(...direction),ray=direction.map(value=>value/magnitude),origin={...player.position,y:player.position.y+1.5};
 player.toolReady ||= {};const key='forge-melee';if(now<(player.toolReady[key]||0))fail('Let your forged weapon recover before striking again.',429);
 const targets=[];
 for(const actor of Object.values(sim.actors||{})){
  if(!eligible(actor,sim,player)||!actor.position)continue;
  const p=actor.position,along=rayBoxDistance(origin,ray,{x:p.x-.65,y:p.y,z:p.z-.65},{x:p.x+.65,y:p.y+2,z:p.z+.65});
  if(along!==null&&along<=profile.range)targets.push({entity:actor,along});
 }
 const structure=collision.destructibleHit?.(environment,origin,ray,profile.range,sim.actors);
 if(structure&&eligible(structure.entity,sim,player))targets.push(structure);
 if(environment.builderScene?.gameplay?.friendlyFire!==false)for(const [id,target]of Object.entries(sim.players||{})){
  if(id===player.actorId||target.health<=0||target.replacedByRoom||target.radToxReady===false||now-target.lastSeen>15000||target.vehicleId||!target.position)continue;
  const p=target.position,along=rayBoxDistance(origin,ray,{x:p.x-.35,y:p.y,z:p.z-.35},{x:p.x+.35,y:p.y+1.8,z:p.z+.35});
  if(along!==null&&along<=profile.range)targets.push({entity:target,along,playerId:id});
 }
 let hit=targets.sort((a,b)=>a.along-b.along)[0]||null;
 if(hit){const actorView=hit.entity.destructible?{...sim.actors,[hit.entity.id]:{...hit.entity,active:false}}:sim.actors;if(collision.blocksShot(environment,origin,ray,hit.along,actorView,objects))hit=null;}
 player.toolReady[key]=now+profile.cooldownMs;player.lastShot=now;
 const stats=combatStats(player);stats.shots++;
 let damage=0,defeated=false;
 if(hit){
  const before=hit.entity.health;
  if(hit.playerId)damagePlayer(hit.entity,now,player);
  else{hit.entity.health=Math.max(0,before-profile.damage);stats.damageDealt+=before-hit.entity.health;}
  damage=before-hit.entity.health;defeated=before>0&&hit.entity.health===0;
  if(defeated&&!hit.playerId){hit.entity.active=false;if(!hit.entity.destructible){stats.enemyKills++;stats.score+=10;player.score=(player.score||0)+10;dropRpgLoot(sim,hit.entity,now);player.progress ||= {};player.progress.defeat=(player.progress.defeat||0)+1;}}
  stats.hits++;stats[hit.playerId?'playerHits':'enemyHits']++;
 }else stats.misses++;
 const span=hit?.along??profile.range,end={x:origin.x+ray[0]*span,y:origin.y+ray[1]*span,z:origin.z+ray[2]*span};
 return {tool:'forge-equipment',equipmentId:profile.buildAssetId,equipmentActorId:profile.actorId,firedAt:now,readyAt:player.toolReady[key],cooldownMs:profile.cooldownMs,origin,end,direction:ray,hitId:hit?.playerId||hit?.entity.id||null,targetType:hit?.playerId?'player':hit?.entity.destructible?'building':hit?'enemy':null,damage,defeated,message:hit?profile.label+(damage?' hit for '+Math.round(damage)+' damage.':' strike blocked.'):profile.label+' swing. Move closer and face a target.'};
}
