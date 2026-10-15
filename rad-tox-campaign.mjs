// Shared encounters are owned by the room, never by a client's local enemy list.
export function supportsRadTox(environment) {
 return environment.playable!==false && !environment.builderScene && !environment.proceduralLand && Boolean(environment.modelUrl || environment.modelUrls?.length);
}
export function spawnRadToxWave(sim, now, center) {
 for (const [id,actor] of Object.entries(sim.actors)) if (actor.radTox) delete sim.actors[id];
 const campaign=sim.radTox;
 campaign.state='active';campaign.nextWaveAt=null;
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
 if(!sim.radTox) {
  sim.radTox={level:1,wave:1,state:'active',remaining:0,targetCount:0};
  spawnRadToxWave(sim,now,center);
 }
 return true;
}
export function advanceRadTox(sim,now) {
 if(!sim.radTox)return;
 const campaign=sim.radTox;
 campaign.remaining=Object.values(sim.actors).filter(actor=>actor.radTox&&actor.active&&actor.health>0).length;
 const players=Object.values(sim.players).filter(player=>now-player.lastSeen<1500&&player.health>0);
 if(campaign.remaining || !players.length)return;
 if(!campaign.nextWaveAt){campaign.state='cleared';campaign.nextWaveAt=now+1500;return;}
 if(now<campaign.nextWaveAt)return;
 campaign.wave++;
 if(campaign.wave>4){campaign.wave=1;campaign.level++;}
 for(const player of players){player.ammo=120;player.fuel=100;player.health=Math.min(100,player.health+15);}
 spawnRadToxWave(sim,now,players[0].position);
}
