import {fishingZones,isFishingBoat} from './fishing-config.js';
import {vehicleDestinations} from './vehicle-destinations.js';

// Every map surface resolves the selected zone by its canonical ID. Offshore
// grounds are reached by boat; their display centers are not walking arrivals.
export function fishingMapAction(environment,live,selfId,zoneId){
 const zone=fishingZones(environment).find(item=>item.id===zoneId);if(!zone)return null;
 const player=live?.players?.[selfId],availability=player?.fishing?.availability;
 const sites=availability?.sides?Object.entries(availability.sides):[['starboard',availability]];
 const ready=sites.find(([,site])=>site?.canCast&&site.zoneId===zone.id);
 const fishHere=ready?{side:ready[0],label:'Fish here at '+zone.name}:null;
 const authored=environment?.builderScene?.objects||[],actors=new Map(authored.filter(isFishingBoat).map(item=>[item.id,item]));
 for(const actor of Object.values(live?.actors||{}))if(isFishingBoat(actor))actors.set(actor.id,{...actors.get(actor.id),...actor});
 const current=live?.actors?.[player?.vehicleId]||authored.find(item=>item.id===player?.vehicleId),usable=actor=>actor.active!==false&&!actor.trafficAI&&(!actor.holderId||actor.holderId===selfId)&&vehicleDestinations(environment,actor).some(destination=>destination.id===zone.id);
 if(isFishingBoat(current)&&usable(current))return {kind:'route',zoneId:zone.id,name:zone.name,entityId:current.id,label:'Sail & fish at '+zone.name,enabled:true,fishHere};
 const boats=[...actors.values()].filter(usable).sort((a,b)=>Math.hypot(a.position.x-zone.x,a.position.z-zone.z)-Math.hypot(b.position.x-zone.x,b.position.z-zone.z)),boat=boats[0];
 return {kind:'board-route',zoneId:zone.id,name:zone.name,entityId:boat?.id,label:'Sail & fish at '+zone.name,enabled:!!boat,fishHere,reason:boat?'Board '+(boat.name||'the Angler')+' and sail to the selected fishing ground.':'The fishing boats for this water are occupied or unavailable. Try again shortly.'};
}
