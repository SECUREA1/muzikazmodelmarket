import {builderBaseEnvironment,builderBaseSpawn} from './environments/builder-base.js';
// Shared fictional emergency exercise sites. Authored coordinates take
// precedence; every other world starts near its own arrival point.
export const DOOMSDAY_AIRCRAFT_IDS = Object.freeze(['doomsday-command-aircraft','doomsday-evacuation-aircraft']);
export const DOOMSDAY_MODEL_INFO = Object.freeze({
 'doomsday-command-aircraft':['Nightfall Command Aircraft','Unarmed flyable continuity aircraft with a protected communications dome and emergency relay antennas.',[11.9,3.5,8.1]],
 'doomsday-evacuation-aircraft':['Daybreak Evacuation Aircraft','Unarmed flyable emergency aircraft with rescue markings, first-aid cargo and a working cockpit.',[11.9,2.7,8.1]],
 'nuclear-warning-beacon':['Nuclear Warning Siren','Civil-defense mast with twin siren horns, an amber beacon and a radiation warning panel.',[1.8,3.8,1.1]],
 'fallout-shelter':['Fallout Continuity Shelter','Enterable reinforced emergency shelter with an illuminated entrance, clear walking aisle, benches, first aid, water and a radio station.',[10,3.4,8]],
 'emergency-supply-cache':['Emergency Supply Cache','Sealed recovery crates with water, first-aid and communications markings.',[2.2,1.3,1.2]]
});
const objectiveSpecs = [
 ['shelter','Continuity shelter','Reach the marked shelter. Cole confirms your arrival automatically.','warning',-6,0],
 ['supplies','Emergency supply cache','Reach the sealed relief crates to collect emergency supplies.','fallout',0,-6],
 ['recovery','Recovery relay','Reach the marked recovery relay to restore emergency communications.','recovery',6,0]
];
export function doomsdayForEnvironment(environment={}) {
 const config=environment.doomsday||environment.builderScene?.layoutMeta?.doomsday||environment.builderScene?.baseEnvironment?.doomsday||{},spawn=(environment.builderScene?builderBaseSpawn(environment):null)||environment.spawn?.position||environment.spawn||{};
 const half=Math.max(5,(Number(environment.builderScene?.mapSize||environment.playableSize)||40)/2-3);
 const proceduralBounds=!!environment.builderScene&&!builderBaseEnvironment(environment);
 const bounded=value=>proceduralBounds?Math.max(-half,Math.min(half,Number(value)||0)):Number(value)||0;
 const authored=new Map((config.objectives||[]).map(item=>[item.id,item]));
 // A placed shelter supplies its own checkpoint unless a map author chose one.
 const placedPoint=object=>object.position||object.transform?.position;
 const shelter=(environment.builderScene?.objects||[]).filter(object=>(object.modelId||object.asset?.buildAssetId)==='fallout-shelter'&&['x','y','z'].every(axis=>Number.isFinite(placedPoint(object)?.[axis]))).sort((a,b)=>Math.hypot(placedPoint(a).x-(spawn.x||0),placedPoint(a).z-(spawn.z||0))-Math.hypot(placedPoint(b).x-(spawn.x||0),placedPoint(b).z-(spawn.z||0)))[0];
 if(shelter&&!builderBaseEnvironment(environment)&&!authored.has('shelter')){
  const position=shelter.position||shelter.transform?.position;
  if(position&&['x','y','z'].every(axis=>Number.isFinite(position[axis])))authored.set('shelter',{position:{...position},name:'Continuity shelter',description:'Enter the illuminated doorway. Listen for Cole, then collect relief supplies and restore the relay.',arrivalZone:{yaw:Number(shelter.rotation?.y||shelter.transform?.rotation?.y)||0,halfWidth:4.6*Math.abs(Number((shelter.scale||shelter.transform?.scale)?.x)||1),halfDepth:3.8*Math.abs(Number((shelter.scale||shelter.transform?.scale)?.z)||1)}});
 }
 return {...config,enabled:config.enabled!==false,objectives:objectiveSpecs.map(([id,name,description,phase,dx,dz])=>{
  const item=authored.get(id)||{},point=item.position||{};
  return {id,name,description,phase,...item,position:{x:Number.isFinite(point.x)?point.x:bounded((Number(spawn.x)||0)+dx),y:Number(point.y??spawn.y)||0,z:Number.isFinite(point.z)?point.z:bounded((Number(spawn.z)||0)+dz)}};
 })};
}
