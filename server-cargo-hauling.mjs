import {cargoCapacity,isPickup,isCargoTrailer,TRAILER_ID,freightHubs,trailerPose} from './public/js/cargo-hauling.js';
import {roadNetwork,roadPath,nearestRoadNode} from './public/js/road-network.js';
import {questRadio} from './server-quest-radio.mjs';
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function freightState(actor){return actor.freight||={crates:[],secured:true};}
export function createCargoTrailer(sim,id,truck,{attached=false,trafficAI=false}={}){
 const yaw=truck.rotation?.y||0,position={x:truck.position.x+Math.sin(yaw)*5.45,y:truck.position.y,z:truck.position.z+Math.cos(yaw)*5.45};
 const actor=sim.actors[id]={id,modelId:TRAILER_ID,name:'Frontier cargo trailer',asset:{buildAssetId:TRAILER_ID},position,rotation:{x:0,y:yaw,z:0},scale:{x:1,y:1,z:1},active:true,spawned:true,health:350,trafficAI,freight:{crates:[],secured:true},definition:{objectId:id,modelId:TRAILER_ID,gameplay:{behavior:'interact',enabled:true,prompt:'Hitch from a parked Frontier pickup'},movement:{speed:0}}};
 if(attached){truck.trailerId=id;actor.towVehicleId=truck.id;}return actor;
}
export function ensureFreight(sim,environment,collision,objects={}){
 const base=freightHubs(environment),known=new Set(base.map(h=>h.id)),custom=Object.values(sim.actors).filter(a=>!a.freightHub&&!known.has(a.id)&&a.active!==false&&(a.asset?.buildAssetId||a.modelId)==='freight-loading-bay').map(a=>({id:a.id,name:a.name||'Custom freight bay',...a.position})),desired=[...base,...custom],signature=JSON.stringify(desired);
 if(sim.freightLayoutSignature!==signature){sim.freightLayoutSignature=signature;sim.freightHubs=desired.flatMap(hub=>{const floor=collision?.groundAt(environment,hub,{actors:sim.actors,objects})||(!collision&&hub);return floor&&(!collision||collision.hasBodyClearance(environment,floor,1,{actors:sim.actors,objects}))?[{...hub,y:floor.y}]:[];});
  for(const hub of sim.freightHubs)sim.actors[hub.id]||={id:hub.id,name:hub.name,modelId:'freight-loading-bay',asset:{buildAssetId:'freight-loading-bay'},position:{x:hub.x,y:hub.y,z:hub.z},rotation:{x:0,y:0,z:0},active:true,spawned:true,health:100,freightHub:true,definition:{objectId:hub.id,modelId:'freight-loading-bay',gameplay:{behavior:'interact',enabled:true,prompt:'Freight loading bay · park a pickup nearby'}}};
 }
 for(const truck of Object.values(sim.actors))if(isPickup(truck)&&truck.roadFleet&&!truck.freightTrailerCreated){const trailer=createCargoTrailer(sim,truck.id+'-trailer',truck),floor=collision?.groundAt(environment,trailer.position,{actors:Object.fromEntries(Object.entries(sim.actors).filter(([id])=>id!==trailer.id)),objects});if(collision&&(!floor||!collision.hasBodyClearance(environment,floor,1.1,{actors:Object.fromEntries(Object.entries(sim.actors).filter(([id])=>id!==trailer.id&&id!==truck.id)),objects}))){delete sim.actors[trailer.id];continue;}if(floor)trailer.position=floor;truck.freightTrailerCreated=true;}
}
export function cargoCommand(sim,truck,operation,now,{hubId,count=1,destinationId,manifestId}={}){
 if(!isPickup(truck)||truck.active===false)throw Error('Enter a Frontier pickup to use cargo controls.');
 if(Math.abs(truck.driving?.speed||0)>.25)throw Error('Park before hitching or handling cargo.');
 const trailer=sim.actors[truck.trailerId],carriers=[truck,...(trailer?.towVehicleId===truck.id&&trailer.active!==false?[trailer]:[])];
 if(operation==='hitch'){
  if(trailer)throw Error('A trailer is already attached.');const yaw=truck.rotation?.y||0,hitch={x:truck.position.x+Math.sin(yaw)*2.85,z:truck.position.z+Math.cos(yaw)*2.85};
  const target=Object.values(sim.actors).filter(a=>isCargoTrailer(a)&&a.active!==false&&!a.towVehicleId&&!a.trafficAI).map(a=>({a,tongue:{x:a.position.x-Math.sin(a.rotation?.y||0)*2.6,z:a.position.z-Math.cos(a.rotation?.y||0)*2.6}})).filter(p=>gap(p.tongue,hitch)<2&&Math.abs(p.a.position.y-truck.position.y)<.6).sort((a,b)=>gap(a.tongue,hitch)-gap(b.tongue,hitch))[0]?.a;
  if(!target)throw Error('Reverse the rear hitch to within 2 m of a free trailer tongue.');truck.trailerId=target.id;target.towVehicleId=truck.id;return 'Trailer hitched. Eight additional crate slots available.';
 }
 if(operation==='unhitch'){if(!trailer)throw Error('No trailer is attached.');if(!freightState(trailer).secured)throw Error('Secure the trailer load before unhitching.');delete trailer.towVehicleId;delete truck.trailerId;truck.driving.trailerLoad=0;return 'Trailer parked and unhitched; its cargo stays aboard.';}
 if(operation==='secure'){for(const carrier of carriers)freightState(carrier).secured=true;return 'Crates stacked in slots and secured with tie-down straps.';}
 const hub=(sim.freightHubs||[]).filter(h=>!hubId||h.id===hubId).sort((a,b)=>gap(a,truck.position)-gap(b,truck.position))[0];if(!hub||gap(hub,truck.position)>9)throw Error('Park within 9 m of the marked freight bay.');
 if(operation==='load'){
  count=Number(count);if(!Number.isSafeInteger(count)||count<1||count>12)throw Error('Choose between 1 and 12 crates.');const free=carriers.reduce((sum,a)=>sum+cargoCapacity(a)-freightState(a).crates.length,0);if(count>free)throw Error('Not enough cargo slots. Attach an empty trailer or unload first.');
  const destination=(sim.freightHubs||[]).find(h=>destinationId?h.id===destinationId:h.id!==hub.id);if(!destination||destination.id===hub.id)throw Error('Choose another shipping bay for delivery.');
  for(let i=0;i<count;i++){const carrier=carriers.find(a=>freightState(a).crates.length<cargoCapacity(a)),f=freightState(carrier);f.crates.push({id:'crate-'+truck.id+'-'+now+'-'+i,sourceId:hub.id,destinationId:destination.id,manifestId:manifestId||null,label:'Supply crate',massKg:125});f.secured=false;}
  return count+' crates loaded. Stack and secure before driving.';
 }
 if(operation==='unload'){
  const delivered=carriers.flatMap(a=>freightState(a).crates).filter(c=>c.destinationId===hub.id&&(!manifestId||c.manifestId===manifestId));if(!delivered.length)throw Error('This bay is not the destination for your cargo.');if(count>1&&delivered.length<count)throw Error('Bring the complete manifest to the destination.');if(carriers.some(a=>!freightState(a).secured))throw Error('Secure the load before handing it over.');
  for(const carrier of carriers){const f=freightState(carrier);f.crates=f.crates.filter(c=>!delivered.includes(c));}
  sim.freightDeliveries||=[];sim.freightDeliveries.push({truckId:truck.id,hubId:hub.id,count:delivered.length,manifestId:manifestId||null,at:now});sim.freightDeliveries=sim.freightDeliveries.slice(-40);return delivered.length+' crates delivered and checked into shipping.';
 }
 throw Error('Choose hitch, unhitch, load, secure or unload.');
}
export function stepCargoTrailers(sim,environment,dt,collision,objects={}){
 for(const trailer of Object.values(sim.actors))if(isCargoTrailer(trailer)&&trailer.towVehicleId&&sim.actors[trailer.towVehicleId]?.active!==true){const truck=sim.actors[trailer.towVehicleId];if(truck)delete truck.trailerId;delete trailer.towVehicleId;}
 for(const truck of Object.values(sim.actors))if(isPickup(truck)&&truck.active!==false){const trailer=sim.actors[truck.trailerId];if(!trailer||trailer.towVehicleId!==truck.id||trailer.active===false){delete truck.trailerId;continue;}
  const pose=trailerPose(truck,trailer,dt),others=Object.fromEntries(Object.entries(sim.actors).filter(([id])=>id!==truck.id&&id!==trailer.id)),floor=collision?.groundAt(environment,pose.position,{actors:others,objects});if(floor)pose.position.y=floor.y;Object.assign(trailer,pose);trailer.driving={...truck.driving};const f=freightState(trailer);truck.driving.trailerLoad=f.crates.length;truck.driving.cargoSecured=freightState(truck).secured&&f.secured;
 }
}
export function freightTrailerBlocked(sim,truck,from,to,yaw,collision,environment,objects={}){
 const trailer=sim.actors[truck.trailerId];if(!trailer)return false;const pose=trailerPose({...truck,position:to,rotation:{y:yaw}},trailer,.05),others={...sim.actors,[truck.id]:{...truck,active:false},[trailer.id]:{...trailer,active:false}};
 const probe=()=>{for(const side of [-.9,0,.9])for(const end of [-1.6,1.6]){const p={x:pose.position.x+Math.cos(pose.rotation.y)*side+Math.sin(pose.rotation.y)*end,y:pose.position.y,z:pose.position.z-Math.sin(pose.rotation.y)*side+Math.cos(pose.rotation.y)*end},floor=collision.groundAt(environment,p,{actors:others,objects});if(!floor||Math.abs(floor.y-to.y)>.65||!collision.hasBodyClearance(environment,floor,.2,{actors:others,objects}))return true;}return false;};
 // The six footprint samples share one proposed pose and actor membership.
 // Classify its candidates once, including when called inside a truck substep.
 return collision.withActorCandidates?collision.withActorCandidates(others,probe):probe();
}
export function freightRoute(environment,fromHub,toHub){const network=roadNetwork(environment);return roadPath(network,nearestRoadNode(network,fromHub),nearestRoadNode(network,toHub));}
export function stepFreightCrew(sim,npc,environment,now,dt,collision,objects,follow){
 if(!isPickup(npc))return false;const hubs=sim.freightHubs||[];if(hubs.length<2)return false;
 if(!npc.freightRun){const source=[...hubs].sort((a,b)=>gap(a,npc.position)-gap(b,npc.position))[0],destination=hubs.find(h=>h.id!==source.id),route=freightRoute(environment,source,destination);if(route.length<2)return false;
  if(!npc.trailerId)createCargoTrailer(sim,npc.id+'-trailer',npc,{attached:true,trafficAI:true});
  npc.freightRun={sourceId:source.id,destinationId:destination.id,phase:gap(source,npc.position)<9?'loading':'approaching pickup',nextAt:now,manifestId:npc.id+'-'+now,loaded:0};npc.roadRoute=npc.freightRun.phase==='loading'?route:roadPath(roadNetwork(environment),nearestRoadNode(roadNetwork(environment),npc.position),source.roadIndex);npc.roadIndex=0;
 }
 const run=npc.freightRun,source=hubs.find(h=>h.id===run.sourceId),destination=hubs.find(h=>h.id===run.destinationId);npc.trafficJob={title:'Trailer freight · '+destination.name,phase:run.phase,completed:npc.freightCompleted||0};
 try{
  if(run.phase==='approaching pickup'){if(follow(sim,npc,environment,now,dt,collision,objects)){npc.driving.speed=0;run.phase='loading';run.nextAt=now+1000;}return true;}
  if(run.phase==='loading'){
   npc.driving.speed=0;npc.driving.parked=true;if(now<run.nextAt)return true;
   cargoCommand(sim,npc,'load',now,{hubId:source.id,count:1,destinationId:destination.id,manifestId:run.manifestId});run.loaded++;run.nextAt=now+900;
   const worker=Object.values(sim.actors).find(a=>a.id.startsWith('road-service-worker-'));if(worker){worker.position={x:npc.position.x+2.7,y:npc.position.y,z:npc.position.z+1};worker.speakingUntil=now+1500;worker.speaking=true;}
   if(run.loaded===8){run.phase='stacking and securing';run.nextAt=now+2500;questRadio(sim,now,npc.name,'Eight crates loaded. Stacking and securing the trailer before departure.');}return true;
  }
  if(run.phase==='stacking and securing'){if(now<run.nextAt)return true;cargoCommand(sim,npc,'secure',now);npc.roadRoute=freightRoute(environment,source,destination);npc.roadIndex=0;run.phase='shipping to destination';questRadio(sim,now,npc.name,'Manifest checked. Delivering eight crates to '+destination.name+'.');return true;}
  if(run.phase==='shipping to destination'){if(follow(sim,npc,environment,now,dt,collision,objects)){run.phase='unloading';run.nextAt=now+3000;}return true;}
  if(run.phase==='unloading'){npc.driving.speed=0;if(now<run.nextAt)return true;cargoCommand(sim,npc,'unload',now,{hubId:destination.id,count:8,manifestId:run.manifestId});npc.freightCompleted=(npc.freightCompleted||0)+1;run.phase='shipping paperwork';run.nextAt=now+5000;questRadio(sim,now,'Shipping crew',npc.name+', eight crates received and stacked. Delivery '+npc.freightCompleted+' complete.');return true;}
  if(now>=run.nextAt)delete npc.freightRun;
 }catch(error){npc.driving.speed=0;npc.trafficJob.phase='waiting for clear loading access';if(!run.reported){questRadio(sim,now,npc.name,'Holding safely: '+error.message);run.reported=true;}}
 return true;
}
