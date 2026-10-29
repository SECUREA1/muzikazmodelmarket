import {localMapLocations} from './local-map-locations.js';

/** A local map hint is display data, never a movement or completion request. */
export function localMapWaypoint(environment,details={}){
 if(!environment||!details||typeof details!=='object'||details.mapId&&details.mapId!==environment.id)return null;
 const place=typeof details.locationId==='string'?localMapLocations(environment).find(place=>place.id===details.locationId):null;
 const point=place||details.position;
 if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z)||point.y!==undefined&&!Number.isFinite(point.y))return null;
 const half=environment.builderScene?.layoutMeta?.harbor?.extent||(Number(environment.builderScene?.mapSize)||Number(environment.playableSize)||256)/2;
 if(!place&&(Math.abs(point.x)>half||Math.abs(point.z)>half))return null;
 const label=[details.name,details.label,place?.name,'Order journey next stop'].find(value=>typeof value==='string'&&value.trim());
 return {id:'order-journey-waypoint',name:label.trim().slice(0,160),kind:'waypoint',icon:'◎',color:'#ffdc82',x:point.x,y:point.y||0,z:point.z,readOnly:true,waypoint:true,description:'Order journey waypoint. Follow the required transport steps; the server confirms delivery.'};
}
