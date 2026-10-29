import {planWorldJourney} from './world-connectivity.js';

export const ATLAS_JOURNEY_STOP_LIMIT=8;
const mapId=value=>typeof value==='string'&&value.length>0&&value.length<=200?value:'';
const compactStops=values=>values.filter(value=>mapId(value)).filter((value,index,list)=>!index||value!==list[index-1]).slice(0,ATLAS_JOURNEY_STOP_LIMIT);

/** Public map ids only. Order, wallet and delivery-address data stay off links. */
export function atlasJourneyUrl({fromMapId,stops=[]}={}){
 const url=new URL('index.html','https://world.invalid/');
 if(mapId(fromMapId))url.searchParams.set('from',fromMapId);
 for(const id of compactStops(stops))url.searchParams.append('stop',id);
 return url.pathname.slice(1)+url.search+'#world-map';
}
export function readAtlasJourney(search=''){
 const params=new URLSearchParams(search);
 return {fromMapId:mapId(params.get('from')),stops:compactStops(params.getAll('stop'))};
}
export function atlasJourneyConnectivity(state={}){
 if(state.connectivity?.locations&&state.connectivity?.links)return state.connectivity;
 return {version:1,regions:[],locations:(state.locations||[]).map(place=>({...place,id:place.mapId,modes:place.travelModes||[]})),links:(state.connections||[]).map(edge=>({...edge,fromMapId:edge.from,toMapId:edge.to,mode:'map-transfer',kind:'gateway'}))};
}
export function atlasTransportLabel(mode){return ({foot:'Walk',road:'Roads / trucks',boat:'Boats / shipping',plane:'Planes / air freight','map-transfer':'Map gateway'})[mode]||'Local connection';}
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}

export function renderAtlasConnections(root,state,selected){
 root.replaceChildren();const connectivity=atlasJourneyConnectivity(state),place=connectivity.locations.find(place=>place.mapId===selected);if(!place)return;
 if(root.dataset.atlasConnectionMap!==selected){root.dataset.atlasConnectionMap=selected;root.dataset.atlasConnectionMode='all';root.dataset.atlasConnectionPlacePage='0';root.dataset.atlasConnectionRoutePage='0';}
 root.append(element('h3','Regional locations & connections'));
 if(place.regionName)root.append(element('p',place.regionName));
 const modes=(place.modes||[]).map(atlasTransportLabel);if(modes.length)root.append(element('p',modes.join(' · ')));
 const places=place.localPlaces||[],routes=(connectivity.localLinks||[]).filter(link=>link.mapId===selected),available=new Set([...places.flatMap(local=>local.modes||[]),...routes.map(route=>route.mode)]),filter=element('select'),filterLabel=element('label','Local travel mode '),all=element('option','All local connections');all.value='all';filter.append(all);filter.dataset.atlasLocalMode='';filter.setAttribute('aria-label','Local travel mode');filter.style.maxWidth='100%';
 for(const mode of ['road','boat','plane','foot'])if(available.has(mode)){const option=element('option',atlasTransportLabel(mode));option.value=mode;filter.append(option);}
 const mode=available.has(root.dataset.atlasConnectionMode)?root.dataset.atlasConnectionMode:'all';filter.value=mode;root.dataset.atlasConnectionMode=mode;
 filter.onchange=()=>{root.dataset.atlasConnectionMode=filter.value;root.dataset.atlasConnectionPlacePage='0';root.dataset.atlasConnectionRoutePage='0';renderAtlasConnections(root,state,selected);root.querySelector('[data-atlas-local-mode]')?.focus();};filterLabel.append(filter);root.append(filterLabel);
 const pageSize=8,page=(rows,key,title,draw)=>{
  const section=element('section'),heading=element('h4',title);section.append(heading);let index=Math.max(0,Math.min(Math.ceil(rows.length/pageSize)-1,Number(root.dataset[key])||0));root.dataset[key]=String(index);
  const visible=rows.slice(index*pageSize,(index+1)*pageSize),list=element('ul');for(const row of visible)list.append(draw(row));section.append(list);
  const count=element('small',rows.length?'Showing '+(index*pageSize+1)+'–'+(index*pageSize+visible.length)+' of '+rows.length:'No '+title.toLowerCase()+' listed for this mode.');count.setAttribute('role','status');section.append(count);
  if(rows.length>pageSize){const controls=element('div',undefined,'atlas-journey-controls'),previous=element('button','Previous '+title.toLowerCase()),next=element('button','Next '+title.toLowerCase());previous.type=next.type='button';previous.disabled=index===0;next.disabled=(index+1)*pageSize>=rows.length;previous.dataset[key==='atlasConnectionPlacePage'?'atlasLocalPlacesPrevious':'atlasLocalRoutesPrevious']='';next.dataset[key==='atlasConnectionPlacePage'?'atlasLocalPlacesNext':'atlasLocalRoutesNext']='';previous.onclick=()=>{root.dataset[key]=String(index-1);renderAtlasConnections(root,state,selected);};next.onclick=()=>{root.dataset[key]=String(index+1);renderAtlasConnections(root,state,selected);};controls.append(previous,next);section.append(controls);}
  root.append(section);return list;
 };
 const priority={port:0,airfield:1,'freight-bay':2,dock:3,apron:4,transport:5},localPlaces=places.filter(local=>mode==='all'||(local.modes||[]).includes(mode)).slice().sort((a,b)=>(priority[a.kind]??9)-(priority[b.kind]??9));
 const pointText=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.z)?'Local X '+Math.round(point.x)+' / Z '+Math.round(point.z):'';
 const placeList=page(localPlaces,'atlasConnectionPlacePage','Marked locations',local=>{const row=element('li');row.dataset.atlasLocalPlace=local.id;row.append(element('strong',local.name||local.id));const detail=[(local.modes||[]).map(atlasTransportLabel).join(' / '),pointText(local.position)].filter(Boolean).join(' · ');if(detail)row.append(element('small',detail));return row;});placeList.dataset.atlasLocalPlaces='';
 if(!places.length)root.append(element('small','Enter this map to use its marked locations and gateway connections.'));
 root.append(element('p','Routes below operate inside this map. Map gateways connect separate rooms; visiting a location does not complete a cargo delivery.'));
 const byId=new Map(places.map(local=>[local.id,local])),localRoutes=routes.filter(route=>mode==='all'||route.mode===mode),routeList=page(localRoutes,'atlasConnectionRoutePage','Local routes',route=>{
  const row=element('li');row.dataset.atlasLocalRoute=route.id;row.append(element('strong',route.name||'Local route'));
  const from=byId.get(route.fromLocationId),to=byId.get(route.toLocationId);row.append(element('small',atlasTransportLabel(route.mode)+' · '+(from?.name||route.fromLocationId)+(route.bidirectional?' ↔ ':' → ')+(to?.name||route.toLocationId)));
  const endpoints=[pointText(from?.position),pointText(to?.position)].filter(Boolean);if(endpoints.length)row.append(element('small',endpoints.join(' → ')));
  if(route.waypoints?.length){const details=element('details'),summary=element('summary','Inspect '+route.waypoints.length+' local waypoints'),points=element('ol');for(const point of route.waypoints)points.append(element('li',pointText(point)));details.append(summary,points);row.append(details);}return row;
 });routeList.dataset.atlasLocalRoutes='';
}

/** Guidance reads the current public graph. It never submits completion or stock. */
export function mountAtlasJourney(root,{getState,getSelected,onSelect=()=>{},search=''}={}){
 let {fromMapId,stops}=readAtlasJourney(search),connectivity={locations:[],links:[]},lastState=null;
 const panel=element('section',undefined,'atlas-journey');panel.dataset.atlasJourney='';
 panel.setAttribute('aria-label','World travel itinerary');
 const title=element('h3','Plan a connected journey'),intro=element('p','Visit several deeds and world locations. Gateways connect map rooms; roads, boats and planes operate within their listed locations.');
 const controls=element('div',undefined,'atlas-journey-controls'),fromLabel=element('label','Start location'),from=element('select');from.dataset.atlasJourneyFrom='';from.setAttribute('aria-label','Journey start location');fromLabel.append(from);
 const add=element('button','Add selected destination');add.type='button';add.dataset.atlasJourneyAdd='';const clear=element('button','Clear stops');clear.type='button';clear.dataset.atlasJourneyClear='';controls.append(fromLabel,add,clear);
 const message=element('p');message.dataset.atlasJourneyStatus='';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const stopList=element('ol',undefined,'atlas-journey-stops');stopList.dataset.atlasJourneyStops='';
 const route=element('div',undefined,'atlas-journey-legs');route.dataset.atlasJourneyLegs='';
 const share=element('a','Open this itinerary in the world map');share.dataset.atlasJourneyLink='';
 const note=element('small','Order quests finish after verified production, transport and drop-off receipts. Opening a map does not finish an order.');
 panel.append(title,intro,controls,message,stopList,route,share,note);root.append(panel);
 function render(){
  const places=new Map(connectivity.locations.map(place=>[place.mapId,place]));
  if(!fromMapId)fromMapId=places.has(getSelected())?getSelected():places.has('public-commons')?'public-commons':places.keys().next().value||'';
  from.replaceChildren();for(const place of connectivity.locations){const option=element('option',place.name||place.mapId);option.value=place.mapId;from.append(option);}if(fromMapId&&!places.has(fromMapId)){const missing=element('option','Unavailable start location');missing.value=fromMapId;from.append(missing);}from.value=fromMapId;
  stopList.replaceChildren();for(const [index,id]of stops.entries()){
   const row=element('li'),place=places.get(id),name=element('button',place?.name||'Unavailable destination');name.type='button';name.disabled=!place;name.onclick=()=>onSelect(id);row.append(name);
   const remove=element('button','Remove');remove.type='button';remove.setAttribute('aria-label','Remove stop '+(index+1));remove.onclick=()=>{stops.splice(index,1);render();};row.append(remove);stopList.append(row);
  }
  add.disabled=stops.length>=ATLAS_JOURNEY_STOP_LIMIT||!places.has(getSelected())||stops.at(-1)===getSelected();clear.disabled=!stops.length;
  route.replaceChildren();share.hidden=!stops.length;share.href=atlasJourneyUrl({fromMapId,stops});
  if(!stops.length){message.textContent='Choose a location and add up to '+ATLAS_JOURNEY_STOP_LIMIT+' stops in visit order.';return;}
  const plan=planWorldJourney(connectivity,{fromMapId,stops});
  message.textContent=plan.reachable?stops.length+' planned stop'+(stops.length===1?'':'s')+' · '+plan.steps.length+' map gateway'+(plan.steps.length===1?'':'s'):'A route is unavailable. Refresh the world map or remove an unavailable stop.';
  for(const [index,leg]of plan.legs.entries()){
   const section=element('section'),heading=element('strong',(index+1)+'. '+(places.get(leg.fromMapId)?.name||'Unavailable location')+' → '+(places.get(leg.toMapId)?.name||'Unavailable location'));section.append(heading);
   if(!leg.reachable)section.append(element('p','No current public gateway route.'));
   else if(!leg.steps.length)section.append(element('p','Already at this map. Follow its local roads and marked locations.'));
   else{const list=element('ol');for(const step of leg.steps){const target=places.get(step.toMapId||step.to),row=element('li'),link=element('a',target?.name||step.toMapId||step.to);link.href=target?.playUrl||'#';row.append(element('small',atlasTransportLabel(step.mode)+' → '),link);list.append(row);}section.append(list);}
   route.append(section);
  }
 }
 from.onchange=()=>{fromMapId=from.value;render();};add.onclick=()=>{const id=getSelected();if(id&&stops.length<ATLAS_JOURNEY_STOP_LIMIT&&stops.at(-1)!==id){stops.push(id);render();}};clear.onclick=()=>{stops=[];render();};
 return {update(){const nextState=getState();if(nextState!==lastState){lastState=nextState;connectivity=atlasJourneyConnectivity(nextState);render();}else add.disabled=stops.length>=ATLAS_JOURNEY_STOP_LIMIT||!connectivity.locations.some(place=>place.mapId===getSelected())||stops.at(-1)===getSelected();},travelUrl(playUrl){if(!stops.length)return playUrl;const url=new URL(playUrl,'https://world.invalid/'),id=url.searchParams.get('environment')||url.searchParams.get('house');if(!connectivity.locations.some(place=>place.mapId===id))return playUrl;url.searchParams.set('from',id);url.searchParams.delete('stop');for(const stop of stops[0]===id?stops.slice(1):stops)url.searchParams.append('stop',stop);return url.pathname.slice(1)+url.search+url.hash;}};
}
