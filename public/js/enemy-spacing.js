/** Shared enemy-only steering. It never changes a player or another actor. */
export const enemyBodyRadius=kind=>kind==='snake'?.32:kind==='boss'?.8:kind==='brain'?.55:.5;

function heading(id) {
 let hash=2166136261;
 for(const character of String(id||'enemy'))hash=Math.imul(hash^character.charCodeAt(0),16777619);
 const angle=(hash>>>0)/4294967296*Math.PI*2;
 return {x:Math.cos(angle),z:Math.sin(angle)};
}

function obstacles({id,position,players=[],enemies=[],radius=.5}) {
 return [
  ...players.map(player=>({id:player.actorId||player.id||'player',position:player.position||player,clearance:radius+.42})),
  ...enemies.filter(enemy=>enemy.id!==id&&enemy.active!==false&&!(enemy.health<=0)).map(enemy=>({id:enemy.id,position:enemy.position,clearance:radius+(enemy.radius??enemyBodyRadius(enemy.kind))+.12}))
 ].filter(other=>other.position&&Math.abs((other.position.y||0)-(position.y||0))<2);
}

export function steerEnemyApart({id,position,desired={x:0,z:0},players=[],enemies=[],radius=.5}) {
 let x=desired.x||0,z=desired.z||0;
 for(const other of obstacles({id,position,players,enemies,radius})){
  const dx=position.x-other.position.x,dz=position.z-other.position.z,distance=Math.hypot(dx,dz),influence=other.clearance+.65;
  if(distance>=influence)continue;
  // A deterministic, opposite direction for each pair also untangles an exact
  // overlap, where normalizing a zero vector used to leave enemies attached.
  const pair=[String(id),String(other.id)].sort(),fallback=heading(pair.join(':')),side=String(id)===pair[0]?1:-1;
  const away=distance>.0001?{x:dx/distance,z:dz/distance}:{x:fallback.x*side,z:fallback.z*side};
  const weight=2*Math.max(0,Math.min(1,(influence-distance)/.65));
  x+=away.x*weight;z+=away.z*weight;
 }
 const length=Math.hypot(x,z);
 return length>1?{x:x/length,z:z/length}:{x,z};
}

/** Prevent a proposed step from entering a body; an existing overlap can leave. */
export function enemyStepKeepsSpace(previous,next,context) {
 const dx=next.x-previous.x,dz=next.z-previous.z,squared=dx*dx+dz*dz;
 for(const other of obstacles({...context,position:previous})){
  const px=previous.x-other.position.x,pz=previous.z-other.position.z,start=Math.hypot(px,pz),end=Math.hypot(next.x-other.position.x,next.z-other.position.z);
  if(start<other.clearance-.0001){if(end<start+.000001)return false;continue;}
  const t=squared?Math.max(0,Math.min(1,-(px*dx+pz*dz)/squared)):0;
  if(Math.hypot(px+dx*t,pz+dz*t)<other.clearance-.0001)return false;
 }
 return true;
}
