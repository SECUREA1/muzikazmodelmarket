import {randomUUID} from 'node:crypto';
export const MZK_COIN_COUNT=8;
export const MZK_COIN_RESPAWN_MS=60000;
// Room-owned spawns and one-use IDs are the only source of coin rewards.
export function refreshMzkCoins(sim,environment,now,safeSpawn,random=Math.random){
 sim.coinSites ||= {};
 const center=environment.spawn||{x:0,y:0,z:2};
 for(let i=0;i<MZK_COIN_COUNT;i++){
  const previous=sim.actors[sim.coinSites[i]];
  if(previous&&(previous.active||now-previous.loot.collectedAt<MZK_COIN_RESPAWN_MS))continue;
  if(previous)delete sim.actors[previous.id];
  const angle=(i+random()*.7)/MZK_COIN_COUNT*Math.PI*2,radius=3+random()*8;
  const occupied=Object.values(sim.actors).filter(actor=>actor.loot?.currency==='MZK'&&actor.active).map(actor=>actor.position);
  const position=safeSpawn({x:center.x+Math.sin(angle)*radius,y:center.y||0,z:center.z+Math.cos(angle)*radius},occupied);
  if(!position||occupied.some(other=>Math.hypot(other.x-position.x,other.z-position.z)<.65))continue;
  const token=randomUUID(),id='mzk-coin-'+token;
  sim.actors[id]={id,spawned:true,active:true,position:{x:position.x,y:position.y,z:position.z},rotation:{x:0,y:0,z:0},loot:{token,currency:'MZK',amount:1,name:'MZK token',color:0xffd84d,createdAt:now,site:'coin-'+i}};
  sim.coinSites[i]=id;
 }
}
