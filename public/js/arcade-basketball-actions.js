/** Resolve against the same court state in solo play and authoritative rooms. */
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const rim=team=>({x:400,y:team===0?65:395});
function shotQuality(player,players){
 const defenders=players.filter(other=>other.team!==player.team&&distance(player,other)<50).length;
 return Math.max(.12,Math.min(.94,.92-distance(player,rim(player.team))/650-defenders*.16));
}
function openPass(from,to,players){
 const dx=to.x-from.x,dy=to.y-from.y,length=dx*dx+dy*dy;
 return !players.some(other=>{
  if(other.team===from.team||!length)return false;
  const t=((other.x-from.x)*dx+(other.y-from.y)*dy)/length;
  return t>.1&&t<.9&&distance(other,{x:from.x+t*dx,y:from.y+t*dy})<22;
 });
}
export function resolveArcadeBasketballAction(state,slot,requested='auto'){
 // An explicit choice retains its normal validation in the simulation.
 if(['shoot','pass','steal'].includes(requested))return {kind:requested};
 if(requested!=='auto')return null;
 const players=state?.players||[],player=players.find(item=>item.id===slot);
 if(!player||state.ended||state.shot||state.stoppage>0||player.cooldown>0)return null;
 const carrier=players.find(item=>item.id===state.owner);
 if(carrier?.team!==player.team){
  return carrier&&distance(player,carrier)<38?{kind:'steal'}:null;
 }
 if(carrier.id!==slot)return null;
 const quality=shotQuality(player,players),range=distance(player,rim(player.team));
 // Take a good basket immediately; beat the shot clock even from long range.
 if(state.shotClock<=3.5||quality>=.7&&range<=175)return {kind:'shoot'};
 const teammates=players.filter(other=>other.team===player.team&&other.id!==slot&&openPass(player,other,players))
  .map(other=>({player:other,quality:shotQuality(other,players)}))
  .filter(other=>other.quality>quality+.12)
  .sort((a,b)=>b.quality-a.quality||a.player.id-b.player.id);
 if(teammates.length)return {kind:'pass',target:teammates[0].player.id};
 return {kind:'shoot'};
}
