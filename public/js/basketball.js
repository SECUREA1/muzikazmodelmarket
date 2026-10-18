const nativeIds=actor=>[actor?.asset?.buildAssetId,actor?.definition?.asset?.buildAssetId,actor?.buildAssetId,actor?.modelId,actor?.id];
export const isBasketball=actor=>nativeIds(actor).some(id=>id==='basketball'||id==='catalog-basketball');
export function basketballJerseyTeam(actor){
  const ids=nativeIds(actor);
  for(const team of ['home','away'])if(ids.some(id=>id===`basketball-jersey-${team}`||id===`catalog-basketball-jersey-${team}`))return team;
  return ['home','away'].includes(actor?.asset?.basketballTeam)?actor.asset.basketballTeam:null;
}
export function tossBasketball(actor, position, direction) {
  if (!isBasketball(actor)) return false;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < .01) return false;
  actor.position = {x:position.x, y:position.y + 1.2, z:position.z};
  actor.ballFloor = position.y;
  actor.ballVelocity = {x:direction.x/length*7, y:direction.y/length*7+4, z:direction.z/length*7};
  actor.holderId = null;
  return true;
}
export function stepBasketball(actor, delta, floor = actor.ballFloor ?? 0, onStep) {
  if (!isBasketball(actor) || actor.holderId || !actor.ballVelocity) return;
  // Analytic gravity inside small sweeps keeps assisted arcs and rim crossings
  // accurate at every rendering rate. A callback can stop after a scored goal.
  for(let remaining=Math.min(.25,Math.max(0,delta));remaining>0;){
    const velocity=actor.ballVelocity;if(!velocity||actor.holderId)break;
    const dt=Math.min(remaining,1/60);remaining-=dt;
    const previous={...actor.position};
    actor.position.x+=velocity.x*dt;actor.position.y+=velocity.y*dt-4.9*dt*dt;actor.position.z+=velocity.z*dt;velocity.y-=9.8*dt;
    if(onStep?.(previous,actor.position)===false)break;
    if(actor.position.y<floor){actor.position.y=floor;velocity.y=Math.abs(velocity.y)*.72;velocity.x*=.82;velocity.z*=.82;if(velocity.y<.3){delete actor.ballVelocity;break;}}
  }
}
