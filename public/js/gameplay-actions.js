import {roadVehicleType} from './road-vehicles.js';
import {watercraftInteractionPoint,watercraftInteractionReach} from './harbor-water.js';
import {deviceDefinition} from './interactive-devices.js';
import {residentCanInteract,residentCanTalk,residentContactDistance} from './resident-social-prompt.js';
const labels={talk:'Talk',quest:'View quest',seat:'Sit down',heal:'Restore health',pickup:'Pick up item',hold:'Hold item',door:'Open / close door',switch:'Toggle switch',interact:'Use item',vehicle:'Enter vehicle',trigger:'Activate',hazard:'Disarm'};
const none=()=>({kind:'none',prompt:'',label:'',title:'',hint:'',vehicleActive:false});
function action(kind,key,label,extra={}){return {kind,key,prompt:key.toUpperCase()+' — '+label,label,title:label.toUpperCase(),hint:'Tap or click · '+key.toUpperCase(),vehicleActive:false,...extra};}
export function sharedNearbyActions(self,actors={},manifest={},key=null,crew=null){
 if(!self)return [];
 if(self.health<=0)return [action('respawn','r','Respawn')];
 if(self.vehicleId)return [action('vehicle','f','Exit vehicle',{vehicleActive:true})];
 if(self.seatedId)return [action('item','e','Stand up')];
 if(self.heldId&&!key)return [action('drop','g','Drop held item')];
 const authored=new Map((manifest.actors||[]).map(actor=>[actor.objectId,actor.gameplay]));
 const choices=[];
 for(const actor of Object.values(actors)){
  if(actor.active===false||actor.loot||actor.holderId&&actor.holderId!==self.id)continue;
  if(actor.resident){
   if(key&&key!=='e'||!residentCanInteract(self.position,actor))continue;
   const label='Talk to '+(actor.resident.name||actor.name||'resident');
   choices.push({distance:residentContactDistance(self.position,actor.position),...action('resident','e',label,{entityId:actor.id,resident:true})});
   continue;
  }
  const config=authored.get(actor.id)||actor.definition?.gameplay||(actor.worldGateway?{behavior:'interact',action:'teleport',interactionDistance:5,prompt:actor.worldGateway.name}:null);
  if(!config||['decor','hostile','patrol'].includes(config.behavior)&&(!config.action||config.action==='none'))continue;
  const nextKey=config.behavior==='vehicle'?'f':config.interactionKey||'e';if(key&&key!==nextKey)continue;
  const point=watercraftInteractionPoint(actor,self.position),distance=Math.hypot(point.x-self.position.x,point.y-self.position.y,point.z-self.position.z);
  if(distance>watercraftInteractionReach(actor,self.position,config.interactionDistance||3))continue;
  const label=config.urbanMission?'Start courier mission':(actor.construction?'Operate '+(actor.name||roadVehicleType(actor)?.name||actor.modelId)+(actor.construction.crewOperator?' · take over from crew':''):config.prompt)||labels[config.behavior]||'Use item';
  const portal=Boolean(actor.worldGateway||config.action==='teleport'&&config.portal?.destinationType==='map'),device=deviceDefinition(actor.asset?.buildAssetId||actor.modelId,config),arcade=device&&['arcade','slots','poker','trivia'].includes(device.kind);
  choices.push({distance,...action(config.behavior==='vehicle'?'vehicle':'item',nextKey,label,{entityId:actor.id,portal,...(portal?{title:'ENTER WORLD',hint:actor.worldGateway?.name||label}:arcade?{title:'OPEN ARCADE',hint:device.name||label,label:'Open '+(device.name||label)}:{})})});
 }
 for(const worker of crew?.workers||[]){if(key&&key!=='e'||!worker.position||worker.active===false||(worker.health??100)<=0)continue;const p=worker.position,distance=residentContactDistance(self.position,p);if(residentCanTalk(self.position,p))choices.push({distance,...action('resident','e','Talk to '+worker.name,{entityId:worker.id,resident:true})});}
 return choices.sort((a,b)=>a.distance-b.distance||a.entityId.localeCompare(b.entityId)).map(({distance,...result})=>result);
}
export function sharedNearbyAction(self,actors={},manifest={},key=null){return sharedNearbyActions(self,actors,manifest,key)[0]||none();}
