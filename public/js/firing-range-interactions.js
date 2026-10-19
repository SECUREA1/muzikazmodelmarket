/** Local menu actions only; purchases and course results use their existing APIs. */
export const RANGE_STATION_ACTIONS=Object.freeze({console:'Range console',market:'Market',care:'Care supplies',armory:'Armory'});
export const RANGE_SPOT_SETTINGS_KEY='muzikazRangeActionSpots';
export function readRangeSpotSettings(storage){
  let saved={};try{saved=JSON.parse(storage?.getItem(RANGE_SPOT_SETTINGS_KEY)||'{}')||{};}catch{}
  return Object.fromEntries(Object.keys(RANGE_STATION_ACTIONS).map(id=>[id,saved[id]!==false]));
}
export function setRangeSpotEnabled(world,id,enabled){
  if(!Object.hasOwn(RANGE_STATION_ACTIONS,id))return false;
  for(const station of world?.userData?.rangeStations||[])if(station.id===id)station.enabled=Boolean(enabled);
  world?.traverse?.(object=>{if(object.userData?.rangeStation?.id===id)object.visible=Boolean(enabled);});
  return true;
}
export function nearbyRangeStation({world,position,toWorld=point=>point,visible=()=>true}={}){
  if(!position)return null;
  let nearest=null,distance=Infinity;
  for(const station of world?.userData?.rangeStations||[]){
    if(station.enabled===false||!Object.hasOwn(RANGE_STATION_ACTIONS,station.action))continue;
    const point=toWorld(station.position);
    if(!point||![point.x,point.y,point.z,position.x,position.y,position.z].every(Number.isFinite))continue;
    const delta=Math.hypot(point.x-position.x,point.y-position.y,point.z-position.z);
    if(delta>Math.min(3,Math.max(0,Number(station.radius)||2.4))||delta>=distance||!visible(point))continue;
    distance=delta;nearest=station;
  }
  if(!nearest)return null;
  const label=RANGE_STATION_ACTIONS[nearest.action];
  return {kind:'range-station',stationId:nearest.id,rangeAction:nearest.action,key:'e',prompt:`E — Open ${label}`,label:`Open ${label}`,title:label.toUpperCase(),hint:'Tap, press E, or tap the left stick',vehicleActive:false};
}
export function activateRangeStation(action,handlers={}){
  if(!Object.hasOwn(RANGE_STATION_ACTIONS,action)||typeof handlers[action]!=='function')return false;
  handlers[action]();return true;
}
