import {damagePlayer,openMatch,finishMatch,healPlayer,matchRows} from './rpg-match.mjs';
export const ROUND_COUNTDOWN_MS=10000;
// Shared encounters are owned by the room, never by a client's local enemy list.
export function supportsRadTox(environment) {
 return environment.playable!==false && !environment.builderScene && !environment.proceduralLand && Boolean(environment.modelUrl || environment.modelUrls?.length);
}
export function spawnRadToxWave(sim, now, center) {
 for (const [id,actor] of Object.entries(sim.actors)) if (actor.radTox) delete sim.actors[id];
 const campaign=sim.radTox;
 campaign.state='active';campaign.nextWaveAt=null;campaign.transition=null;
 const boss=campaign.wave===4;
 const count=boss?1:Math.min(16,6+campaign.level*2);
 const kinds=['toxic','ghost','snake','brain'];
 for(let index=0;index<count;index++) {
  const kind=boss?'boss':kinds[index%kinds.length];
  const angle=index/count*Math.PI*2;
  const radius=boss?5:3+index%3;
  const position={x:center.x+Math.sin(angle)*radius,y:center.y,z:center.z-Math.cos(angle)*radius};
  const id=`rad-tox-${campaign.level}-${campaign.wave}-${index}`;
  const health=boss?160+campaign.level*20:kind==='snake'?20:40;
  const definition={objectId:id,position:{...position},movement:{speed:kind==='snake'?1.4:.65},ai:{detectionRange:40},gameplay:{behavior:'hostile',health,damage:boss?12:kind==='snake'?4:6}};
  sim.actors[id]={id,radTox:true,kind,position,rotation:{y:0},health,maxHealth:health,active:true,definition};
 }
 campaign.targetCount=count;campaign.remaining=count;campaign.startedAt=now;
}
export function startRadTox(sim,environment,now,center) {
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
  if(environment&&now>=campaign.transition.at&&Object.values(sim.players).some(player=>!player.replacedByRoom&&now-player.lastSeen<15000))nextRadToxLevel(sim,environment,now,sim.match.id);
  return;
 }
 campaign.remaining=Object.values(sim.actors).filter(actor=>actor.radTox&&actor.active&&actor.health>0).length;
 const players=Object.values(sim.players).filter(player=>!player.replacedByRoom&&now-player.lastSeen<15000&&player.health>0);
 if(campaign.remaining || !players.length)return;
 if(campaign.wave===4){finishMatch(sim,'victory',now);campaign.transition={kind:'level',at:now+ROUND_COUNTDOWN_MS};return;}
 if(!campaign.nextWaveAt){campaign.state='cleared';campaign.nextWaveAt=now+ROUND_COUNTDOWN_MS;campaign.transition={kind:'wave',at:campaign.nextWaveAt,results:matchRows(sim,now)};return;}
 if(now<campaign.nextWaveAt)return;
 campaign.wave++;
 for(const player of players){player.ammo=120;player.fuel=100;healPlayer(player,15);}
 spawnRadToxWave(sim,now,players[0].position);
}

export function nextRadToxLevel(sim,environment,now,expectedMatchId) {
 if(!supportsRadTox(environment)||!sim.match||sim.match.state!=='finished'||sim.match.id!==expectedMatchId)return false;
 const level=sim.match.outcome==='victory'?sim.radTox.level+1:sim.radTox.level;
 const center=Object.values(sim.players).find(player=>!player.replacedByRoom&&now-player.lastSeen<15000)?.position||environment.spawn||{x:0,y:0,z:2};
 sim.radTox={level,wave:1,state:'active',remaining:0,targetCount:0};
 openMatch(sim,level,now);spawnRadToxWave(sim,now,center);return true;
}

// Only the server advances attack clocks or applies damage. Clients animate
// these phases and replay the resulting events without running enemy AI.
export function stepRadToxEnemy(sim,actor,players,now,dt,blocksShot=()=>false,resolveMovement=(_previous,next)=>next,applyAttack=true) {
 const target=players.slice().sort((a,b)=>Math.hypot(a.position.x-actor.position.x,a.position.z-actor.position.z)-Math.hypot(b.position.x-actor.position.x,b.position.z-actor.position.z))[0];
 if(!target){actor.attack=null;return;}
 const dx=target.position.x-actor.position.x,dz=target.position.z-actor.position.z,span=Math.hypot(dx,dz);
 const range=actor.kind==='brain'?7.4:actor.kind==='ghost'?5:actor.kind==='boss'?7:1.5;
 const cooldown=actor.kind==='brain'?1450:actor.kind==='boss'?1250:1000;
 actor.rotation.y=Math.atan2(dx,dz);
 const step=Math.min(span,dt*actor.definition.movement.speed);
 if(span>range*.65&&span>.001){
  const next=resolveMovement(actor.position,{...actor.position,x:actor.position.x+dx/span*step,z:actor.position.z+dz/span*step});
  actor.position={x:next.x,y:next.y,z:next.z};
 }
 if(actor.lastAttack===undefined)actor.lastAttack=now;
 const readyAt=actor.lastAttack+cooldown;
 const inRange=span<range;
 actor.attack={phase:inRange&&now>=readyAt-480?'tell':'idle',targetId:target.actorId||target.id,readyAt};
 if(!applyAttack||!inRange||now<readyAt)return;
 const origin={...actor.position,y:actor.position.y+(actor.kind==='snake'?.2:1)},aim={x:target.position.x-origin.x,y:target.position.y+1-origin.y,z:target.position.z-origin.z},length=Math.hypot(aim.x,aim.y,aim.z);
 if(blocksShot(origin,[aim.x/length,aim.y/length,aim.z/length],length))return;
 damagePlayer(target,now);actor.lastAttack=now;actor.attack.phase='attack';
 sim.events.push({id:`${actor.id}:attack:${now}`,action:'enemy-attack',actorId:actor.id,kind:actor.kind,origin,target:{...target.position},targetId:target.actorId||target.id,at:now});
 sim.events=sim.events.slice(-100);
}
