import {forgeVillageArchitecture} from './forge-village-architecture.js?v=forge-village-20261031';
import {forgeVillageLandscape} from './forge-village-landscape.js?v=forge-village-20261031';
import {forgeVillageDetails,forgeVillageDetailLocations} from './forge-village-details.js?v=forge-village-20261031';
import {forgeObjectPoint} from './forge-config.js?v=forge-atelier-20261031';

export const FORGE_VILLAGE_SIZE=224;
const architecture=forgeVillageArchitecture(),landscape=forgeVillageLandscape();
const objects=[...architecture.objects,...landscape.objects,...forgeVillageDetails()];
const originals=new Map(objects.map(object=>[object.id,object]));
const locations=new Map([...architecture.locations,...landscape.locations].map(location=>[location.id,location]));
for(const location of forgeVillageDetailLocations()){
 const existing=[...locations.values()].find(place=>place.villageAnchorId&&place.villageAnchorId===location.villageAnchorId);
 if(existing)locations.set(existing.id,{...existing,...location,id:existing.id,name:existing.name});else locations.set(location.id,location);
}
const landscapeAnchors={
 'forge-village-square':'forge-village-land-civic-square',
 'forge-village-south-gate':'forge-village-land-road-arrival',
 'forge-village-guild-road':'forge-village-land-road-north',
 'forge-village-millrace':'forge-village-land-millrace-bed'
};
const active=object=>object&&object.active!==false&&object.enabled!==false&&object.visible!==false&&!object.deleted&&!object.disabled&&object.functionalSettings?.active!==false&&object.functionalSettings?.enabled!==false;
const clone=value=>structuredClone(value);
const vector=value=>({x:Number(value?.x)||0,y:Number(value?.y)||0,z:Number(value?.z)||0});

/** A village is a saved collection of ordinary editable, canonical parts. */
export const forgeVillageObjects=()=>clone(objects);
export const forgeVillageStreets=()=>clone(landscape.streets);

function localPoint(anchor,position){
 const point=vector(position),origin=vector(anchor.position),yaw=Number(anchor.rotation?.y)||0,dx=point.x-origin.x,dz=point.z-origin.z;
 return {x:(dx*Math.cos(yaw)-dz*Math.sin(yaw))/(anchor.scale?.x||1),y:(point.y-origin.y)/(anchor.scale?.y||1),z:(dx*Math.sin(yaw)+dz*Math.cos(yaw))/(anchor.scale?.z||1)};
}

/** Navigation follows the actual saved floor/fixture. Removing that anchor
 * removes its marker; opening an old draft never respawns village buildings. */
export function forgeVillageMeta(scene={}){
 const saved=new Map((scene.objects||[]).filter(active).map(object=>[object.id,object]));
 const resolve=(anchorId,point)=>{
  const original=originals.get(anchorId),anchor=saved.get(anchorId);if(!original||!anchor)return null;
  return forgeObjectPoint(anchor,localPoint(original,point));
 };
 const rooms=architecture.rooms.flatMap(room=>{
  const anchor=saved.get(room.anchorId),original=originals.get(room.anchorId);if(!anchor||!original)return [];
  return [{...clone(room),position:resolve(room.anchorId,room.position),door:resolve(room.anchorId,room.door),approach:resolve(room.anchorId,room.approach),interior:resolve(room.anchorId,room.interior),width:room.width*(anchor.scale?.x||1)/(original.scale?.x||1),depth:room.depth*(anchor.scale?.z||1)/(original.scale?.z||1),yaw:Number(anchor.rotation?.y)||0}];
 });
 const places=[...locations.values()].flatMap(location=>{
  const anchorId=location.villageAnchorId||landscapeAnchors[location.id],position=resolve(anchorId,location);if(!position)return [];
  return [{...clone(location),...position,villageAnchorId:anchorId}];
 });
 const hasVillage=rooms.length>0||places.length>0;
 return hasVillage?{version:1,name:'Emberfall · Forge Village',mapSize:Number(scene.mapSize)||FORGE_VILLAGE_SIZE,rooms,locations:places,streets:clone(landscape.streets),walkingRoutes:clone(landscape.walkingRoutes),waterworks:clone(landscape.waterworks)}:null;
}
