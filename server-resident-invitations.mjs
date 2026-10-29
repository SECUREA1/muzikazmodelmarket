import {localMapLocations} from './public/js/local-map-locations.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const words=value=>String(value||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,100);
const interestTerms={basketball:'basketball hoops court',hockey:'hockey rink skating',skiing:'ski trail lift resort',aviation:'airport terminal aircraft hangar',seamanship:'dock quay harbor marina boat',music:'music stage lounge',construction:'construction equipment workshop',craftsmanship:'craft workshop creative art',exploration:'garden park overlook landmark',games:'arcade games play'};

// Pure invitation selection shared by autonomous greetings and direct chat.
// The authoritative caller supplies the collision-aware public approach.
export function residentActivityInvitation(environment,npc,player,now,{excludeLocationId,resolveDestination}={}){
 const interest=player.residentPreferences?.interest||npc.resident.context?.primarySkill||'exploration';
 const terms=(interestTerms[interest]||String(interest)).toLowerCase().split(/\s+/).filter(Boolean);
 const choices=localMapLocations(environment).filter(place=>Number.isFinite(place.x)&&Number.isFinite(place.z)&&place.id!=='map-arrival'&&place.visibility!=='private'&&place.public!==false&&(!place.mapId||place.mapId===environment.id));
 const alternatives=choices.filter(place=>(place.id||place.name)!==excludeLocationId),places=excludeLocationId?alternatives:choices;
 const score=place=>terms.reduce((value,term)=>value+Number((place.name+' '+(place.description||'')).toLowerCase().includes(term))*1000,0)-distance(place,player.position||npc.position);
 for(const place of [...places].sort((a,b)=>score(b)-score(a)||String(a.id||a.name).localeCompare(String(b.id||b.name)))){
  const point=resolveDestination?resolveDestination(place):{x:place.x,y:place.y||0,z:place.z};
  if(!point||![point.x,point.y||0,point.z].every(Number.isFinite))continue;
  const locationId=String(place.id||place.name),name=words(place.name)||'Public activity point';
  return {id:environment.id+':'+npc.id+':visit:'+now+':'+locationId,residentId:npc.id,worldId:environment.id,locationId,title:'Explore '+name,description:'Would you like to check out '+name+'? I can mark its public approach. When you arrive, its own controls explain how to take part.',destination:{x:point.x,y:point.y||0,z:point.z,name},status:'offered',createdAt:now,expiresAt:now+120000};
 }
 return null;
}
