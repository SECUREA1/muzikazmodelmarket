import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
const supplies=JSON.parse(readFileSync(new URL('./public/models/ioncore-rpg-items.json',import.meta.url))).items;
const common=['ion-health-vial','plasma-water','reactor-ration','volt-cell','focus-stim','antidote-ampoule'];
function create(sim,position,catalogId,now,site=null){
 const item=supplies.find(item=>item.id===catalogId),token=randomUUID(),id='rpg-loot-'+token;
 sim.actors[id]={id,spawned:true,active:true,position:{...position},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},loot:{token,catalogId,name:item.name,color:item.color,createdAt:now,site}};
 return id;
}
export function dropRpgLoot(sim,enemy,now){
 if(enemy.lootDropped)return;
 enemy.lootDropped=true;
 const index=(sim.lootDropCount||0)%common.length;sim.lootDropCount=(sim.lootDropCount||0)+1;
 create(sim,enemy.position,enemy.kind==='boss'?'ioncore-survival-pack':common[index],now);
}
export function refreshRpgLoot(sim,environment,now,safeSpawn){
 const loot=Object.values(sim.actors).filter(actor=>actor.loot);
 for(const actor of loot)if(!actor.loot.site&&now-actor.loot.createdAt>300000||!actor.active&&now-(actor.loot.collectedAt||0)>60000)delete sim.actors[actor.id];
 // Keep only a bounded number of short-lived enemy drops.
 const drops=Object.values(sim.actors).filter(actor=>actor.loot&&!actor.loot.site);
 for(const actor of drops.slice(0,Math.max(0,drops.length-64)))delete sim.actors[actor.id];
 // Supply sites belong to campaign/public maps; custom designs remain authored-only.
 if(environment.builderScene||environment.proceduralLand||!sim.radTox&&!environment.publicDestination)return;
 sim.supplySites ||= {};
 const center=environment.spawn||{x:0,y:0,z:2};
 for(let i=0;i<common.length;i++){
  const previous=sim.actors[sim.supplySites[i]];
  if(previous&&(previous.active||now-previous.loot.collectedAt<60000))continue;
  const angle=i/common.length*Math.PI*2,position=safeSpawn({x:center.x+Math.sin(angle)*4,y:center.y,z:center.z+Math.cos(angle)*4});
  sim.supplySites[i]=create(sim,position,common[i],now,String(i));
 }
}
