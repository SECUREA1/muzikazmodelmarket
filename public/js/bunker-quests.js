import {isBunkerEnvironment} from './bunker-config.js';

// Operations can be selected in any order. Each is an ordered route of actual
// object interactions, confirmed by the existing authoritative site-quest flow.
const operations=[
 {id:'power',title:'01 · Black-start protocol',reward:500,contact:{id:'bunker-rook',name:'Rook Mercer',role:'Power & fabrication engineer'},description:'Enable the emergency power core and isolated relay, then read the operations terminal to verify the bunker handover.',objects:['bunker-power-core','bunker-power-relay','bunker-ops-terminal'],states:{'bunker-power-core':{switched:true},'bunker-power-relay':{switched:true}}},
 {id:'archive',title:'02 · Ghost archive',reward:650,contact:{id:'bunker-echo',name:'Echo Sato',role:'Archive custodian'},description:'Read the operations brief, inspect the fabrication bench, then consult the offline archive terminal to verify the enclave’s recovery records.',objects:['bunker-ops-terminal','bunker-fabrication-bench','bunker-archive-terminal']},
 {id:'evacuation',title:'03 · Safe passage',reward:550,contact:{id:'bunker-patch',name:'Dr. Patch Okafor',role:'Medic & habitat keeper'},description:'Inspect the medical recovery station, read the archive handover and confirm the extraction terminal briefing before the next crew shift.',objects:['bunker-med-station','bunker-archive-terminal','bunker-extraction-terminal']},
 {id:'shelter',title:'04 · Seal the vault',reward:700,contact:{id:'bunker-nyx',name:'Nyx Vale',role:'Shelter commander'},description:'Close the ingress blast shutter, enable the filtration unit, then inspect the alert console. The shutter must be closed and filtration running when you operate them.',objects:['bunker-ingress-shutter','bunker-filtration-unit','bunker-alert-console'],states:{'bunker-ingress-shutter':{open:false},'bunker-filtration-unit':{switched:true}}},
 {id:'reserves',title:'05 · Deep stores',reward:600,contact:{id:'bunker-patch',name:'Dr. Patch Okafor',role:'Medic & habitat keeper'},description:'Inspect the sealed emergency locker, check the reserve water station and read the radiation monitor. Keep the supplies inside the protected shelter while warnings are active.',objects:['bunker-emergency-locker','bunker-water-reserve','bunker-radiation-monitor']},
 {id:'continuity',title:'06 · Hold the signal',reward:750,contact:{id:'bunker-echo',name:'Echo Sato',role:'Archive & continuity custodian'},description:'Enable the backup power core and secure relay, then report to the operations terminal. Watch Shelter command for the current alert, crew response and protection status.',objects:['bunker-power-core','bunker-power-relay','bunker-ops-terminal'],states:{'bunker-power-core':{switched:true},'bunker-power-relay':{switched:true}}}
];

export function bunkerCampaignOffers(environment){
 if(!isBunkerEnvironment(environment))return [];
 const scene=environment.builderScene||environment.placementScene,objects=new Map((scene?.objects||[]).map(object=>[object.id,object]));
 return operations.map(operation=>{
  const sites=operation.objects.map(id=>{
   const object=objects.get(id),settings=object?.functionalSettings||{};
   if(!object||settings.enabled===false||!['talk','switch','door','heal'].includes(settings.behavior))return null;
   const point=object.position;
   if(!point||!['x','z'].every(axis=>Number.isFinite(point[axis])))return null;
   return {id,entityId:id,name:object.name||id,x:point.x,y:Number(point.y)||0,z:point.z,action:'interact',behavior:settings.behavior,interactionDistance:Math.max(1,Math.min(8,Number(settings.interactionDistance)||4)),prompt:settings.prompt||'Use '+(object.name||id),...(operation.states?.[id]?{requiredState:operation.states[id]}:{})};
  });
  // A partial campaign route must never award the complete operation reward.
  if(sites.some(site=>!site))return null;
  return {id:'map:'+encodeURIComponent(environment.id)+':operation-'+operation.id,title:operation.title,description:operation.description+' These campaign operations may be accepted in any order; follow this operation’s marked steps in order.',kind:'site-job',mode:'foot',siteQuest:true,mapId:environment.id,campaign:'ghostline',strictSites:true,reward:operation.reward,timeLimit:900,sites,authoredContactId:operation.contact.id,campaignContact:{name:operation.contact.name,role:operation.contact.role,channel:'Bunker crew comms',modelId:'world-resident',color:'#64f0be'}};
 }).filter(Boolean);
}
