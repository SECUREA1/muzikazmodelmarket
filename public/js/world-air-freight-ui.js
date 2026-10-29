import {isAircraft} from './aircraft-flight.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const count=value=>Math.max(0,Number(value)||0).toLocaleString();
const ended=new Set(['air-delivered','delivered','cancelled','port-held']);
const labels={'port-transfer':'Dock cargo moving along the shore road','awaiting-pilot':'At departure apron · waiting for a pilot',reserved:'Aircraft reserved',loading:'Loading sealed freight',loaded:'Freight loaded · secure before flight',secured:'Sealed · ready for departure',airborne:'Verified departure · flight in progress',approach:'Destination approach reached',landed:'Landed · park at the receiving apron',unloading:'Unloading at the receiving apron','air-delivered':'Air receipt confirmed · truck delivery follows',delivered:'Air receipt confirmed · truck delivery follows',cancelled:'Air freight cancelled','port-held':'Remaining freight held at port',blocked:'Cargo on hold'};
export const airFreightFinished=task=>ended.has(task?.phase);
export const airFreightRows=value=>Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];
export function airFreightTaskPhase(task,session){return session?.airTaskId===task.id&&!ended.has(task.phase)?session.phase||task.phase:task.phase;}
export function airFreightPresentation(task={},session,now=Date.now()){
 const phase=airFreightTaskPhase(task,session),waiting=phase==='loading'?Math.max(0,Number(session?.loadReadyAt)-now):phase==='unloading'?Math.max(0,Number(session?.unloadReadyAt)-now):Math.max(0,Number(task.readyAt)-now);
 return {phase,label:labels[phase]||'Confirming air freight status',waitingMs:Number.isFinite(waiting)?waiting:0,finished:ended.has(task.phase)};
}
/** Controls follow server task/session state. The command handler still proves
 * the bound aircraft, load dwell, airborne gates and stopped receiving apron. */
export function airFreightAccess(task={}, {mapId='',ownerId='',selfId='',self=null,aircraft=null,now=Date.now()}={}){
 const session=self?.airFreight?.airTaskId===task.id?self.airFreight:null,view=airFreightPresentation(task,session,now),buttons=[];
 if(view.finished)return {...view,buttons,message:task.phase==='air-delivered'||task.phase==='delivered'?'Air cargo received. Local stock still waits for the final delivery drop-off.':view.label};
 if(task.mapId&&task.mapId!==mapId)return {...view,buttons:[{action:'travel',label:'Travel to the air freight map'}],message:'Visit the assigned shipping map, then board at the departure cargo apron.'};
 if(task.phase==='blocked'||task.blockedReason)return {...view,buttons,message:task.blockedReason||view.label};
 if(task.readyAt>now||task.phase==='port-transfer')return {...view,buttons,message:'Cargo remains reserved while the dock truck reaches the departure apron.'};
 if(self?.airFreight&&self.airFreight.airTaskId!==task.id&&!ended.has(self.airFreight.phase))return {...view,buttons,message:'Finish or release your current air manifest before reserving another flight.'};
 if((task.captainId&&task.captainId!==ownerId||task.phase==='reserved')&&!session)return {...view,buttons,message:task.isCaptain||task.reservedByMe?'Your air manifest remains reserved. Rejoin its assigned aircraft if the session is available, or wait for the reservation to expire.':'Another pilot has reserved this air manifest.'};
 const seated=!!self?.vehicleId&&aircraft?.id===self.vehicleId&&isAircraft(aircraft)&&aircraft.active!==false&&(aircraft.holderId===undefined||aircraft.holderId===selfId);
 if(!seated)return {...view,buttons:session?[{action:'release',label:'Release interrupted air manifest'}]:buttons,message:session?'This flight is interrupted. Release its reservation to keep the sealed cargo available at port.':'Board a parked cargo-capable aircraft at the departure apron, then reserve this manifest.'};
 if(session&&session.aircraftId!==aircraft.id)return {...view,buttons:[{action:'release',label:'Release interrupted air manifest'}],message:'Return to the aircraft assigned to this manifest before operating its cargo, or release the reservation.'};
 const flying=aircraft.flight?.airborne===true,stopped=!flying&&Math.max(Math.abs(Number(aircraft.flight?.speed)||0),Math.abs(Number(aircraft.flight?.airspeed)||0))<.8;
 if(!session){
  if(['loading','secured','sailing','unloading'].includes(self?.shipping?.job?.phase)||self?.vehicleMission?.status==='active')return {...view,buttons,message:'Finish or cancel your current transport assignment first.'};
  if(stopped)buttons.push({action:'reserve',label:'Reserve this air manifest'});
  return {...view,buttons,message:stopped?'Park at the departure cargo apron to bind these exact goods to your aircraft.':'Land and stop at the departure apron before reserving air freight.'};
 }
 if(['reserved','loading'].includes(view.phase))buttons.push({action:'load',label:view.phase==='loading'?'Confirm freight loading':'Load sealed freight',disabled:!stopped||view.waitingMs>0});
 if(view.phase==='loaded')buttons.push({action:'secure',label:'Secure freight for flight',disabled:!stopped});
 const apron=task.route?.destination?.cargoApron,position=aircraft.position;
 const atReceivingApron=!!apron&&!!position&&['x','y','z'].every(axis=>Number.isFinite(position[axis]))&&Math.abs(position.x-apron.x)<=12&&Math.abs(position.z-apron.z)<=75&&Math.abs(position.y-(apron.y||0))<=1.5;
 if(view.phase==='approach'&&!flying&&atReceivingApron)buttons.push({action:'park',label:'Stop at receiving apron'});
 if(['secured','airborne','approach'].includes(view.phase))buttons.push({action:'fly',label:flying?'Follow air freight route':'Fly to receiving airfield'});
 if(['landed','unloading'].includes(view.phase))buttons.push({action:'unload',label:view.phase==='unloading'?'Confirm apron unloading':'Unload at receiving apron',disabled:!stopped||view.waitingMs>0});
 buttons.push({action:'release',label:'Release air manifest'});
 return {...view,buttons,message:view.waitingMs>0?view.label+' · '+Math.ceil(view.waitingMs/1000)+'s before confirmation.':view.label};
}
export function airFreightTaskMarkup(task,context={}){
 const access=airFreightAccess(task,context),route=task.route||{},origin=route.origin||{},destination=route.destination||{},point=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.z)?'X '+value.x.toFixed(1)+' · Z '+value.z.toFixed(1):'',slots=task.crateCount||task.airCrateCount;
 const buttons=[...access.buttons,...(context.mapId===task.mapId?[{action:'map',label:'Show port & airfield map'}]:[])];
 return '<article class="supply-task supply-air-task" data-air-task="'+esc(task.id)+'"><strong>'+esc(task.itemName||task.itemId)+' × '+count(task.quantity)+'</strong><span>'+esc(origin.name||task.originPortId||'Departure apron')+' → '+esc(destination.name||task.destinationPortId||'Receiving apron')+'</span>'+(slots?'<span>'+count(slots)+' sealed freight crates · '+count(task.quantity)+' counted units</span>':'')+'<span data-air-phase>'+esc(access.message)+'</span>'+(origin.cargoApron?'<small>Departure cargo apron: '+esc(point(origin.cargoApron))+'</small>':'')+(destination.cargoApron?'<small>Receiving cargo apron: '+esc(point(destination.cargoApron))+'</small>':'')+'<p class="supply-muted">Sea arrival → shore road → sealed aircraft load → verified flight and apron unload → trucks → final receiving drop-off. Taking off or landing does not credit stock.</p><div class="supply-buttons">'+buttons.map(button=>'<button type="button" data-air-action="'+esc(button.action)+'" data-air-task-id="'+esc(task.id)+'" data-air-disabled="'+(button.disabled?'true':'false')+'"'+(button.disabled?' disabled':'')+'>'+esc(button.label)+'</button>').join('')+'</div></article>';
}
