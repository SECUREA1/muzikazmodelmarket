import {RAD_TOX_WAVE_PAUSE_MS,RAD_TOX_RESULTS_PAUSE_MS,isCleanCommonsEnvironment} from './public/js/rad-tox-rules.js';
import {isCleanSportsEnvironment} from './public/js/sports-worlds.js';
import {ENEMY_BEHAVIORS} from './server-enemy-combat.mjs';
import {damagePlayer,openMatch,finishMatch,healPlayer,matchRows} from './rpg-match.mjs';
export const ROUND_COUNTDOWN_MS=RAD_TOX_RESULTS_PAUSE_MS;
// Shared encounters are owned by the room, never by a client's local enemy list.
export function supportsRadTox(environment) {
 return environment.playable!==false && !isCleanCommonsEnvironment(environment) && !environment.airport?.enabled && !environment.builderScene?.layoutMeta?.harbor && !isCleanSportsEnvironment(environment) && Boolean(environment.builderScene || environment.proceduralLand || environment.modelUrl || environment.modelUrls?.length);
}
export function spawnRadToxWave(sim, now, center) {
 for (const [id,actor] of Object.entries(sim.actors)) if (actor.radTox) delete sim.actors[id];
 sim.projectiles={};
 const campaign=sim.radTox;
 campaign.state='active';campaign.nextWaveAt=null;campaign.transition=null;
 const boss=campaign.wave===4;
 const count=boss?1:Math.min(16,6+campaign.level*2);
 const kinds=['toxic','ghost','snake','brain'];
 for(let index=0;index<count;index++) {
  const kind=boss?'boss':kinds[index%kinds.length];
  const angle=index/count*Math.PI*2;
  const radius=boss?8:5+index%3;
  const position={x:center.x+Math.sin(angle)*radius,y:center.y,z:center.z-Math.cos(angle)*radius};
  const id=`rad-tox-${campaign.level}-${campaign.wave}-${index}`;
  const health=1;
  const definition={objectId:id,position:{...position},movement:{speed:ENEMY_BEHAVIORS[kind].moveSpeed},ai:{detectionRange:40},gameplay:{behavior:'hostile',health,damage:boss?12:kind==='snake'?4:6}};
  sim.actors[id]={id,spawnId:(sim.match?.id||String(now))+':'+id,spawnedAt:now,attackStartedAt:now,radTox:true,kind,position,rotation:{y:0},health,maxHealth:health,active:true,velocity:{x:0,y:0,z:0},definition};
 }
 campaign.targetCount=count;campaign.remaining=count;campaign.startedAt=now;
}
export function startRadTox(sim,environment,now,center) {
 if(environment.airport?.enabled)return false;
 if(!supportsRadTox(environment))return false;
 if(sim.radTox&&!sim.match)openMatch(sim,sim.radTox.level||1,now);
 if(!sim.radTox) {
  sim.radTox={level:1,wave:1,state:'active',remaining:0,targetCount:0};
  openMatch(sim,1,now);
  spawnRadToxWave(sim,now,center);
 }
 return true;
}
export function advanceRadTox(sim,now,environment) {
 if(!sim.radTox)return;
 const campaign=sim.radTox;
 if(sim.match?.state==='finished'){
  campaign.transition ||= {kind:sim.match.outcome==='victory'?'level':'retry',at:sim.match.endedAt+ROUND_COUNTDOWN_MS};
  if(environment&&now>=campaign.transition.at&&Object.values(sim.players).some(player=>player.radToxReady!==false&&player.radToxEnabled!==false&&!player.replacedByRoom&&now-player.lastSeen<15000))nextRadToxLevel(sim,environment,now,sim.match.id);
  return;
 }
 campaign.remaining=Object.values(sim.actors).filter(actor=>actor.radTox&&actor.active&&actor.health>0).length;
 const players=Object.values(sim.players).filter(player=>player.radToxReady!==false&&player.radToxEnabled!==false&&!player.replacedByRoom&&now-player.lastSeen<15000&&player.health>0);
 if(campaign.remaining || !players.length)return;
 if(campaign.wave===4){finishMatch(sim,'victory',now);campaign.transition={kind:'level',at:now+ROUND_COUNTDOWN_MS};return;}
 if(!campaign.nextWaveAt){campaign.state='cleared';campaign.nextWaveAt=now+RAD_TOX_WAVE_PAUSE_MS;campaign.transition={kind:'wave',at:campaign.nextWaveAt,results:matchRows(sim,now)};return;}
 if(now<campaign.nextWaveAt)return;
 campaign.wave++;
 for(const player of players){player.ammo=120;player.fuel=100;healPlayer(player,15);}
 spawnRadToxWave(sim,now,players[0].position);
}

export function nextRadToxLevel(sim,environment,now,expectedMatchId) {
 if(!supportsRadTox(environment)||!sim.match||sim.match.state!=='finished'||sim.match.id!==expectedMatchId)return false;
 if(now<sim.match.endedAt+ROUND_COUNTDOWN_MS)return false;
 if(sim.match.outcome==='victory'&&(sim.radTox.wave!==4||Object.values(sim.actors).some(actor=>actor.radTox&&actor.active&&actor.health>0)))return false;
 const level=sim.match.outcome==='victory'?sim.radTox.level+1:sim.radTox.level;
 const center=Object.values(sim.players).find(player=>player.radToxReady!==false&&player.radToxEnabled!==false&&!player.replacedByRoom&&now-player.lastSeen<15000)?.position||environment.spawn||{x:0,y:0,z:2};
 sim.radTox={level,wave:1,state:'active',remaining:0,targetCount:0};
 openMatch(sim,level,now);spawnRadToxWave(sim,now,center);return true;
}

// Only the server advances attack clocks or applies damage. Clients animate
// these phases and replay the resulting events without running enemy AI.
export function stepRadToxEnemy(sim,actor,players,now,dt,blocksShot=()=>false,resolveMovement=(_previous,next)=>next,applyAttack=true) {
 const rangeTo=player=>Math.hypot(player.position.x-actor.position.x,player.position.z-actor.position.z);
 const nearest=players.reduce((best,player)=>!best||rangeTo(player)<rangeTo(best)?player:best,null);
 const current=players.find(player=>(player.actorId||player.id)===actor.movementTargetId);
 // Keep pursuing the same player until another is substantially closer.
 const target=current&&nearest&&rangeTo(current)<=rangeTo(nearest)*1.25+.5?current:nearest;
 actor.movementTargetId=target?.actorId||target?.id||null;
 if(!target){actor.attack=null;return;}
 const dx=target.position.x-actor.position.x,dz=target.position.z-actor.position.z,span=Math.hypot(dx,dz);
 const config=ENEMY_BEHAVIORS[actor.kind]||ENEMY_BEHAVIORS.toxic;
 const {range,cooldown}=config;
 actor.rotation.y=Math.atan2(dx,dz);
 // Ranged enemies keep circling and retreat after firing instead of freezing
 // as soon as their initial spawn happens to be inside attack range.
 const speed=Math.max(0,Number(actor.radTox ? config.moveSpeed : actor.definition?.movement?.speed ?? config.moveSpeed)||0);
 let mx=0,mz=0;
 if(span>.001){
  const dxn=dx/span,dzn=dz/span,ranged=Boolean(config.speed),previousMode=actor.movementMode;
  if(ranged){
   const afterShot=now-(actor.lastAttack??-Infinity)<900;
   const retreat=span<3||(previousMode==='retreat'&&span<4)||(afterShot&&span<4.6);
   const approach=!retreat&&(span>5.25||(previousMode==='approach'&&span>4.5));
   actor.movementMode=retreat?'retreat':approach?'approach':'orbit';
   if(retreat){mx=-dxn;mz=-dzn;}else if(approach){mx=dxn;mz=dzn;}
   else {const side=actor.id.charCodeAt(actor.id.length-1)%2?1:-1;mx=-dzn*side;mz=dxn*side;}
  }else{
   const hold=span<config.range*.7||(previousMode==='hold'&&span<config.range*.95);
   actor.movementMode=hold?'hold':'approach';if(!hold){mx=dxn;mz=dzn;}
  }
 }
 const duration=Math.max(0,Math.min(.25,Number(dt)||0)),steps=Math.max(1,Math.ceil(duration/.05)),slice=duration/steps;
 const originPosition={...actor.position};
 actor.velocity ||= {x:mx*speed,y:0,z:mz*speed};
 // Small collision steps avoid long jumps when a server tick arrives late.
 for(let i=0;i<steps;i++){
  const previous={...actor.position},blend=1-Math.exp(-12*slice);
  const vx=actor.velocity.x+(mx*speed-actor.velocity.x)*blend,vz=actor.velocity.z+(mz*speed-actor.velocity.z)*blend;
  const side=actor.id.charCodeAt(actor.id.length-1)%2?1:-1;
  const proposals=[{x:vx,z:vz},{x:vx,z:0},{x:0,z:vz},{x:-vz*side,z:vx*side},{x:vz*side,z:-vx*side}];
  let moved=false;
  for(const direction of proposals){
   if(!slice||Math.hypot(direction.x,direction.z)<.0001)continue;
   const next=resolveMovement(previous,{...previous,x:previous.x+direction.x*slice,z:previous.z+direction.z*slice});
   if(!next||!['x','y','z'].every(axis=>Number.isFinite(next[axis])))continue;
   if(Math.hypot(next.x-previous.x,next.z-previous.z)>1e-6){actor.position={x:next.x,y:next.y,z:next.z};actor.velocity={x:(next.x-previous.x)/slice,y:0,z:(next.z-previous.z)/slice};moved=true;break;}
  }
  if(!moved)actor.velocity={x:0,y:0,z:0};
 }
 if(duration)actor.velocity.y=(actor.position.y-originPosition.y)/duration;
 actor.rotation.y=Math.atan2(target.position.x-actor.position.x,target.position.z-actor.position.z);
 actor.attackStartedAt ??= now;
 const readyAt=(actor.lastAttack??actor.attackStartedAt)+cooldown;
 const inRange=rangeTo(target)<range;
 actor.attack={phase:inRange&&now>=readyAt-Math.min(480,cooldown*.35)?'tell':'idle',targetId:target.actorId||target.id,readyAt};
 if(!applyAttack||!inRange||now<readyAt)return;
 const origin={...actor.position,y:actor.position.y+(actor.kind==='snake'?.2:1)},aim={x:target.position.x-origin.x,y:target.position.y+1-origin.y,z:target.position.z-origin.z},length=Math.hypot(aim.x,aim.y,aim.z);
 if(blocksShot(origin,[aim.x/length,aim.y/length,aim.z/length],length))return;
 damagePlayer(target,now);actor.lastAttack=now;actor.attack.phase='attack';
 sim.events.push({id:`${actor.id}:attack:${now}`,action:'enemy-attack',actorId:actor.id,kind:actor.kind,origin,target:{...target.position},targetId:target.actorId||target.id,at:now});
 sim.events=sim.events.slice(-100);
}
