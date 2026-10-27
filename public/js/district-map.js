import {bindGameActionButton} from './game-action-button.js';
import {gameActionLoading} from './game-action-loading.js';
import {requestGameInputRelease} from './game-input-release.js';
import {holdLiveMapUpdates} from './live-map-interaction.js';
import {isRoadVehicle,roadVehicleType,roadVehicleId} from './road-vehicles.js';
import {localMapFrame} from './local-map-frame.js';
import {localMapFootprints} from './local-map-footprints.js';
import {mountLiveLocalMap} from './local-live-map.js';
import {mountQuestMapPanel} from './quest-map-panel.js';
import {localMapTags} from './local-map-tags.js';
import {isAircraft} from './aircraft-flight.js';
import {isWatercraft} from './harbor-water.js';
import {aircraftDisplayName,aircraftType} from './aircraft-types.js';
import {vehicleDestinations} from './vehicle-destinations.js';
import {localMapLocations} from './local-map-locations.js';
import {fishingZones} from './fishing-config.js';
import {fishingMapAction} from './fishing-map-actions.js';
// Keep the fullscreen mobile layout and its controller on the same revision.
const mapStylesRevision='selected-map-views-6';
const mobileMapQuery='(max-width:600px), (max-width:1024px) and (pointer:coarse)';
function loadMapStylesheet(path){
 const link=document.createElement('link');link.rel='stylesheet';
 const url=new URL(path,import.meta.url);url.searchParams.set('v',mapStylesRevision);link.href=url.href;
 const ready=new Promise(resolve=>{link.addEventListener('load',()=>resolve(true),{once:true});link.addEventListener('error',()=>resolve(false),{once:true});});
 document.head.append(link);return {link,ready};
}
export function districtLocations(environment){return localMapLocations(environment);}
export function districtDestinations(environment,locations){
 return locations.filter(place=>place.mapId&&place.mapId!==environment?.id&&place.visibility!=='private').sort((a,b)=>Number(!!b.deedId)-Number(!!a.deedId)||a.name.localeCompare(b.name));
}
export function mountDistrictMap({stage,command=null,getRoots=null,onFishing=()=>{},fetchAtlas=async()=>{const response=await fetch('/api/world-atlas',{credentials:'include'});if(!response.ok)throw Error('The live deed directory is unavailable. Try again.');const json=await response.json();return json.data||json;}}){
 const districtStyles=loadMapStylesheet('../assets/district-map.css'),css=districtStyles.link;
 let requestedReady=true,stylesReady=false,disposed=false,browsingReady=false;
 const button=document.createElement('button');button.type='button';button.className='district-map-toggle';button.hidden=true;button.title='Local map and land deeds';button.setAttribute('aria-label',button.title);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/></svg>';stage.append(button);
 const localStyles=loadMapStylesheet('../assets/local-live-map.css'),mapStyle=localStyles.link;
 const mini=mountLiveLocalMap({stage,command,onFishingDestination:zoneId=>startFishingRoute(zoneId),open:tag=>{if(!mapReady())return;button.click();if(tag)chooseTag(tag);if(tag?.kind==='mission'&&questPanel.toggle.getAttribute('aria-expanded')!=='true')questPanel.toggle.click();}});
 mini.setReady(false);button.style.setProperty('display','none','important');
 const dialog=document.createElement('dialog');dialog.className='district-map-dialog';dialog.dataset.gameplayBlocking='false';dialog.setAttribute('aria-label','Local map and land deeds');
 const header=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>dialog.close();header.append(title,close);
 const layout=document.createElement('div');layout.className='district-map-layout';const visual=document.createElement('section'),directory=document.createElement('section'),status=document.createElement('p');visual.className='local-map-visual';status.className='local-map-status';status.setAttribute('role','status');layout.append(visual,directory);dialog.append(header,status,layout);document.body.append(dialog);
 const actionLoading=gameActionLoading(stage);
 const footprintNodes=new Map();
 const liveUpdates=holdLiveMapUpdates(dialog,()=>{if(dialog.open)refreshLive();});
 let environment=null,generation=0,live=null,selfId=null,map3D=null,mapView='plan',pending3D=null;
 const layoutTargets=new Set(),layoutSelector='.game-display-flow,.game-display-flow-views,.house-control-dock,.airport-flight-controls,.harbor-helm-controls,.construction-controls,.patrol-cannon';let layoutFrame=null;
 function fitCompanionMap(){
  if(!dialog.open||disposed)return;
  dialog.style.setProperty('--map-toolbar-height',Math.ceil(header.getBoundingClientRect().height)+'px');
  // Phones use the full visible screen, including in landscape. Gameplay HUD
  // controls must not squeeze the map into the small gap between them.
  if(window.matchMedia(mobileMapQuery).matches){
   const viewport=window.visualViewport;
   dialog.style.setProperty('--companion-map-top',(viewport?.offsetTop||0)+'px');
   dialog.style.setProperty('--mobile-map-left',(viewport?.offsetLeft||0)+'px');
   dialog.style.setProperty('--mobile-map-width',(viewport?.width||window.innerWidth)+'px');
   dialog.style.setProperty('--companion-map-room',(viewport?.height||window.innerHeight)+'px');
   dialog.classList.remove('is-compact');return;
  }
  const viewport=window.visualViewport,viewTop=viewport?.offsetTop||0,viewBottom=viewTop+(viewport?.height||window.innerHeight),mapRect=dialog.getBoundingClientRect();let top=viewTop+(window.innerWidth<=600?8:12),bottom=viewBottom-12;
  const visible=[];
  for(const node of layoutTargets){if(!node.isConnected){layoutResize.unobserve(node);layoutTargets.delete(node);continue;}const rect=node.getBoundingClientRect();if(!rect.width||!rect.height||rect.bottom<=viewTop||rect.top>=viewBottom||rect.right<=mapRect.left||rect.left>=mapRect.right)continue;visible.push({node,rect});if(node.matches('.game-display-flow-views'))top=Math.max(top,rect.bottom+8);}
  for(const {node,rect}of visible)if(!node.matches('.game-display-flow-views')&&rect.bottom>top)bottom=Math.min(bottom,rect.top-8);
  const room=Math.max(100,Math.floor(bottom-top));dialog.style.setProperty('--companion-map-top',Math.round(top)+'px');dialog.style.setProperty('--companion-map-room',room+'px');dialog.classList.toggle('is-compact',room<320);
 }
 function scheduleMapLayout(){if(layoutFrame===null&&!disposed)layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;fitCompanionMap();});}
 const layoutResize=new ResizeObserver(scheduleMapLayout),layoutChanges=new MutationObserver(records=>{let changed=false;for(const record of records){if(record.target===dialog||dialog.contains(record.target))continue;changed=true;for(const node of record.addedNodes)if(node.nodeType===1&&node!==dialog)observeMapControls(node);}if(changed)scheduleMapLayout();});
 function observeMapControls(root){if(root.matches?.(layoutSelector)&&!layoutTargets.has(root)){layoutTargets.add(root);layoutResize.observe(root);layoutChanges.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});}for(const node of root.querySelectorAll?.(layoutSelector)||[])if(!dialog.contains(node))observeMapControls(node);}
 const layoutRoot=stage.closest('.house-explorer-shell')||stage;layoutResize.observe(stage);layoutResize.observe(header);layoutChanges.observe(stage,{childList:true});if(layoutRoot!==stage)layoutChanges.observe(layoutRoot,{childList:true,attributes:true,attributeFilter:['class']});observeMapControls(layoutRoot);
 window.addEventListener('resize',scheduleMapLayout);window.addEventListener('scroll',scheduleMapLayout,{passive:true});window.visualViewport?.addEventListener('resize',scheduleMapLayout);window.visualViewport?.addEventListener('scroll',scheduleMapLayout);
 function mapReady(){return !disposed&&browsingReady&&!!environment;}
 function applyReadiness(){
  if(environment)browsingReady=true;
  const ready=mapReady();button.hidden=!ready;button.disabled=!ready;
  if(ready)button.style.removeProperty('display');else button.style.setProperty('display','none','important');
  mini.setReady(!!environment);
 }
 Promise.all([districtStyles.ready,localStyles.ready]).then(loaded=>{if(disposed)return;stylesReady=loaded.every(Boolean);applyReadiness();});
 const questPanel=mountQuestMapPanel(dialog,{command,getEnvironment:()=>environment,getLive:()=>live,getSelfId:()=>selfId,onChange:()=>{map3D?.updateLive(live,selfId);refreshQuestPins();}});directory.dataset.mapDirectory='';
 const search=document.createElement('input');search.type='search';search.placeholder='Find a place, craft or quest…';search.setAttribute('aria-label','Search local map directory');
 const list=document.createElement('div');list.className='local-map-directory-list';directory.append(search,list);
 const group=(label,open=false)=>{const details=node('details',null,list);details.className='local-map-directory-group';details.open=open;node('summary',label,details);const body=node('div',null,details);return {details,body};};
 const placesGroup=group('Places & activities',true),craftGroup=group('Boats & aircraft',true),routesGroup=group('Automatic routes',true),deedsGroup=group('Connected destinations');list.insertBefore(questPanel.section,deedsGroup.details);
 const sectionGroups={locations:[placesGroup.details],vehicles:[craftGroup.details,routesGroup.details],quests:[questPanel.section],destinations:[deedsGroup.details]};
 for(const [name,groups]of Object.entries(sectionGroups))for(const group of groups)group.dataset.mapSection=name;
 let activeSection='map',atlasLoading=false;
 const shortcuts=document.createElement('nav');shortcuts.className='local-map-section-controls';shortcuts.setAttribute('aria-label','Browse map sections');
 const quickButton=(label,path)=>{const control=document.createElement('button');control.type='button';control.title=label;control.dataset.mapView=label.toLowerCase();control.setAttribute('aria-label',label);control.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="'+path+'"/></svg><span>'+label+'</span>';control.onclick=()=>selectSection(control.dataset.mapView);shortcuts.append(control);return control;};
 quickButton('Map','m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15');
 quickButton('Locations','M12 22s8-8 8-13a8 8 0 1 0-16 0c0 5 8 13 8 13Zm0-16a3 3 0 1 1 0 6 3 3 0 0 1 0-6');
 const vehiclesShortcut=quickButton('Vehicles','M3 17h18l-3-7H6l-3 7Zm0 0v4m18-4v4M7 17h2m6 0h2M8 10l1-5h6l1 5');
 questPanel.toggle.dataset.mapView='quests';questPanel.toggle.onclick=()=>selectSection('quests');
 shortcuts.append(questPanel.toggle);quickButton('Destinations','M4 4h16v16H4Zm4 12 8-8m-7 0h7v7');
 header.append(shortcuts);
 const searchTools=document.createElement('div');searchTools.className='local-map-directory-tools';searchTools.append(search);directory.replaceChildren(searchTools,list);
 const noResults=node('p','No matching places, craft or quests.',list);noResults.hidden=true;
 function filterDirectory(){const query=search.value.trim().toLowerCase(),cards=[...list.querySelectorAll('[data-map-search-item],.local-map-quests article')];for(const card of cards)card.hidden=!!query&&!card.textContent.toLowerCase().includes(query);for(const section of [placesGroup,craftGroup,deedsGroup]){const items=[...section.body.querySelectorAll('[data-map-search-item]')];section.details.hidden=section===craftGroup&&!command||!items.length||!!query&&items.every(item=>item.hidden);if(query&&!section.details.hidden)section.details.open=true;}if(query&&activeSection==='quests')questPanel.section.querySelector('details').open=true;const matches=cards.some(card=>!card.hidden&&card.closest('[data-map-section]')?.dataset.mapSection===activeSection);noResults.textContent=query?'No matching '+({locations:'locations',vehicles:'vehicles',quests:'quests',destinations:'destinations'}[activeSection]||'items')+'.':atlasLoading&&activeSection==='destinations'?'Loading connected destinations…':'No '+(activeSection==='destinations'?'connected destinations':activeSection)+' available in this space.';noResults.hidden=activeSection==='map'||matches||activeSection==='quests'&&!query||activeSection==='vehicles'&&!routesGroup.details.hidden;}

 function selectSection(section){
  if(section!=='map'&&!sectionGroups[section])return;
  if(activeSection!==section)search.value='';activeSection=section;dialog.dataset.mapSection=section;
  visual.hidden=section!=='map';directory.hidden=section==='map';
  for(const control of shortcuts.children)control.setAttribute('aria-pressed',String(control.dataset.mapView===section));
  questPanel.section.querySelector('details').open=section==='quests';
  for(const group of sectionGroups[section]||[])if(group.tagName==='DETAILS')group.open=true;
  if(section==='quests')questPanel.update();filterDirectory();dialog.scrollTop=0;list.scrollTop=0;
  if(section==='map'&&dialog.open){if(mapView==='3d')void open3D();requestAnimationFrame(()=>{if(dialog.open&&activeSection==='map'&&completePlan)fitPlan();});}
 }

 search.oninput=filterDirectory;
 const mapMode=document.createElement('div');mapMode.className='local-map-view-toggle';mapMode.setAttribute('role','group');mapMode.setAttribute('aria-label','Local map view');
 const view3D=document.createElement('button'),viewPlan=document.createElement('button');view3D.type=viewPlan.type='button';view3D.textContent='3D map';viewPlan.textContent='2D plan';mapMode.append(view3D,viewPlan);
 const spatial=document.createElement('div');spatial.setAttribute('data-local-map-3d','');const plan=document.createElement('div');plan.dataset.localMapPlan='';const selectedTag=document.createElement('section');selectedTag.className='local-map-selected';selectedTag.setAttribute('aria-label','Selected map location');
 let planFrame=null,completePlan=true,lastQuestMapInstance=null,selectedLocation=null;
 const planTools=document.createElement('div');planTools.className='local-map-plan-controls';planTools.setAttribute('aria-label','2D map controls');
 const extent=()=>environment?.builderScene?.layoutMeta?.harbor?.extent||(environment?.builderScene?.mapSize||environment?.playableSize||256)/2;
 function setPlanFrame(frame){planFrame=frame;plan.querySelector('svg')?.setAttribute('viewBox',frame.viewBox);refreshQuestPins();}
 function planAspect(){const svg=plan.querySelector('svg');return svg?.clientHeight?svg.clientWidth/svg.clientHeight:1;}
 function fitPlan(){if(!environment||!plan.querySelector('svg'))return;completePlan=true;const aspect=planAspect(),boundary=extent()+Math.max(2,extent()*.02);setPlanFrame(localMapFrame({half:boundary/Math.min(1,aspect),aspect,extent:boundary}));}
 function focusPlan(point){completePlan=false;setPlanFrame(localMapFrame({x:point.x,z:point.z,half:Math.max(20,point.width||0,point.depth||0),aspect:planAspect(),extent:extent()}));}
 for(const [label,run]of [['Fit map',fitPlan],['Find me',()=>focusPlan(live?.players?.[selfId]?.position||environment?.spawn?.position||environment?.spawn||{x:0,z:0})],['−',()=>zoomPlan(1.5)],['+',()=>zoomPlan(1/1.5)]]){const control=node('button',label,planTools);control.type='button';control.setAttribute('aria-label',label==='−'?'Zoom 2D map out':label==='+'?'Zoom 2D map in':label);control.onclick=run;}
 function zoomPlan(factor){const f=planFrame;if(f){completePlan=false;setPlanFrame(localMapFrame({x:f.x,z:f.z,half:Math.min(extent()*2,Math.max(8,f.height/2*factor)),aspect:planAspect(),extent:extent()}));}}
 const planResize=new ResizeObserver(()=>{if(planFrame&&!plan.hidden){if(completePlan)fitPlan();else setPlanFrame(localMapFrame({x:planFrame.x,z:planFrame.z,half:planFrame.height/2,aspect:planAspect(),extent:extent()}));}});planResize.observe(plan);
 function chooseTag(tag){selectedLocation=tag;selectedTag.replaceChildren();node('h3',tag.icon+' '+tag.name,selectedTag);node('p',(tag.description||'')+' · X '+tag.x.toFixed(1)+' / Y '+(Number(tag.y)||0).toFixed(1)+' / Z '+tag.z.toFixed(1),selectedTag);if(command&&fishingMapAction(environment,live,selfId,tag.locationId)){addFishingAction(selectedTag,tag.locationId);}else if(tag.residentId&&command){const talk=node('button','Talk to '+tag.name,selectedTag);talk.type='button';talk.onclick=async()=>{const result=await command('npc-social',{entityId:tag.residentId,choice:'question'});if(result)dialog.close();else status.textContent='Move closer to this resident to talk.';};}else if(tag.mapId){const link=node('a','Enter '+tag.name,selectedTag);link.href='model-explorer.html?environment='+encodeURIComponent(tag.mapId)+'&autoplay=1';}else if(command&&(tag.locationId||tag.entityId||tag.arrival)){const go=node('button',(tag.entityId?'Board ':'Go to ')+tag.name,selectedTag);go.type='button';go.disabled=tag.entityId?craftUnavailable(tag.entityId):false;if(tag.entityId)go.dataset.craftId=tag.entityId;bindGameActionButton(go,()=>travel(tag.entityId?{entityId:tag.entityId}:tag.arrival?{position:{x:tag.x,z:tag.z}}:{locationId:tag.locationId}));}}
 async function open3D(){if(map3D||pending3D===generation||!dialog.open||mapView!=='3d')return;const current=generation;pending3D=current;spatial.textContent='Loading the actual 3D map…';spatial.setAttribute('aria-busy','true');try{const {mountLocalMap3D}=await import('./local-map-3d.js');if(current!==generation||!dialog.open||mapView!=='3d')return;const holder=document.createElement('div');spatial.replaceChildren(holder);const view=await mountLocalMap3D(holder,{environment,getRoots,live,selfId,getTags:()=>localMapTags(environment,live,selfId).filter(tag=>tag.kind!=='mission'||questPanel.markers.checked),onSelect:chooseTag,onTravel:command?travel:null});if(current!==generation||!dialog.open){view.dispose();return;}map3D=view;if(selectedLocation)map3D.focus({x:selectedLocation.x,y:Number(selectedLocation.y)||0,z:selectedLocation.z},Math.max(30,selectedLocation.width||0,selectedLocation.depth||0)*1.6);}catch(error){console.warn('Local 3D map unavailable',error);if(current===generation)spatial.textContent='3D map unavailable. Use the 2D plan and destination list to continue.';}finally{if(pending3D===current)pending3D=null;if(current===generation)spatial.setAttribute('aria-busy','false');}}
 function switchView(mode){if(mode!==mapView&&dialog.open)requestGameInputRelease('map-view-change');mapView=mode;spatial.hidden=mode!=='3d';plan.hidden=mode!=='plan';view3D.setAttribute('aria-pressed',String(mode==='3d'));viewPlan.setAttribute('aria-pressed',String(mode==='plan'));if(mode==='3d')void open3D();}
 view3D.onclick=()=>switchView('3d');viewPlan.onclick=()=>switchView('plan');const craftButtons=new Map();let routeVehicleId=null;
 const craftRecords=()=>{const records=new Map((environment?.builderScene?.objects||[]).filter(craft=>isAircraft(craft)||isWatercraft(craft)||isRoadVehicle(craft)).map(craft=>[craft.id,craft]));for(const craft of Object.values(live?.actors||{}))if(isAircraft(craft)||isWatercraft(craft)||isRoadVehicle(craft))records.set(craft.id,{...records.get(craft.id),...craft});return [...records.values()];};
 let craftSignature='';function renderCraftChoices(){const records=craftRecords(),signature=JSON.stringify(records.map(craft=>[craft.id,craft.modelId,craft.asset?.buildAssetId]));if(signature===craftSignature)return;craftSignature=signature;craftButtons.clear();craftGroup.body.replaceChildren();craftGroup.details.hidden=!command||!records.length;vehiclesShortcut.disabled=false;if(craftGroup.details.hidden)return;const group=node('section',null,craftGroup.body);group.dataset.craftChoices='';for(const craft of records){const name=isAircraft(craft)?aircraftDisplayName(craft):roadVehicleType(craft)?.name||craft.name||craft.id,card=node('article',null,group);card.className='local-map-craft-card';card.dataset.mapSearchItem='';if(isAircraft(craft)||isWatercraft(craft)||isRoadVehicle(craft)){const image=node('img',null,card);image.src='/public/images/'+(isAircraft(craft)?'aircraft':isRoadVehicle(craft)?roadVehicleType(craft)?.siteOnly?'construction':'vehicles':'boats')+'/'+(craft.asset?.buildAssetId||craft.modelId)+'.svg';image.alt=aircraftType(craft)?.name||name;image.loading='lazy';}node('h4',name,card);const state=node('span','Available',card);state.className='local-map-craft-state';state.dataset.craftState=craft.id;const board=node('button','Board '+name,card);board.type='button';board.dataset.name=name;board.dataset.craftId=craft.id;bindGameActionButton(board,()=>travel({entityId:craft.id}));craftButtons.set(craft.id,board);}filterDirectory();}
 function craftUnavailable(id){const actor=live?.actors?.[id]||environment?.builderScene?.objects?.find(object=>object.id===id);return !!(actor?.active===false||actor?.trafficAI||actor?.holderId&&actor.holderId!==selfId||actor?.flight?.airborne&&actor.holderId!==selfId);}
 let travelBusy=false;
 function addFishingAction(parent,zoneId){
  const row=node('div',null,parent);row.dataset.fishingActions=zoneId;
  const sail=node('button','',row);sail.type='button';sail.dataset.fishingDestination=zoneId;sail.dataset.vehicleDestination=zoneId;bindGameActionButton(sail,()=>startFishingRoute(zoneId));
  const fish=node('button','',row);fish.type='button';fish.dataset.fishHere=zoneId;bindGameActionButton(fish,()=>{
   const action=fishingMapAction(environment,live,selfId,zoneId);if(!action?.fishHere||travelBusy)return;
   dialog.close();onFishing({zoneId,side:action.fishHere.side});
  });refreshFishingActions();
 }
 function refreshFishingActions(){
  for(const row of dialog.querySelectorAll('[data-fishing-actions]')){
   const action=fishingMapAction(environment,live,selfId,row.dataset.fishingActions),sail=row.querySelector('[data-fishing-destination]'),fish=row.querySelector('[data-fish-here]');
   if(!action){row.hidden=true;continue;}row.hidden=false;sail.textContent=action.label;sail.disabled=travelBusy||!action.enabled;sail.title=action.reason||'Follow a water route to this exact fishing ground.';sail.setAttribute('aria-pressed',String(live?.actors?.[live?.players?.[selfId]?.vehicleId]?.boating?.navigationDestinationId===action.zoneId));
   fish.hidden=!action.fishHere;fish.disabled=travelBusy;fish.textContent=action.fishHere?.label||'Fish here';
  }
 }
 async function startFishingRoute(zoneId){
  if(!mapReady()||!command||travelBusy)return;
  const action=fishingMapAction(environment,live,selfId,zoneId);if(!action?.enabled)return;
  const scope=environment,loading=actionLoading.begin('Sailing to '+action.name+'…');travelBusy=true;refreshFishingActions();
  try{
   if(action.kind==='board-route'){
    const boarded=await command('map-access',{entityId:action.entityId});if(!boarded)throw Error('The fishing boat could not be boarded. Try another available Angler.');
    if(disposed||scope!==environment){loading.finish('Destination changed.');return;}live=boarded;
   }
   const state=await command('vehicle-navigate',{destinationId:zoneId});if(disposed||scope!==environment){loading.finish('Destination changed.');return;}
   if(!state)throw Error('The selected fishing route could not start.');live=state;status.textContent=state.result?.message||'Sailing to '+action.name+'. Fishing opens when the boat is anchored.';loading.finish(status.textContent);if(dialog.open)dialog.close();
  }catch(error){if(scope===environment){status.textContent=error.message;loading.fail(error.message);}}
  finally{travelBusy=false;refreshFishingActions();}
 }
 async function travel(fields){
  if(!mapReady()||!command||travelBusy)return;
  const scope=environment,actor=live?.actors?.[fields.entityId]||environment.builderScene?.objects?.find(object=>object.id===fields.entityId),place=districtLocations(environment).find(place=>place.id===fields.locationId);
  const loading=actionLoading.begin(fields.entityId?'Loading '+(actor?.name||'vehicle')+'…':'Travelling to '+(place?.name||'selected location')+'…');
  travelBusy=true;status.textContent=fields.entityId?'Loading vehicle and opening its controls…':'Travelling…';
  try{
   const result=await command('map-access',fields);
   if(disposed||scope!==environment){loading.finish('Destination changed.');return;}
   if(!result){status.textContent='Travel could not complete. Check the game status and try again.';loading.fail(status.textContent);return;}
   status.textContent=result.result?.message||'Arrived. Your controls are ready.';loading.finish(status.textContent);
   if(fields.entityId&&dialog.open)dialog.close();
   stage.querySelector('canvas')?.focus({preventScroll:true});
  }catch(error){if(scope===environment){status.textContent=error.message;loading.fail(error.message);}}
  finally{travelBusy=false;if(dialog.open)refreshLive();}
 }
 async function navigate(destination){
  if(!mapReady()||!command||travelBusy)return;
  const scope=environment,loading=actionLoading.begin('Preparing route to '+destination.name+'…');travelBusy=true;
  try{const state=await command('vehicle-navigate',{destinationId:destination.id});if(disposed||scope!==environment){loading.finish('Destination changed.');return;}if(state){status.textContent=state.result?.message||'Automatic route active.';loading.finish(status.textContent);if(fishingZones(environment).some(zone=>zone.id===destination.id)&&dialog.open)dialog.close();}else{status.textContent='The route could not start. Check the game status.';loading.fail(status.textContent);}}
  catch(error){if(scope===environment){status.textContent=error.message;loading.fail(error.message);}}finally{travelBusy=false;}
 }
 function refreshFootprints(layer){
  const active=new Set();for(const item of localMapFootprints(environment,live||{})){
   active.add(item.id);const signature=[item.x,item.z,item.width,item.depth,item.yaw,item.color,item.name].join('|');let entry=footprintNodes.get(item.id);
   if(entry?.signature===signature)continue;
   if(!entry){const rect=document.createElementNS('http://www.w3.org/2000/svg','rect'),title=document.createElementNS(rect.namespaceURI,'title');rect.append(title);layer.append(rect);entry={rect,title};footprintNodes.set(item.id,entry);}
   entry.signature=signature;entry.title.textContent=item.name;
   for(const [key,value]of Object.entries({x:item.x-item.width/2,y:item.z-item.depth/2,width:item.width,height:item.depth,fill:item.color,opacity:.75,transform:`rotate(${-item.yaw*180/Math.PI} ${item.x} ${item.z})`}))entry.rect.setAttribute(key,value);
  }
  for(const [id,entry]of footprintNodes)if(!active.has(id)){entry.rect.remove();footprintNodes.delete(id);}
 }

 function renderVehicleRoutes(){
  routesGroup.body.replaceChildren();const player=live?.players?.[selfId],vehicle=live?.actors?.[player?.vehicleId];routeVehicleId=player?.vehicleId||null;
  const destinations=vehicleDestinations(environment,vehicle);routesGroup.details.hidden=!destinations.length;if(!destinations.length)return;
  const section=node('section',null,routesGroup.body);section.dataset.vehicleRoutes='';
  for(const destination of destinations){const fishing=fishingMapAction(environment,live,selfId,destination.id);if(fishing){addFishingAction(section,destination.id);continue;}const control=node('button',(destination.mode==='fly'?'Fly to ':'Sail to ')+destination.name,section);control.type='button';control.dataset.vehicleDestination=destination.id;bindGameActionButton(control,()=>navigate(destination));}
 }
 function refreshBoatRoute(){
  const layer=plan.querySelector('[data-live-route]');if(!layer)return;
  layer.replaceChildren();const player=live?.players?.[selfId],boat=live?.actors?.[player?.vehicleId],state=boat?.boating;
  if(!isWatercraft(boat)||!state?.navigationDestinationId||!state.assistRoute?.length)return;
  const points=[boat.position,...state.assistRoute.slice(state.routeIndex||0)],route=document.createElementNS('http://www.w3.org/2000/svg','polyline');
  route.setAttribute('points',points.map(point=>point.x+','+point.z).join(' '));route.setAttribute('fill','none');route.setAttribute('stroke','#ffe29a');route.setAttribute('stroke-width','2');route.setAttribute('vector-effect','non-scaling-stroke');route.setAttribute('stroke-dasharray','6 4');route.dataset.destinationId=state.navigationDestinationId;
  const label=document.createElementNS(route.namespaceURI,'title');label.textContent='Selected route · '+(state.navigationName||state.navigationDestinationId);route.append(label);layer.append(route);
 }
 function refreshQuestPins(){const layer=plan.querySelector('[data-quest-markers]');if(!layer)return;layer.replaceChildren();for(const tag of questPanel.tags){const unit=(planFrame?.width||extent()*2)/Math.max(240,plan.querySelector('svg')?.clientWidth||500)*11;const pin=document.createElementNS('http://www.w3.org/2000/svg','g'),dot=document.createElementNS(pin.namespaceURI,'circle'),label=document.createElementNS(pin.namespaceURI,'text');pin.setAttribute('pointer-events','bounding-box');const hitArea=document.createElementNS(pin.namespaceURI,'rect');hitArea.setAttribute('x',String(tag.x>0?-unit*11:-unit*.5));hitArea.setAttribute('y',String(-unit*1.5));hitArea.setAttribute('width',String(unit*11.5));hitArea.setAttribute('height',String(unit*2));hitArea.setAttribute('fill','transparent');pin.append(hitArea);pin.setAttribute('role','button');pin.setAttribute('tabindex','0');pin.setAttribute('aria-label',tag.name+' · '+tag.description);pin.setAttribute('transform',`translate(${tag.x} ${tag.z})`);dot.setAttribute('r',String(unit*.4));dot.setAttribute('fill',tag.color);label.setAttribute('y',String(-unit*.65));label.setAttribute('font-size',String(unit));label.setAttribute('text-anchor',tag.x>0?'end':'start');label.setAttribute('fill',tag.color);label.textContent=tag.name.length>22?tag.name.slice(0,20)+'…':tag.name;pin.append(dot,label);pin.onclick=event=>{event.stopPropagation();chooseTag(tag);};pin.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pin.dispatchEvent(new MouseEvent('click',{bubbles:true}));}};layer.append(pin);}}
 function refreshLive(){refreshFishingActions();refreshBoatRoute();const mission=live?.players?.[selfId]?.vehicleMission;if(mission?.status==='active'&&mission.instanceId!==lastQuestMapInstance){lastQuestMapInstance=mission.instanceId;fitPlan();}const placed=plan.querySelector('[data-live-footprints]');if(placed)refreshFootprints(placed);questPanel.update();if(search.value)filterDirectory();refreshQuestPins();renderCraftChoices();const selectedCraft=selectedTag.querySelector('[data-craft-id]');if(selectedCraft){const craft=live?.actors?.[selectedCraft.dataset.craftId];selectedCraft.disabled=craftUnavailable(selectedCraft.dataset.craftId);}map3D?.updateLive(live,selfId);if((live?.players?.[selfId]?.vehicleId||null)!==routeVehicleId)renderVehicleRoutes();for(const [id,control]of craftButtons){const actor=live?.actors?.[id],card=control.closest('article'),badge=card?.querySelector('[data-craft-state]');if(badge){const state=actor?.active===false?'unavailable':actor?.trafficAI?'crew':actor?.holderId===selfId?'yours':actor?.holderId?'occupied':actor?.flight?.airborne?'airborne':'available';badge.dataset.state=state;badge.textContent=({unavailable:'Unavailable',crew:'AI crew',yours:'Your vehicle',occupied:'Occupied',airborne:'In flight',available:'Available'})[state];}control.hidden=!!actor?.trafficAI;control.disabled=travelBusy||craftUnavailable(id);control.textContent=actor?.active===false?'Unavailable':actor?.trafficAI?'AI crew':actor?.holderId===selfId?'Open vehicle controls':actor?.holderId?'Occupied':actor?.flight?.airborne?'In flight':'Board '+control.dataset.name;}const craftLayer=visual.querySelector('[data-live-craft]');if(craftLayer){craftLayer.replaceChildren();for(const craft of craftRecords()){if(craft.active===false)continue;const pin=document.createElementNS('http://www.w3.org/2000/svg','g');pin.setAttribute('role','button');pin.setAttribute('tabindex','0');pin.setAttribute('aria-label','Select '+(isAircraft(craft)?aircraftDisplayName(craft):roadVehicleType(craft)?.name||craft.name||craft.id));const shape=document.createElementNS(pin.namespaceURI,'path');shape.setAttribute('d',isAircraft(craft)?'M0 -7 1 -2 7 1 7 3 1 1 1 5 3 7 0 6 -3 7 -1 5 -1 1 -7 3 -7 1 -1 -2Z':isRoadVehicle(craft)?'M-4 -6H4V6H-4ZM-5 -3H-4M4 -3H5M-5 3H-4M4 3H5':'M-4 -5H4L5 3 0 7 -5 3Z');shape.setAttribute('fill',(craft.holderId||craft.trafficAI)?'#ffce79':'#9fcfff');pin.append(shape);pin.setAttribute('transform',`translate(${craft.position.x} ${craft.position.z}) rotate(${-(craft.rotation?.y||0)*180/Math.PI})`);pin.onclick=event=>{event.stopPropagation();chooseTag({name:isAircraft(craft)?aircraftDisplayName(craft):roadVehicleType(craft)?.name||craft.name||craft.id,icon:isAircraft(craft)?'✈':isRoadVehicle(craft)?'▣':'⚓',x:craft.position.x,z:craft.position.z,entityId:craft.id,occupied:!!craft.trafficAI||!!craft.holderId||!!craft.flight?.airborne});};pin.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pin.dispatchEvent(new MouseEvent('click',{bubbles:true}));}};craftLayer.append(pin);}}const group=visual.querySelector('[data-live-players]');if(group){group.replaceChildren();for(const player of Object.values(live?.players||{})){const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');circle.setAttribute('cx',player.position.x);circle.setAttribute('cy',player.position.z);circle.setAttribute('r','2');circle.setAttribute('fill',player.id===selfId?'#ff748d':'#67dcfa');const title=document.createElementNS(circle.namespaceURI,'title');title.textContent=player.username||'Live player';circle.append(title);group.append(circle);}}}

 function node(tag,text,parent){const element=document.createElement(tag);if(text)element.textContent=text;parent?.append(element);return element;}
 function renderMap(){
  map3D?.dispose();map3D=null;selectedLocation=null;selectedTag.replaceChildren();visual.replaceChildren(mapMode,spatial,plan,selectedTag);plan.replaceChildren();footprintNodes.clear();spatial.replaceChildren();switchView(mapView);craftButtons.clear();craftSignature='';const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');const extent=environment.builderScene?.layoutMeta?.harbor?.extent||(Number(environment.builderScene?.mapSize)||Number(environment.playableSize)||256)/2;svg.setAttribute('viewBox',`${-extent-2} ${-extent-2} ${extent*2+4} ${extent*2+4}`);if(command){svg.style.cursor='crosshair';svg.addEventListener('click',event=>{const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const location=point.matrixTransform(svg.getScreenCTM().inverse());travel({position:{x:location.x,z:location.y}});});}svg.setAttribute('role','img');svg.setAttribute('aria-label',environment.name+' locations, roads and portal buildings');
  const shape=(tag,attrs,label)=>{const element=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))element.setAttribute(key,value);if(label){const title=document.createElementNS(ns,'title');title.textContent=label;element.append(title);}svg.append(element);return element;};
  if(extent>128)shape('rect',{x:-extent,y:-extent,width:extent*2,height:extent*2,fill:'#12617a'});
  const harbor=environment.builderScene?.layoutMeta?.harbor,landExtent=harbor?128:extent;if(harbor?.mainIsland!==false)shape('rect',{x:-landExtent,y:-landExtent,width:landExtent*2,height:landExtent*2,fill:'#142b24',rx:5});
  for(const island of environment.builderScene?.layoutMeta?.harbor?.islands||[])shape('rect',{x:island.x-island.width/2,y:island.z-island.depth/2,width:island.width,height:island.depth,fill:'#708b5b'},island.name);
  for(const lake of environment.builderScene?.layoutMeta?.harbor?.lakes||[])shape('rect',{x:lake.x-lake.width/2,y:lake.z-lake.depth/2,width:lake.width,height:lake.depth,fill:'#12617a'},lake.name);
  for(const street of environment.streets||environment.builderScene?.streets||[])shape('line',{x1:street.from.x,y1:street.from.z,x2:street.to.x,y2:street.to.z,stroke:'#728b85','stroke-width':street.width||5},street.name);
  for(const object of environment.builderScene?.objects||[])if(object.modelId==='material:paving-tile'){shape('rect',{x:object.position.x-1.2,y:object.position.z-1.2,width:2.4,height:2.4,fill:'#9ea995'});}
  for(const place of districtLocations(environment)){const fishing=fishingZones(environment).some(zone=>zone.id===place.id),area=fishing?shape('circle',{cx:place.x,cy:place.z,r:place.radius,fill:'#86e5ca','fill-opacity':.12,stroke:'#86e5ca','stroke-width':.8},place.name):shape('rect',{x:place.x-place.width/2,y:place.z-place.depth/2,width:place.width,height:place.depth,fill:'#c7e88f','fill-opacity':.1,stroke:'#c7e88f','stroke-width':.5},place.name);const label=shape('text',{x:place.x,y:place.z-7,'text-anchor':'middle',fill:'#efffd7','font-size':4});label.textContent=place.name;if(fishing){area.setAttribute('role','button');area.setAttribute('tabindex','0');area.setAttribute('aria-label','Select '+place.name);area.dataset.fishingZone=place.id;area.style.cursor='pointer';const select=event=>{event.stopPropagation();chooseTag({...place,locationId:place.id,kind:'fishing',icon:'🎣'});};area.onclick=select;area.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(event);}};label.style.pointerEvents='none';}}
  for(const portal of environment.builderScene?.objects||[])if(portal.atlasDestination){shape('circle',{cx:portal.position.x,cy:portal.position.z,r:3,fill:portal.atlasDeedId?'#ffd781':'#67dcfa'},portal.name+(portal.atlasDeedId?' · Deed '+portal.atlasDeedId:''));}
  const footprints=document.createElementNS(ns,'g');footprints.dataset.liveFootprints='';svg.append(footprints);
  const routeLayer=document.createElementNS(ns,'g');routeLayer.dataset.liveRoute='';svg.append(routeLayer);const spawn=environment.spawn?.position||environment.spawn||{x:5,z:5};shape('circle',{cx:spawn.x,cy:spawn.z,r:2,fill:'#ff748d'},'Arrival');const players=document.createElementNS(ns,'g');players.setAttribute('data-live-players','');svg.append(players);const craftLayer=document.createElementNS(ns,'g');craftLayer.setAttribute('data-live-craft','');svg.append(craftLayer);const quests=document.createElementNS(ns,'g');quests.setAttribute('data-quest-markers','');svg.append(quests);const compass=node('span','↑ N',plan);compass.className='local-map-plan-compass';compass.setAttribute('aria-label','Compass: north is up');plan.append(planTools,svg,compass);node('p','● Places · ⚓ Craft · ↗ Portals · ◎ Quests',plan).className='local-map-legend';fitPlan();
  placesGroup.body.replaceChildren();for(const place of districtLocations(environment)){const details=node('details',null,placesGroup.body);details.dataset.mapSearchItem='';node('summary',place.name,details);node('p',place.description||'X '+place.x+' · Z '+place.z,details);const show=node('button','Show on map',details);show.type='button';show.onclick=()=>{selectSection('map');focusPlan(place);map3D?.focus({x:place.x,y:place.y||0,z:place.z},Math.max(30,place.width||0,place.depth||0)*1.6);};if(command){if(fishingMapAction(environment,live,selfId,place.id))addFishingAction(details,place.id);else{const go=node('button','Port to '+place.name,details);go.type='button';bindGameActionButton(go,()=>travel({locationId:place.id}));}}}
  craftSignature='';renderCraftChoices();
  renderVehicleRoutes();refreshLive();
 }
 button.onclick=async()=>{
  if(!mapReady())return;mini.close?.();if(!dialog.open)requestGameInputRelease('map-open');const current=++generation;mapView=window.matchMedia(mobileMapQuery).matches?'3d':'plan';title.textContent=environment.name;search.value='';atlasLoading=true;deedsGroup.details.hidden=true;deedsGroup.body.replaceChildren();selectSection('map');renderMap();status.textContent='Loading the live land directory…';(document.fullscreenElement||stage.closest('.house-explorer-shell')||document.body).append(dialog);document.exitPointerLock?.();button.setAttribute('aria-expanded','true');if(!dialog.open)dialog.show();dialog.scrollTop=0;fitCompanionMap();switchView(mapView);requestAnimationFrame(()=>{if(current!==generation||!dialog.open)return;fitCompanionMap();fitPlan();});
  try{const atlas=await fetchAtlas();if(current!==generation)return;const places=districtDestinations(environment,atlas.locations||[]);status.textContent=places.filter(place=>place.deedId).length+' recorded deeds · '+places.length+' connected destinations';deedsGroup.details.hidden=!places.length;atlasLoading=false;

   for(const place of places){const card=node('article',null,deedsGroup.body);card.dataset.mapSearchItem='';node('h4',place.name,card);node('p',(place.deedId?'Deed '+place.deedId:'World destination')+' · '+(place.ownerName||'Community'),card);const link=node('a','Enter '+place.name,card);link.href='model-explorer.html?environment='+encodeURIComponent(place.mapId)+'&autoplay=1';link.addEventListener('click',()=>actionLoading.begin('Loading '+place.name+'…'));}filterDirectory();
  }catch(error){if(current===generation){atlasLoading=false;deedsGroup.details.hidden=true;status.textContent=error.message;filterDirectory();}}
 };
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();}else if((event.key===' '||event.key==='Enter')&&event.target.closest?.('button,a[href],summary,[role=button]'))event.stopPropagation();});
 dialog.addEventListener('close',()=>{requestGameInputRelease('map-close');generation++;map3D?.dispose();map3D=null;button.setAttribute('aria-expanded','false');const target=mapReady()?button:stage.querySelector('canvas');target?.focus({preventScroll:true});});
 return {button,dialog,setReady(value){const next=value===true;if(next===requestedReady)return;requestedReady=next;applyReadiness();},updateLive(snapshot,id){live=snapshot;selfId=id;mini.updateLive(snapshot,id);if(dialog.open)liveUpdates.update();},update(value){live=null;selfId=null;craftButtons.clear();browsingReady=false;environment=value;mini.update(value);generation++;applyReadiness();if(dialog.open)dialog.close();},dispose(){disposed=true;liveUpdates.dispose();layoutResize.disconnect();layoutChanges.disconnect();if(layoutFrame!==null)cancelAnimationFrame(layoutFrame);window.removeEventListener('resize',scheduleMapLayout);window.removeEventListener('scroll',scheduleMapLayout);window.visualViewport?.removeEventListener('resize',scheduleMapLayout);window.visualViewport?.removeEventListener('scroll',scheduleMapLayout);generation++;map3D?.dispose();map3D=null;questPanel.dispose();planResize.disconnect();mini.dispose();mapStyle.remove();button.remove();dialog.remove();css.remove();}};
}
