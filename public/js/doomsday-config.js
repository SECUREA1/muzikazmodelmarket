import {builderBaseEnvironment,builderBaseSpawn} from './environments/builder-base.js';
// Shared fictional emergency exercise sites. Authored coordinates take
// precedence; every other world starts near its own arrival point.
export const DOOMSDAY_AIRCRAFT_IDS = Object.freeze(['doomsday-command-aircraft','doomsday-evacuation-aircraft']);
export const DOOMSDAY_MODEL_INFO = Object.freeze({
 'doomsday-command-aircraft':['Nightfall Command Aircraft','Unarmed flyable continuity aircraft with a protected communications dome and emergency relay antennas.',[11.9,3.5,8.1]],
 'doomsday-evacuation-aircraft':['Daybreak Evacuation Aircraft','Unarmed flyable emergency aircraft with rescue markings, first-aid cargo and a working cockpit.',[11.9,2.7,8.1]],
 'nuclear-warning-beacon':['Nuclear Warning Siren','Civil-defense mast with twin siren horns, an amber beacon and a radiation warning panel.',[1.8,3.8,1.1]],
 'fallout-shelter':['Fallout Continuity Shelter','Enterable reinforced emergency shelter with an open entrance, benches and an illuminated shelter marker.',[10,3.4,8]],
 'emergency-supply-cache':['Emergency Supply Cache','Sealed recovery crates with water, first-aid and communications markings.',[2.2,1.3,1.2]]
});
const objectiveSpecs = [
 ['shelter','Continuity shelter','Reach the marked shelter and check in with the emergency team.','warning',-6,0],
 ['supplies','Emergency supply cache','Recover emergency supplies at the marked relief point.','fallout',0,-6],
 ['recovery','Recovery relay','Restore the marked community recovery relay.','recovery',6,0]
];
export function doomsdayForEnvironment(environment={}) {
 const config=environment.doomsday||{},spawn=(environment.builderScene?builderBaseSpawn(environment):null)||environment.spawn?.position||environment.spawn||{};
 const half=Math.max(5,(Number(environment.builderScene?.mapSize||environment.playableSize)||40)/2-3);
 const proceduralBounds=!!environment.builderScene&&!builderBaseEnvironment(environment);
 const bounded=value=>proceduralBounds?Math.max(-half,Math.min(half,Number(value)||0)):Number(value)||0;
 const authored=new Map((config.objectives||[]).map(item=>[item.id,item]));
 return {...config,enabled:config.enabled!==false,objectives:objectiveSpecs.map(([id,name,description,phase,dx,dz])=>{
  const item=authored.get(id)||{},point=item.position||{};
  return {id,name,description,phase,...item,position:{x:Number.isFinite(point.x)?point.x:bounded((Number(spawn.x)||0)+dx),y:Number(point.y??spawn.y)||0,z:Number.isFinite(point.z)?point.z:bounded((Number(spawn.z)||0)+dz)}};
 })};
}
