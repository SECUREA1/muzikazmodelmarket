import {atlasJourneyUrl} from './atlas-journey.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const count=value=>Math.max(0,Number(value)||0).toLocaleString();
const validMap=id=>typeof id==='string'&&id.length>0&&id!=='world';
const modes={factory:'Factory',road:'Road',boat:'Boat',plane:'Plane','map-transfer':'Map gateway',foot:'Door approach'};
const statuses={locked:'Waiting for earlier stages',available:'Ready',active:'In progress',completed:'Confirmed',held:'On hold'};
const journeyLabels={active:'Delivery quest in progress',held:'Delivery quest on hold',completed:'Delivery quest completed',cancelled:'Delivery quest cancelled'};

export function orderJourneyPresentation(journey={}){
 const stages=Array.isArray(journey.stages)?journey.stages:[],next=journey.nextStop;
 // The server chooses the next stop and confirms completion. Neither visiting a
 // map nor a local timer changes a receipt-backed delivery stage.
 const nextStop=!['completed','cancelled'].includes(journey.status)&&next&&validMap(next.mapId)&&stages.some(stage=>stage.id===next.id&&stage.status!=='completed')?next:null;
 return {label:journeyLabels[journey.status]||'Confirming delivery quest',stages,nextStop,completed:stages.filter(stage=>stage.status==='completed').length,total:stages.length};
}

export function orderJourneyStops(journey,{currentMapId=''}={}){
 const {stages}=orderJourneyPresentation(journey),stops=[];
 for(const stage of stages){
  if(stage.status==='completed'||!validMap(stage.mapId))continue;
  if((stops.at(-1)||currentMapId)!==stage.mapId)stops.push(stage.mapId);
  if(stops.length===8)break;
 }
 return stops;
}

export function orderJourneyMarkup(journey,{currentMapId='',destinationLabel=''}={}){
 if(!journey||!Array.isArray(journey.stages)||!journey.stages.length)return '';
 const view=orderJourneyPresentation(journey),visible=view.stages.slice(0,16),next=view.nextStop,stops=orderJourneyStops(journey,{currentMapId}),route=stops.length?atlasJourneyUrl({fromMapId:currentMapId,stops}):'',position=next?.position,unavailable=next?.available===false;
 const coordinates=position&&Number.isFinite(position.x)&&Number.isFinite(position.z)?' · X '+position.x.toFixed(1)+' / Z '+position.z.toFixed(1):'';
 return '<section class="supply-order-journey" data-order-journey="'+esc(journey.id)+'" data-journey-status="'+esc(journey.status)+'" aria-label="Order travel quest"><strong>'+esc(view.label)+'</strong><span>'+count(view.completed)+' / '+count(view.total)+' travel stages confirmed'+(destinationLabel?' · '+esc(destinationLabel):'')+'</span>'+(next?'<p data-journey-next>Next: '+esc(next.label)+'<small>'+esc([next.regionName,next.mapName||next.mapId].filter(Boolean).join(' · ')+coordinates)+'</small></p>':'')+(unavailable?'<small data-journey-unavailable>This travel destination is currently unavailable. Refresh the order to check its current route.</small>':'')+'<details><summary>Travel stages · roads, boats and planes</summary><ol class="supply-journey-stages">'+visible.map(stage=>'<li data-journey-stage="'+esc(stage.id)+'" data-stage-status="'+esc(stage.status)+'"><strong>'+esc(stage.label)+'</strong><span>'+esc(modes[stage.mode]||'Travel')+' · '+esc(statuses[stage.status]||'Confirming status')+'</span>'+(stage.regionName?'<small>'+esc(stage.regionName)+'</small>':'')+'<small>'+count(stage.completedQuantity)+' / '+count(stage.quantity??journey.quantity)+' units confirmed</small></li>').join('')+'</ol>'+(view.total>visible.length?'<small>Showing '+visible.length+' of '+count(view.total)+' stages.</small>':'')+'</details><small>Map visits guide the journey. Confirmed shipping and final delivery receipts complete the quest.</small><div class="supply-buttons">'+(next?'<button type="button" data-journey-visit="'+esc(journey.id)+'" data-journey-stop="'+esc(next.id)+'"'+(unavailable?' disabled':'')+'>'+(next.mapId===currentMapId?'Open next stop on this map':'Visit next travel stop')+'</button>':'')+(route?'<a class="supply-route-link" href="'+esc(route)+'" data-journey-plan>Plan world route</a>':'')+'</div></section>';
}
