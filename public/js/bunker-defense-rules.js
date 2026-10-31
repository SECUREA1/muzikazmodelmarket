import {isBunkerEnvironment} from './bunker-config.js';

// In-game continuity rules. Protection belongs to the authored underground
// volume and operating equipment, never to the map identifier alone.
export const BUNKER_DEFENSE_TIMING=Object.freeze({firstAirstrikeMs:24000,airstrikeWarningMs:16000,airstrikeImpactMs:6000,airstrikeRecoveryMs:10000,repeatAirstrikeMs:180000,falloutPulseMs:10000});
export const BUNKER_DEFENSE_DAMAGE=Object.freeze({airstrikeExposed:45,airstrikeUnsealed:8,nuclearExposed:70,nuclearUnsealed:18,falloutExposed:7,falloutUnsealed:4,falloutUnfiltered:2});
const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const finitePoint=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
const timingLimits={firstAirstrikeMs:[10000,300000],airstrikeWarningMs:[8000,60000],airstrikeImpactMs:[1000,20000],airstrikeRecoveryMs:[3000,120000],repeatAirstrikeMs:[60000,1200000],falloutPulseMs:[5000,60000]};
export function bunkerDefenseConfig(environment={}){
 const source=environment.bunkerDefense||environment.builderScene?.layoutMeta?.bunkerDefense||environment.bunker?.defense;
 if(!isBunkerEnvironment(environment)||!source||source.enabled!==true)return null;
 const stations=source.stations||{};
 return {...source,stations,undergroundBounds:source.undergroundBounds||{minX:source.minX,maxX:source.maxX,minY:number(source.floorY,-12)-.6,maxY:number(source.ceilingY,-8),minZ:source.minZ,maxZ:source.maxZ},
  sealDoorIds:source.sealDoorIds||source.sealedDoorIds||[stations.shutter].filter(Boolean),
  timing:Object.fromEntries(Object.entries(BUNKER_DEFENSE_TIMING).map(([key,fallback])=>[key,Math.max(timingLimits[key][0],Math.min(timingLimits[key][1],number(source.timing?.[key],fallback)))]))};
}
export function isInsideBunkerProtection(position,environment){
 const config=bunkerDefenseConfig(environment),bounds=config?.undergroundBounds;
 if(!config||!finitePoint(position)||!bounds||!['minX','maxX','minY','maxY','minZ','maxZ'].every(key=>Number.isFinite(bounds[key])))return false;
 // An author cannot turn an aboveground marker into underground protection.
 const surface=number(config.surfaceY,0);
 return position.y<surface-2&&position.x>=bounds.minX&&position.x<=bounds.maxX&&position.y>=bounds.minY&&position.y<=bounds.maxY&&position.z>=bounds.minZ&&position.z<=bounds.maxZ;
}
export function bunkerDefenseSystems(actors={},environment){
 const config=bunkerDefenseConfig(environment);if(!config)return null;
 const system=id=>({id:id||null,available:Boolean(id&&actors[id]?.active!==false&&actors[id]),ready:Boolean(id&&actors[id]?.active!==false&&actors[id]?.switched===true)});
 const doors=config.sealDoorIds.map(id=>({id,available:Boolean(actors[id]&&actors[id].active!==false),closed:Boolean(actors[id]&&actors[id].active!==false&&actors[id].open!==true)}));
 const power=system(config.stations.power),filtration=system(config.stations.filtration),relay=system(config.stations.relay);
 const sealed=doors.length>0&&doors.every(door=>door.available&&door.closed);
 return {power,filtration,relay,doors,sealed,ready:sealed&&power.ready&&filtration.ready,communicationsReady:power.ready&&relay.ready};
}
export function bunkerProtection(position,environment,systems){
 const underground=isInsideBunkerProtection(position,environment),sealed=underground&&systems?.sealed===true,filtered=sealed&&systems?.power?.ready===true&&systems?.filtration?.ready===true;
 return {underground,sealed,filtered,blastProtected:sealed,falloutProtected:filtered,level:!underground?'exposed':filtered?'protected':sealed?'sealed':'unsealed',
  message:!underground?'Exposed at the surface. Descend to the marked underground shelter.':!sealed?'Underground cover is available. Close the entrance blast shutter.':!filtered?'Blast shutter sealed. Restore power and filtration for fallout protection.':'Underground shelter sealed; power and filtration are operating.'};
}
export function bunkerHazardDamage(kind,protection){
 if(kind==='airstrike')return protection.blastProtected?0:protection.underground?BUNKER_DEFENSE_DAMAGE.airstrikeUnsealed:BUNKER_DEFENSE_DAMAGE.airstrikeExposed;
 if(kind==='nuclear')return protection.blastProtected?0:protection.underground?BUNKER_DEFENSE_DAMAGE.nuclearUnsealed:BUNKER_DEFENSE_DAMAGE.nuclearExposed;
 if(kind==='fallout')return protection.falloutProtected?0:!protection.underground?BUNKER_DEFENSE_DAMAGE.falloutExposed:!protection.sealed?BUNKER_DEFENSE_DAMAGE.falloutUnsealed:BUNKER_DEFENSE_DAMAGE.falloutUnfiltered;
 return 0;
}
