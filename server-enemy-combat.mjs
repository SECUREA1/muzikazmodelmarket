import {damagePlayer} from './rpg-match.mjs';
export const ENEMY_BEHAVIORS=Object.freeze({
 toxic:{range:1.5,cooldown:1200,moveSpeed:2,height:1},
 snake:{range:1.2,cooldown:1000,moveSpeed:3,height:.2},
 ghost:{range:9,cooldown:1800,speed:6,moveSpeed:2.8,height:1},
 brain:{range:7,cooldown:1600,speed:7,moveSpeed:3.4,height:.74},
 boss:{range:12,cooldown:1400,speed:8,moveSpeed:2.8,height:1.8}
});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const event=(sim,value)=>{sim.events.push(value);sim.events=sim.events.slice(-100);};
export function stepEnemyCombat(sim,{now,dt,environment,collision}){
 sim.projectiles ||= {};
 if(sim.match?.state==='finished'||sim.radTox?.state==='cleared'){sim.projectiles={};return;}
 const players=Object.entries(sim.players).filter(([,player])=>player.radToxReady!==false&&player.radToxEnabled!==false&&!player.replacedByRoom&&now-player.lastSeen<15000&&player.health>0&&now>=(player.spawnProtectedUntil||0));
 const blocked=(origin,direction,length)=>collision.blocksShot(environment,origin,direction,length,sim.actors);
 const hit=(actor,id,player,origin)=>{if(damagePlayer(player,now))event(sim,{id:'enemy-hit-'+ ++sim.enemySequence,action:'enemy-hit',actorId:actor,targetId:id,origin,at:now});};
 sim.enemySequence ||= 0;
 for(const actor of Object.values(sim.actors)){
  const config=ENEMY_BEHAVIORS[actor.kind];if(!actor.radTox||!actor.active||actor.pendingSpawn||actor.health<=0||!config)continue;
  const nearest=players.reduce((best,row)=>!best||distance(actor.position,row[1].position)<distance(actor.position,best[1].position)?row:best,null);
  const current=players.find(([id])=>id===actor.movementTargetId);
  const target=current&&nearest&&distance(actor.position,current[1].position)<=distance(actor.position,nearest[1].position)*1.25+.5?current:nearest;
  if(!target)continue;const [targetId,player]=target,span=distance(actor.position,player.position);
  const origin={x:actor.position.x,y:actor.position.y+config.height,z:actor.position.z},aim={x:player.position.x,y:player.position.y+.9,z:player.position.z};
  const length=distance(origin,aim),direction=[(aim.x-origin.x)/Math.max(.001,length),(aim.y-origin.y)/Math.max(.001,length),(aim.z-origin.z)/Math.max(.001,length)];
  if(span>config.range||now-(actor.lastAttack??actor.attackStartedAt??0)<config.cooldown||blocked(origin,direction,length))continue;
  actor.lastAttack=now;actor.attackTargetId=targetId;actor.attack={phase:'attack',targetId,readyAt:now+config.cooldown};
  event(sim,{id:'enemy-attack-'+ ++sim.enemySequence,action:'enemy-attack',kind:actor.kind,actorId:actor.id,targetId,origin,direction,at:now});
  if(!config.speed){hit(actor.id,targetId,player,origin);continue;}
  if(Object.keys(sim.projectiles).length>=48)continue;
  const id='enemy-projectile-'+ ++sim.enemySequence;
  sim.projectiles[id]={id,actorId:actor.id,kind:actor.kind,position:{...origin},velocity:direction.map(n=>n*config.speed),bornAt:now,expiresAt:now+2500};
 }
 for(const [id,projectile]of Object.entries(sim.projectiles)){
  if(now>=projectile.expiresAt){delete sim.projectiles[id];continue;}
  const elapsed=Math.max(0,Math.min(Math.max(0,dt),(now-projectile.bornAt)/1000));
  const start=projectile.position,step=projectile.velocity.map(n=>n*elapsed),length=Math.hypot(...step);
  if(!length)continue;
  const direction=step.map(n=>n/length);
  let target=null,along=Infinity;
  for(const [playerId,player]of players){
   const body={x:player.position.x,y:player.position.y+.9,z:player.position.z};
   const t=Math.max(0,Math.min(length,(body.x-start.x)*direction[0]+(body.y-start.y)*direction[1]+(body.z-start.z)*direction[2]));
   const point={x:start.x+direction[0]*t,y:start.y+direction[1]*t,z:start.z+direction[2]*t};
   if(distance(body,point)<.55&&t<along){target=[playerId,player];along=t;}
  }
  // A wall before the player blocks a hit; a wall beyond the player does not.
  if(blocked(start,direction,(target?along:length)+.05)){delete sim.projectiles[id];continue;}
  if(target){hit(projectile.actorId,...target,{x:start.x+direction[0]*along,y:start.y+direction[1]*along,z:start.z+direction[2]*along});delete sim.projectiles[id];}
  else projectile.position={x:start.x+step[0],y:start.y+step[1],z:start.z+step[2]};
 }
}
