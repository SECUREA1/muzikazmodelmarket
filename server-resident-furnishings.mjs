import {createHash} from 'node:crypto';
import {compileBuilderScene} from './public/js/builder-gameplay-pipeline.js';
import {planResidentFurnishings} from './public/js/resident-furnishings.js';

const VERSION='resident-furnishings-v1';
function layoutKey(environment,objects){
 const scene=environment.builderScene||{};
 const source=JSON.stringify([Object.values(objects||{}).map(item=>[item.id,item.deleted,item.materialId,item.position,item.rotation,item.scale]),VERSION,environment.id,environment.contentUpdatedAt||environment.updatedAt||'',environment.game,scene.layout,scene.mapSize,scene.baseTransform,scene.baseEnvironment?.modelUrl,environment.modelUrl,environment.modelUrls,environment.spawn,environment.streets,scene.streets,scene.layoutMeta?.locations||scene.layoutMeta?.commonsLocations||environment.layoutMeta?.locations,(scene.objects||[]).map(item=>[item.id,item.modelId,item.position,item.rotation,item.scale,item.functionalSettings?.behavior])]);
 return VERSION+':'+createHash('sha256').update(source).digest('hex');
}
const owned=actor=>actor?.runtimeResidentFurnishing===true&&actor.residentFurnishing===true&&String(actor.id||'').startsWith('resident-furnishing-');

// Called at room initialization, before people choose homes. These fixtures are
// shared solid actors, not inventory grants or modifications to an authored map.
export function ensureResidentFurnishings(sim,environment,collision,objects={},now=Date.now()){
 if(!sim||!environment)return [];
 sim.actors||={};const key=layoutKey(environment,objects),existing=Object.values(sim.actors).filter(owned),state=sim.residentFurnishingState;
 if(state?.layoutKey===key&&(state.complete||now<(state.retryAt||0)))return existing;
 for(const actor of existing){delete sim.actors[actor.id];if(sim.devices)delete sim.devices[actor.id];}
 const records=planResidentFurnishings(environment,{collision,sim,objects,maxProps:6}),created=[];
 for(const source of records){
  // A customer's authored actor may use any ID. Never replace one even when
  // it happens to match the deterministic name of a generated room fixture.
  if(sim.actors[source.id])continue;
  const record={...source,functionalSettings:{...source.functionalSettings,behavior:'decor',residentFurnishing:true,destructible:false}};
  const definition=compileBuilderScene({objects:[record]}).objects[0];
  const actor={id:record.id,name:record.name,modelId:record.modelId,spawned:true,residentFurnishing:true,runtimeResidentFurnishing:true,residentFurnitureLayoutKey:key,locationId:record.locationId,residentAmenity:record.residentAmenity,residentApproach:record.approach||null,asset:{buildAssetId:record.modelId,name:record.name},definition,active:true,health:100,destructible:false,placementRevision:1,position:{...record.position},rotation:{...record.rotation},scale:{...record.scale}};
  sim.actors[actor.id]=actor;created.push(actor);
 }
 // An occupied floor can become clear later; retries are bounded and never
 // displace a visitor or reset furnishings on ordinary joins.
 sim.residentFurnishingState={version:VERSION,layoutKey:key,complete:created.length>0,retryAt:created.length?0:now+60000,checkedAt:now};
 return created;
}
