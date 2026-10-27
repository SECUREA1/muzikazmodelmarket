import {freightHubs} from './cargo-hauling.js';
import {builderBaseSpawn} from './environments/builder-base.js';
import {FACTORY_STATIONS,factoryStations,isFactoryEnvironment} from './missile-factory-config.js';
import {isTropicalIslandEnvironment,ISLAND_EXPERIENCES} from './tropical-island-config.js';
export function localMapLocations(environment){
 const meta=environment?.builderScene?.layoutMeta||{};const places=meta.locations||meta.commonsLocations||[];
 if(isTropicalIslandEnvironment(environment)&&!places.length)return ISLAND_EXPERIENCES.map(place=>({id:'island-'+place.id,name:place.label,x:place.x,y:place.y,z:place.z,width:place.type==='boat'?6:10,depth:place.type==='boat'?4:8,description:place.description}));
 if(isFactoryEnvironment(environment)){
  const stations=factoryStations(environment),ids=new Set(FACTORY_STATIONS.map(station=>station.id));
  const retained=places.filter(place=>!ids.has(place.id)&&!place.factoryStationId&&!String(place.id).startsWith('factory-instance:'));
  return [...stations.map(station=>({id:station.id,name:station.name,x:station.position.x,y:station.position.y,z:station.position.z,width:14,depth:12,description:station.description})),...retained];
 }
 if(places.length)return [...places,...freightHubs(environment)];
 const spawn=environment?.builderScene?builderBaseSpawn(environment):environment?.spawn?.position||environment?.spawn||{};
 return [{id:'map-arrival',name:'Arrival',x:Number(spawn.x)||0,y:Number(spawn.y)||0,z:Number(spawn.z)||0,width:8,depth:8,description:'Return to this map’s arrival point, or select a clear floor on the map to teleport.'},...freightHubs(environment)];
}
