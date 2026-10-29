const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const count=value=>Math.max(0,Number(value)||0).toLocaleString();
const records=value=>Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];
const finished=new Set(['delivered','cancelled','port-held']);
const phaseLabels={'port-transfer':'Dock truck on the shore freight road',loading:'Loading truck',driving:'Truck on its calculated route',unloading:'Unloading at the delivery approach',courier:'Carrying cargo to the drop-off',dropoff:'Confirming doorstep drop-off',delivered:'Dropped off · inventory received',blocked:'Cargo held · route needs clearance','port-held':'Cargo held at the receiving port',cancelled:'Delivery cancelled','awaiting-route':'Calculating delivery approach','awaiting-truck':'Waiting for an available delivery truck'};
export const deedDeliveryRecords=records;
export function deedDeliveryRoute(data,deedId,mapId){
 return records(data?.deliveryRoutes).find(route=>deedId?route.deedId===deedId:route.mapId===mapId)||null;
}
export function deedDeliveryTaskPresentation(task={}){
 const phase=task.phase||'awaiting-route';
 return {label:phaseLabels[phase]||'Preparing final delivery',progress:phase==='delivered'?1:Math.max(0,Math.min(.99,Number(task.stageProgress)||0)),finished:finished.has(phase)};
}
const metric=value=>Math.round(Math.max(0,Number(value)||0)).toLocaleString()+' m';
const eta=value=>{const seconds=Math.ceil(Math.max(0,Number(value)||0)/1000);return seconds<60?seconds+'s':Math.ceil(seconds/60)+' min';};
export function deedDeliveryRouteMarkup(route,{navigate=false,onwardMode='road'}={}){
 if(!route)return '<p class="supply-muted">The server calculates each receiving address approach from the latest map layout.</p>';
 const ready=route.status==='ready',dropoff=route.dropoff||{},kind=dropoff.kind==='doorstep'||dropoff.kind==='door'?'Doorstep drop-off':'Marked plot entrance',points=[...(route.truckWaypoints||[]),...(route.courierWaypoints||[])].filter(point=>Number.isFinite(point?.x)&&Number.isFinite(point?.z));
 let diagram='';
 if(points.length){
  const minX=Math.min(...points.map(point=>point.x)),maxX=Math.max(...points.map(point=>point.x)),minZ=Math.min(...points.map(point=>point.z)),maxZ=Math.max(...points.map(point=>point.z)),width=Math.max(10,maxX-minX),height=Math.max(10,maxZ-minZ),scale=Math.min(500/width,130/height),offsetX=(560-(maxX-minX)*scale)/2,offsetZ=(180-(maxZ-minZ)*scale)/2;
  const plot=point=>[(point.x-minX)*scale+offsetX,(point.z-minZ)*scale+offsetZ],line=(waypoints,color,dash='')=>{const safe=(waypoints||[]).filter(point=>Number.isFinite(point?.x)&&Number.isFinite(point?.z));return safe.length>1?'<polyline points="'+safe.map(point=>plot(point).join(',')).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="4"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>':'';};
  const start=plot(points[0]),end=plot(points.at(-1));
  diagram='<svg class="supply-delivery-diagram" viewBox="0 0 560 180" role="img" aria-label="Calculated local truck route and final walking approach">'+line(route.truckWaypoints,'#89dac6')+line(route.courierWaypoints,'#ffcc78','6 4')+'<circle cx="'+start[0]+'" cy="'+start[1]+'" r="7" fill="#89dac6"/><rect x="'+(end[0]-7)+'" y="'+(end[1]-7)+'" width="14" height="14" rx="3" fill="#ffcc78"/></svg>';
 }
 return '<div class="supply-delivery-route" data-delivery-route-status="'+esc(route.status||'blocked')+'"><strong>'+esc(kind+' · '+(dropoff.name||route.deedId||'Delivery entrance'))+'</strong><p>'+esc(ready?'Clear approach calculated from the current map.':'Delivery is on hold. '+(route.reason||route.blockedReason||'The approach needs clearance.'))+'</p>'+diagram+'<div class="supply-delivery-metrics"><span>Truck: '+metric(route.truckDistanceMeters)+'</span><span>Door approach: '+metric(route.courierDistanceMeters)+'</span><span>Estimated final delivery: '+eta(route.estimatedDurationMs)+'</span></div><ol class="supply-delivery-chain"><li>Factory packing</li><li>Verified sea passage</li><li>Receiving port · shore truck loads</li>'+ (onwardMode==='air'?'<li>Departure cargo apron · load and secure aircraft</li><li>Verified flight · stopped receiving apron unload</li><li>Receiving airfield · shore truck connection</li>':'')+'<li>Inter-map freight link</li><li>Calculated local truck route</li><li>'+esc(kind)+'</li></ol><small>Green: truck route · Gold: final walking approach. Separate map rooms use a freight transfer; the local route is calculated inside the receiving map.</small>'+(navigate&&dropoff.mapId?'<button type="button" data-delivery-navigate="'+esc(dropoff.mapId)+'">Visit delivery drop-off</button>':'')+'</div>';
}
export function deedDeliveryTasksMarkup(tasks=[]){
 const rows=records(tasks);
 if(!rows.length)return '';
 const priority=task=>['port-transfer','driving','courier','unloading','dropoff','loading','blocked'].includes(task.phase)?0:finished.has(task.phase)?2:1,visible=rows.slice().sort((a,b)=>priority(a)-priority(b)).slice(0,6),delivered=rows.filter(task=>task.phase==='delivered').length;
 return '<div class="supply-road-tasks"><strong>Port → trucks → receiving drop-off</strong><small>'+count(delivered)+' / '+count(rows.length)+' truck loads dropped off'+(rows.length>visible.length?' · showing '+visible.length+' current loads':'')+'</small>'+visible.map(task=>{const view=deedDeliveryTaskPresentation(task);return '<article class="supply-road-task" data-delivery-task="'+esc(task.id)+'"><span>'+count(task.quantity)+' units · '+count(task.crateCount)+' freight crates</span><span>'+esc(view.label)+'</span>'+(task.airTaskId?'<small>Verified air freight received · final truck delivery</small>':'')+'<progress max="1" value="'+view.progress+'" aria-label="Current delivery stage progress"></progress>'+(task.blockedReason?'<small>'+esc(task.blockedReason)+'</small>':'')+(task.deliveredAt?'<small>Drop-off confirmed · '+esc(new Date(task.deliveredAt).toLocaleString())+'</small>':'')+'</article>';}).join('')+'</div>';
}
