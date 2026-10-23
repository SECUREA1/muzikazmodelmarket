import {builderBaseSpawn} from './environments/builder-base.js';
export function localMapLocations(environment){
 const meta=environment?.builderScene?.layoutMeta||{};const places=meta.locations||meta.commonsLocations||[];
 if(places.length)return places;
 const spawn=environment?.builderScene?builderBaseSpawn(environment):environment?.spawn?.position||environment?.spawn||{};
 return [{id:'map-arrival',name:'Arrival',x:Number(spawn.x)||0,y:Number(spawn.y)||0,z:Number(spawn.z)||0,width:8,depth:8,description:'Return to this map’s arrival point, or select a clear floor on the map to teleport.'}];
}
