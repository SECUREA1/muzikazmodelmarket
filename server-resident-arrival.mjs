import {residentActivityRestricted} from './server-resident-life.mjs';

// Choose real public ground beside an existing contact. Native sports maps
// include raised approaches that are not the base terrain used by meetings.
export function residentArrivalPosition(sim,environment,collision,objects={}){
 for(const resident of Object.values(sim.actors||{}).filter(actor=>actor.resident&&!actor.resident.casino&&actor.active!==false)){
  for(const radius of [2,3.5,5])for(let direction=0;direction<8;direction++){
   const angle=direction*Math.PI/4,candidate={x:resident.position.x+Math.cos(angle)*radius,y:resident.position.y,z:resident.position.z+Math.sin(angle)*radius};
   if(residentActivityRestricted(environment,candidate,sim))continue;
   let floor;try{floor=collision.groundAt(environment,candidate,{entry:true,actors:sim.actors,objects});}catch{continue;}
   if(!floor||Math.abs(floor.y-resident.position.y)>.5||residentActivityRestricted(environment,floor,sim))continue;
   if(!collision.hasBodyClearance(environment,floor,.5,{actors:sim.actors,objects}))continue;
   if(Object.values(sim.players||{}).some(player=>!player.replacedByRoom&&player.position&&Math.hypot(player.position.x-floor.x,player.position.z-floor.z)<1.1))continue;
   return floor;
  }
 }
 return null;
}
