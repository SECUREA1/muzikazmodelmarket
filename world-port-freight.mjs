// Counted cargo stays in receiving escrow while the port truck moves between
// the quay, shore warehouse and cargo apron. These are server-owned schedules,
// separate from the receiving map's road/courier route and coordinate system.
export const PORT_FREIGHT_RULES=Object.freeze({truckSpeedMps:5,handlingMs:4500,departureHeadwayMs:1500});
const finite=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
const gap=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const fail=message=>{throw Object.assign(Error(message),{statusCode:409});};
function pose(points,progress){
 const lengths=points.slice(1).map((point,index)=>gap(point,points[index])),total=lengths.reduce((a,b)=>a+b,0);let remaining=Math.max(0,Math.min(1,progress))*total;
 for(let index=0;index<lengths.length;index++){
  if(remaining<=lengths[index]||index===lengths.length-1){const a=points[index],b=points[index+1],t=lengths[index]?Math.min(1,remaining/lengths[index]):1;return {position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},rotationY:Math.atan2(a.x-b.x,a.z-b.z)};}
  remaining-=lengths[index];
 }
 return {position:{...points[0]},rotationY:0};
}
export function createPortTransfer(ledger,{id,mapId,portId,name,waypoints},now){
 if(!id||!mapId||!portId||!Array.isArray(waypoints)||waypoints.length<2||waypoints.length>400||!waypoints.every(finite))fail('This port has no validated shore freight connection.');
 ledger.portDeliveryNextDepartureAt ||= {};
 const key=mapId+':'+portId,startedAt=Math.max(now,ledger.portDeliveryNextDepartureAt[key]||0),distanceMeters=waypoints.slice(1).reduce((sum,point,index)=>sum+gap(point,waypoints[index]),0),driveDurationMs=Math.max(500,Math.ceil(distanceMeters/PORT_FREIGHT_RULES.truckSpeedMps*1000));
 ledger.portDeliveryNextDepartureAt[key]=startedAt+PORT_FREIGHT_RULES.departureHeadwayMs;
 return {id,mapId,portId,name:name||'Port freight transfer',waypoints:waypoints.map(point=>({...point})),phase:startedAt>now?'queued':'loading',createdAt:now,startedAt,lastAdvancedAt:startedAt,elapsedMs:0,distanceMeters,handlingDurationMs:PORT_FREIGHT_RULES.handlingMs,driveDurationMs,totalDurationMs:PORT_FREIGHT_RULES.handlingMs+driveDurationMs,readyAt:startedAt+PORT_FREIGHT_RULES.handlingMs+driveDurationMs,updatedAt:now};
}
export function advancePortTransfer(transfer,now,{held=false}={}){
 if(!transfer||transfer.phase==='complete')return transfer;
 if(held){transfer.phase='blocked';transfer.lastAdvancedAt=Math.max(transfer.startedAt,now);transfer.updatedAt=now;return transfer;}
 if(now<transfer.startedAt){transfer.phase='queued';return transfer;}
 transfer.elapsedMs=Math.min(transfer.totalDurationMs,Math.max(0,transfer.elapsedMs||0)+Math.max(0,now-transfer.lastAdvancedAt));transfer.lastAdvancedAt=now;transfer.updatedAt=now;
 transfer.phase=transfer.elapsedMs>=transfer.totalDurationMs?'complete':transfer.elapsedMs<transfer.handlingDurationMs?'loading':'driving';
 transfer.readyAt=now+Math.max(0,transfer.totalDurationMs-transfer.elapsedMs);
 if(transfer.phase==='complete')transfer.completedAt=now;
 return transfer;
}
export function portTransferView(transfer,now=transfer?.lastAdvancedAt){
 if(!transfer)return null;
 const elapsed=Math.max(0,transfer.elapsedMs||0),motion=elapsed<transfer.handlingDurationMs?'loading':'driving',phase=transfer.phase==='complete'?'complete':transfer.phase==='blocked'?'blocked':now<transfer.startedAt?'queued':motion,offset=motion==='driving'?transfer.handlingDurationMs:0,duration=motion==='driving'?transfer.driveDurationMs:transfer.handlingDurationMs,progress=transfer.phase==='complete'?1:Math.max(0,Math.min(1,(elapsed-offset)/duration)),at=pose(transfer.waypoints,motion==='driving'?progress:0);
 return {...transfer,phase,...at,stageStartedAt:transfer.lastAdvancedAt-(elapsed-offset),stageDurationMs:duration,stageProgress:progress,progress};
}
export function portTransferProjection(transfer,now){
 const view=portTransferView(transfer,now);if(!view||view.phase==='queued'||view.phase==='complete')return null;
 return {id:transfer.id,mapId:transfer.mapId,phase:view.phase==='driving'?'driving':view.phase==='blocked'?'blocked':'loading',deliveryPhase:'port-transfer',modelId:'frontier-pickup',position:view.position,rotationY:view.rotationY,waypoints:view.phase==='driving'?transfer.waypoints:[view.position],stageStartedAt:view.stageStartedAt,stageDurationMs:view.stageDurationMs,stageProgress:view.stageProgress,progress:view.stageProgress,updatedAt:transfer.updatedAt,routeId:'port-route:'+transfer.id};
}
export function portTransferRoute(transfer){
 return {id:'port-route:'+transfer.id,mapId:transfer.mapId,revision:'port-freight-v1',kind:'port-transfer',status:transfer.phase==='blocked'?'blocked':'ready',name:transfer.name,truckWaypoints:transfer.waypoints.map(point=>({...point})),courierWaypoints:[],truckDistanceMeters:transfer.distanceMeters,courierDistanceMeters:0,dropoff:{id:'port-bay:'+transfer.portId,mapId:transfer.mapId,kind:'port-freight-bay',name:transfer.name,position:{...transfer.waypoints.at(-1)}}};
}
