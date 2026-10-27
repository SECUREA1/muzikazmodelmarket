import {factoryInspectorMarkup} from './world-supply-inspector.js';
import {fullscreenPanel} from './fullscreen-panels.js';
import {loadGameMenuStyles} from './game-menu-controls.js';
import {requestGameInputRelease} from './game-input-release.js';
import {signalInventoryChange} from './shared-game-inventory.js';
import {isShippingEnvironment,SHIPPING_ID,SHIPPING_PORTS,SHIPPING_VESSELS} from './shipping-config.js';

const count=value=>Math.max(0,Number(value)||0).toLocaleString();
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const terminal=new Set(['delivered','cancelled']);
const activeSeaJob=job=>['loading','secured','sailing','unloading'].includes(job?.phase);
const portName=id=>SHIPPING_PORTS.find(port=>port.id===id)?.name||id||'Port';
const html=(node,value)=>{if(node.dataset.render===value)return;node.dataset.render=value;node.innerHTML=value;};
export function filterSupplyItems(catalog,search=''){
 const words=String(search).trim().toLowerCase().split(/\s+/).filter(Boolean);
 return (catalog||[]).filter(item=>{const text=[item.name,item.id,item.buildAssetId,item.modelUrl,item.category,item.recipe?.name,(item.aliases||[]).join(' '),(item.nativeMaps||[]).map(map=>[map.id,map.name,...(map.aliases||[])].join(' ')).join(' ')].filter(Boolean).join(' ').toLowerCase();return words.every(word=>text.includes(word));});
}
export function supplyShipmentTask(shipment,mapId){
 if(shipment.phase==='delivered')return 'Delivered to destination inventory';
 if(shipment.phase==='cancelled')return 'Cancelled · cargo returned to source inventory';
 if(shipment.jobId||['reserved','sailing','in-transit','assigned'].includes(shipment.phase))return 'Assigned to a captain · complete the shipping manifest';
 return shipment.shippingMapId===mapId?'Board a ship at the origin port, then accept this shipment':'Travel to the assigned shipping map to take this task';
}
export function supplySourceStock(data,sourceMapId,itemId){
 const stock=sourceMapId==='factory'?data?.factoryStock:sourceMapId==='world'?data?.worldStock:data?.maps?.find(map=>map.id===sourceMapId)?.stock;
 return Math.max(0,Number(stock?.[itemId])||0);
}
export function supplyRouteCapacity(item,route,rules={}){
 const packing=Number(item?.recipe?.unitsPerContainer??rules.itemsPerContainer??1000),containers=Number(route?.units||4);
 return route&&Number.isSafeInteger(packing)&&packing>0?Math.min(Number(rules.maxQuantity)||10000,packing*containers):0;
}
export function supplyBuildPresentation(job,now){
 const stages=Array.isArray(job.stages)?job.stages:[],current=stages.find(stage=>stage.phase==='processing')||stages[job.stageIndex||0];
 if(job.phase==='paused')return {label:'Paused · remaining work preserved',progress:(job.progress||0)/100,remainingMs:job.remainingMs||0,current};
 if(job.phase==='ready')return {label:'Ready in factory stock · shipping required',progress:1,remainingMs:0,current};
 if(job.phase==='cancelled')return {label:'Cancelled · production cost refunded',progress:0,remainingMs:0,current};
 const remainingMs=Math.max(0,Number(current?.readyAt??job.readyAt)-now),duration=Math.max(1,Number(job.readyAt)-Number(job.startedAt));
 const progress=Number.isFinite(duration)&&Number.isFinite(Number(job.startedAt))?Math.max(0,Math.min(.99,(now-job.startedAt)/duration)):0;
 return {label:(current?.name||job.stageName||'Building')+(remainingMs>0?' · '+Math.ceil(remainingMs/1000)+'s remaining':' · confirming completed stage…'),progress,remainingMs,current};
}
export function supplyShipmentAccess(shipment,mapId,self,route){
 if(terminal.has(shipment.phase))return {action:'none',message:supplyShipmentTask(shipment,mapId)};
 if(shipment.jobId||shipment.phase==='reserved')return {action:shipment.jobId&&shipment.jobId===self?.shipping?.job?.id?'continue':'none',message:supplyShipmentTask(shipment,mapId)};
 if(shipment.shippingMapId!==mapId)return {action:'travel',message:'Travel to the shipping map, then board at '+portName(route?.from)+'.'};
 if(activeSeaJob(self?.shipping?.job))return {action:'none',message:'Finish or cancel your current sea manifest before taking another shipment.'};
 if(!self?.vehicleId)return {action:self?.shipping?.boardingId?'board':'chart',message:'Board a cargo ship at '+portName(route?.from)+'.'};
 const allowed=self?.shipping?.availableContracts;
 if(!Array.isArray(allowed)||!allowed.some(id=>(typeof id==='string'?id:id.id)===shipment.contractId))return {action:'origin',message:'Stop at '+portName(route?.from)+' aboard the required vessel to accept this shipment.'};
 return {action:'accept',message:'At the origin dock. Accept this item shipment, then load and secure its containers.'};
}

export function mountWorldSupplyUI({stage,inventory,command,showLabel=false,onOpen=()=>{},onClose=()=>{},onShipping=()=>{},onState=()=>{},onNavigate=null,announce=()=>{}}){
 loadGameMenuStyles();
 if(!document.querySelector('#world-supply-style')){const style=document.createElement('link');style.id='world-supply-style';style.rel='stylesheet';style.href=new URL('../css/world-supply.css',import.meta.url).href;document.head.append(style);}
 const toggle=document.createElement('button');toggle.type='button';toggle.className='factory-toggle world-supply-toggle';toggle.title='World item factory';toggle.setAttribute('aria-label','World item factory');toggle.setAttribute('aria-controls','world-supply-panel');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-haspopup','dialog');toggle.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 20V10l6 3V8l6 3V4h4v16H3ZM6 17h2m3 0h2m3 0h2M8 4l3-2 3 2M11 2v5"/></svg>';if(showLabel){toggle.classList.add('world-supply-toggle-label');toggle.insertAdjacentHTML('beforeend','<span>World item factory</span>');}stage.append(toggle);
 const panel=document.createElement('section');panel.id='world-supply-panel';panel.className='world-supply-panel';panel.hidden=true;panel.setAttribute('aria-label','World item factory');
 panel.innerHTML=`<div class="supply-intro"><span>WORLD SUPPLY NETWORK</span><h3>Build. Ship. Restock.</h3><p>Build any catalog item in batches. Factory output stays in the warehouse until a captain sails a verified shipping route and unloads it into destination stock.</p><p>World stock starts with 1,000 of each item. Untouched maps draw from that reserve. Delivered local stock depletes as it is bought or deployed and must be restocked through shipping. Warehouse links to shipping ports are simulated; sea passage is playable.</p></div>
 <p class="supply-status" data-status role="status" aria-live="polite">Loading world supply…</p>
 <section class="supply-inspector" data-inspector></section>
 <div class="supply-layout"><section><h3>1. Choose & build</h3><label>Find any item<input type="search" data-search placeholder="Search items, GLB models or production types" autocomplete="off"></label><p class="supply-muted" data-matches></p><label>Item<select data-item></select></label><div data-item-info></div><div class="supply-counts" data-counts></div><div class="supply-recipe" data-recipe></div><label>Quantity<input data-quantity type="number" min="1" max="10000" step="1" value="10" inputmode="numeric"></label><p data-discount class="supply-muted"></p><div class="supply-buttons"><button type="button" data-quote>Get price</button><button type="button" data-produce disabled>Start production</button></div><p data-price>Choose an item and request a price.</p><h4>Production orders</h4><p class="supply-muted">Each stage runs on the server. Completed builds enter factory stock; shipping is the next step.</p><div data-production></div></section>
 <section><h3>2. Reserve a shipment</h3><label>Source inventory<select data-source></select></label><p data-source-count class="supply-muted"></p><label>Destination inventory<select data-destination></select></label><label>Shipping map<select data-shipping-world></select></label><label>Shipping route<select data-route></select></label><p data-shipping-map class="supply-muted"></p><p data-capacity class="supply-route-detail"></p><div class="supply-buttons"><button type="button" data-max>Use maximum shipment</button><button type="button" data-dispatch>Dispatch selected item & quantity</button></div><p data-dispatch-reason class="supply-muted"></p><p class="supply-muted">The source stock is reserved when you dispatch. The destination receives it only after every route checkpoint, safe docking and full unloading.</p><h4 id="supply-shipment-heading" tabindex="-1">3. Sail & deliver</h4><label>Shipment tasks<select data-task-filter><option value="active">Active tasks</option><option value="queued">Waiting for a captain</option><option value="reserved">Assigned voyages</option><option value="delivered">Delivered</option><option value="all">All tasks</option></select></label><p data-task-count class="supply-muted"></p><div data-shipments></div><div class="supply-pagination"><button type="button" data-task-previous>Previous tasks</button><span data-task-page></span><button type="button" data-task-next>Next tasks</button></div></section></div>
 <section class="supply-stock"><div class="supply-stock-heading"><h3>Item-by-item stock</h3><label>Map inventory<select data-stock-map></select></label><button type="button" data-refresh>Refresh counts</button></div><div class="supply-table-scroll"><table><thead><tr><th scope="col">Item</th><th scope="col">World</th><th scope="col">Factory</th><th scope="col">Map</th></tr></thead><tbody data-stock></tbody></table></div><div class="supply-pagination"><button type="button" data-previous>Previous</button><span data-page></span><button type="button" data-next>Next</button></div></section>`;
 const $=selector=>panel.querySelector(selector);
 let environment=null,self=null,actorId=null,data=null,busy=false,disposed=false,revision=0,page=0,taskPage=0,quote=null,quoteKey='',pollTimer=null,tickTimer=null,refreshTask=null,stockMap='',selection='',destination='',sourceMapId='factory',selectedShippingMap='',routeId='gulf-gateway',serverAt=0,receivedAt=0,notice='',requestedSection=null,inspectedProductionId=null,inspectedStageId=null,traceData=null,traceRequest=0,recipeDetails=null,recipeRequest=0;
 const pending=new Map(),extraToggles=[];
 const currentId=()=>environment?.id||'';
 const item=()=>data?.catalog?.find(row=>row.id===selection);
 const route=()=>data?.routes?.find(row=>row.id===routeId);
 const quantity=()=>Number($('[data-quantity]').value);
 const selectionKey=()=>JSON.stringify([selection,quantity()]);
 const now=()=>serverAt+Math.max(0,performance.now()-receivedAt);
 const status=message=>{notice=message;$('[data-status]').textContent=message;};
 const screen=fullscreenPanel(panel,{onOpen:()=>{document.exitPointerLock?.();requestGameInputRelease('world-supply-open');onOpen();clearInterval(pollTimer);clearInterval(tickTimer);pollTimer=setInterval(()=>{if(!busy)void refresh();},5000);tickTimer=setInterval(renderBuildClocks,250);void refresh();},onClose:()=>{clearInterval(pollTimer);clearInterval(tickTimer);pollTimer=tickTimer=null;onClose();}});
 screen.dialog.classList.add('world-supply-dialog');
 function selectedOptions(select,records,selected){const signature=JSON.stringify(records.map(row=>[row.id,row.name]));if(select.dataset.signature!==signature){select.dataset.signature=signature;select.replaceChildren();for(const row of records){const option=document.createElement('option');option.value=row.id;option.textContent=row.name||row.id;select.append(option);}}if(select.value!==selected)select.value=selected;}
 function invalidateQuote(){quote=null;quoteKey='';$('[data-price]').textContent='Choose an item and request a price.';renderControls();}
 function renderControls(){
  const valid=!!item()&&Number.isSafeInteger(quantity())&&quantity()>0&&quantity()<=(data?.rules?.maxQuantity||10000),available=supplySourceStock(data,sourceMapId,selection),capacity=supplyRouteCapacity(item(),route(),data?.rules);
  for(const selector of ['[data-item]','[data-quantity]','[data-search]','[data-destination]','[data-source]','[data-shipping-world]','[data-route]'])$(selector).disabled=busy;
  $('[data-quote]').disabled=busy||!valid;$('[data-produce]').disabled=busy||!valid||!quote||quoteKey!==selectionKey();
  const reason=!valid?'Choose a whole item quantity.':!destination?'Choose a destination.':sourceMapId===destination?'Choose a different destination inventory.':!route()||!selectedShippingMap?'Choose an available shipping map and route.':quantity()>capacity?'This route holds '+count(capacity)+' of this item. Use a smaller batch or a larger manifest.':available<quantity()?'The selected source needs '+count(quantity()-available)+' more units before dispatch.':'';
  $('[data-dispatch]').disabled=busy||!!reason;$('[data-dispatch-reason]').textContent=reason||'Ready to reserve '+count(quantity())+' units for a verified sea delivery.';
  $('[data-max]').disabled=busy||!item()||!route()||Math.min(available,capacity)<1;
  $('[data-refresh]').disabled=busy;for(const button of panel.querySelectorAll('[data-sea-action],[data-cancel-shipment],[data-cancel-production],[data-ready-dispatch],[data-pause-production],[data-resume-production]'))button.disabled=busy;
  $('[data-source-count]').textContent='Available at source: '+count(available)+' units of the selected item.';
  const local=data?.maps?.find(map=>map.id===currentId());$('[data-counts]').textContent=item()?`World: ${count(data.worldStock?.[selection])} · Factory: ${count(data.factoryStock?.[selection])} · This map: ${count(local?.stock?.[selection])}`:'';
  const selected=route(),vessel=SHIPPING_VESSELS.find(ship=>ship.modelId===selected?.requiredVessel);
  $('[data-capacity]').textContent=selected?portName(selected.from)+' → '+portName(selected.to)+' · '+(selected.units||4)+' containers · '+count(capacity)+' items maximum'+(vessel?' · '+vessel.name+' or larger':''):'';
 }
 function renderInspector(){
  const job=data?.production?.find(job=>job.id===inspectedProductionId);
  if(job&&Array.isArray(data.lots)){
   const lots=data.lots.filter(lot=>lot.productionId===job.id),ids=new Set(lots.map(lot=>lot.id)),allocations=(data.allocations||[]).filter(allocation=>allocation.lots.some(line=>ids.has(line.lotId))),shipments=(data.shipments||[]).filter(shipment=>allocations.some(allocation=>allocation.shipmentId===shipment.id));
   traceData={lots,allocations,shipments,stockReceipts:(data.stockReceipts||[]).filter(receipt=>shipments.some(shipment=>shipment.id===receipt.shipmentId))};
  }
  html($('[data-inspector]'),factoryInspectorMarkup({item:item()?{...item(),recipe:quoteKey===selectionKey()&&quote?.recipe||recipeDetails?.recipe||item().recipe}:null,job,trace:job?traceData:null,stageId:inspectedStageId,now:job?.effectiveAt||now()}));renderControls();
 }
 async function inspectProduction(id){
  inspectedProductionId=id;traceData=null;const request=++traceRequest;renderInspector();$('[data-inspector]').scrollIntoView({block:'start'});$('[data-inspector]').querySelector('[data-pause-production],[data-resume-production]')?.focus({preventScroll:true});
  try{const trace=await inventory.api('/api/world-supply/trace?productionId='+encodeURIComponent(id));if(disposed||request!==traceRequest)return;traceData=trace;renderInspector();}catch(error){if(request===traceRequest)status(error.message);}
 }
 async function loadRecipe(){
  if(!selection)return;const id=selection,request=++recipeRequest;
  try{const plan=await inventory.api('/api/world-supply/recipe?itemId='+encodeURIComponent(id));if(disposed||request!==recipeRequest||selection!==id)return;recipeDetails=plan;renderRecipe();renderInspector();}catch{}
 }
 function renderRecipe(){
  const selected=item(),recipe=quoteKey===selectionKey()&&quote?.recipe||recipeDetails?.recipe||selected?.recipe;
  html($('[data-item-info]'),selected?'<strong>'+esc(selected.name)+'</strong><p class="supply-muted">'+esc([selected.modelUrl?'GLB / 3D model':selected.kind==='care'?'Care supply':'Native world item',selected.category,selected.description].filter(Boolean).join(' · '))+'</p>'+(selected.nativeMaps?.length?'<p class="supply-muted">Used in: '+selected.nativeMaps.map(map=>esc(map.name||map.id)+(map.count?' × '+count(map.count):'')).join(' · ')+'</p>':''):'');
  html($('[data-recipe]'),recipe?'<strong>'+esc(recipe.name)+'</strong><p>'+esc(recipe.description||'')+'</p><ol>'+(recipe.stages||[]).map(stage=>'<li><strong>'+esc(stage.name)+'</strong>'+ (stage.description?'<span>'+esc(stage.description)+'</span>':'')+'</li>').join('')+'</ol><small>'+count(recipe.unitsPerContainer)+' units per shipping container. Finished output requires shipping.</small>':'<p>Get a server quote to review this item’s production time and bulk price. Finished output requires shipping.</p>');
 }
 function renderCatalog(){
  const matches=filterSupplyItems(data?.catalog,$('[data-search]').value);$('[data-matches]').textContent=`${matches.length.toLocaleString()} items · Native items, tools, supplies and 3D models`;
  const previous=selection;if(!matches.some(row=>row.id===selection))selection=matches[0]?.id||'';
  selectedOptions($('[data-item]'),matches,selection);if(previous!==selection){recipeDetails=null;invalidateQuote();void loadRecipe();}renderRecipe();renderControls();renderStocks();
 }
 function renderStocks(){
  const rows=filterSupplyItems(data?.catalog,$('[data-search]').value),pages=Math.max(1,Math.ceil(rows.length/30));page=Math.max(0,Math.min(page,pages-1));const map=data?.maps?.find(row=>row.id===stockMap);
  html($('[data-stock]'),rows.slice(page*30,(page+1)*30).map(row=>'<tr><th scope="row">'+esc(row.name)+'<small>'+esc(row.id)+'</small></th><td>'+count(data.worldStock?.[row.id])+'</td><td>'+count(data.factoryStock?.[row.id])+'</td><td>'+count(map?.stock?.[row.id])+'</td></tr>').join('')||'<tr><td colspan="4">No items match your search.</td></tr>');
  $('[data-page]').textContent=`Page ${page+1} of ${pages}`;$('[data-previous]').disabled=page===0;$('[data-next]').disabled=page>=pages-1;
 }
 function renderBuildClocks(){
  if(!screen.dialog.open||!data)return;
  for(const node of panel.querySelectorAll('[data-build-id]')){const job=data.production?.find(row=>row.id===node.dataset.buildId);if(!job)continue;const view=supplyBuildPresentation(job,now());node.querySelector('[data-build-status]').textContent=view.label;node.querySelector('progress').value=view.progress;}
 }
 function renderTasks(){
  if(!data)return;const names=new Map((data.catalog||[]).map(row=>[row.id,row.name])),maps=new Map((data.maps||[]).map(row=>[row.id,row.name]));
  const production=[...(data.production||[]).filter(row=>['building','paused'].includes(row.phase)).reverse(),...(data.production||[]).filter(row=>!['building','paused'].includes(row.phase)).slice(-10).reverse()];
  html($('[data-production]'),production.map(row=>'<article class="supply-task" data-build-id="'+esc(row.id)+'"><strong>'+esc(names.get(row.itemId)||row.itemId)+' × '+count(row.quantity)+'</strong><span data-build-status></span><progress max="1" value="0" aria-label="'+esc((names.get(row.itemId)||row.itemId)+' production progress')+'"></progress>'+(row.stages?.length?'<ol class="supply-stages">'+row.stages.map(stage=>'<li data-phase="'+esc(stage.phase)+'"><strong>'+esc(stage.name)+'</strong><span>'+esc(stage.phase==='complete'?'Complete':stage.phase==='processing'?'In progress':'Waiting')+'</span></li>').join('')+'</ol>':'')+'<button type="button" data-inspect-production="'+esc(row.id)+'">Inspect operations & trace</button>'+(row.phase==='building'?'<button type="button" data-pause-production="'+esc(row.id)+'">Pause production</button>':row.phase==='paused'?'<button type="button" data-resume-production="'+esc(row.id)+'">Resume production</button>':'')+(['building','paused'].includes(row.phase)?'<button type="button" data-cancel-production="'+esc(row.id)+'">Cancel production & refund</button>':row.phase==='ready'?'<button type="button" data-ready-dispatch="'+esc(row.id)+'">Prepare shipment</button>':'')+'</article>').join('')||'<p class="supply-muted">No production orders yet.</p>');renderBuildClocks();
  const filter=$('[data-task-filter]').value,all=(data.shipments||[]).filter(row=>filter==='all'||filter==='active'&&!terminal.has(row.phase)||row.phase===filter).slice().reverse(),pages=Math.max(1,Math.ceil(all.length/10));taskPage=Math.max(0,Math.min(taskPage,pages-1));
  $('[data-task-count]').textContent=all.length+' matching shipment tasks. Active cargo remains reserved until delivery or cancellation.';
  html($('[data-shipments]'),all.slice(taskPage*10,(taskPage+1)*10).map(row=>{
   const selectedRoute=data.routes?.find(route=>route.id===row.contractId),access=supplyShipmentAccess(row,currentId(),self,selectedRoute),source=row.sourceMapId&&row.sourceMapId!=='factory'?(maps.get(row.sourceMapId)||row.sourceMapId):'Factory output';
   const labels={travel:'Travel to shipping map',board:'Board cargo ship',chart:'Open origin port chart',origin:'Navigate to origin port',accept:'Accept shipping task',continue:'Continue sea delivery'};
   const action=access.action!=='none'?'<button type="button" data-sea-action="'+esc(access.action)+'" data-shipment="'+esc(row.id)+'">'+labels[access.action]+'</button>':'';
   return '<article class="supply-task"><strong>'+esc(names.get(row.itemId)||row.itemName||row.itemId)+' × '+count(row.quantity)+'</strong><span>From '+esc(source)+' → To '+esc(maps.get(row.destinationMapId)||row.destinationMapId)+'</span><span>'+esc(access.message)+'</span><small>'+esc(data.shippingMaps?.find(map=>map.id===row.shippingMapId)?.name||row.shippingMapId)+' · '+esc(portName(selectedRoute?.from))+' → '+esc(portName(selectedRoute?.to))+(row.packing?' · '+count(row.packing.containersRequired)+' sealed / '+count(row.packing.containerSlots)+' manifest containers':'')+'</small><div class="supply-buttons">'+action+(row.phase==='queued'&&!row.jobId?'<button type="button" data-cancel-shipment="'+esc(row.id)+'">Return cargo to source</button>':'')+'</div></article>';
  }).join('')||'<p class="supply-muted">No matching tasks. Dispatch completed stock to create a sea delivery.</p>');
  $('[data-task-page]').textContent=`Page ${taskPage+1} of ${pages}`;$('[data-task-previous]').disabled=taskPage===0;$('[data-task-next]').disabled=taskPage>=pages-1;renderControls();
 }
 function render(){
  if(!data)return;const maps=data.maps||[];
  if(!maps.some(row=>row.id===destination))destination=maps.some(row=>row.id===currentId())?currentId():maps[0]?.id||'';
  if(!maps.some(row=>row.id===stockMap))stockMap=maps.some(row=>row.id===currentId())?currentId():maps[0]?.id||'';
  const sources=[{id:'factory',name:'Factory output'},...maps];if(!sources.some(row=>row.id===sourceMapId))sourceMapId='factory';selectedOptions($('[data-source]'),sources,sourceMapId);selectedOptions($('[data-destination]'),maps,destination);selectedOptions($('[data-stock-map]'),maps,stockMap);
  const shippingMaps=Array.isArray(data.shippingMaps)?data.shippingMaps:[{id:SHIPPING_ID,name:'Strait of Hormuz Shipping Academy'},...(isShippingEnvironment(environment)&&currentId()!==SHIPPING_ID?[{id:currentId(),name:environment.name||currentId()}]:[])];
  if(!shippingMaps.some(row=>row.id===selectedShippingMap))selectedShippingMap=shippingMaps.some(row=>row.id===currentId())?currentId():shippingMaps.find(row=>row.id===SHIPPING_ID)?.id||shippingMaps[0]?.id||'';
  selectedOptions($('[data-shipping-world]'),shippingMaps,selectedShippingMap);const routes=data.routes||[];if(!routes.some(row=>row.id===routeId))routeId=routes[0]?.id||'';selectedOptions($('[data-route]'),routes,routeId);
  const rules=data.rules||{};$('[data-quantity]').max=rules.maxQuantity||10000;$('[data-discount]').textContent=`${rules.bulkDiscountPercent??20}% bulk discount from ${rules.bulkMinimum??10} units. Completed output enters shared factory stock.`;
  $('[data-shipping-map]').textContent='Choose the route for the actual sea leg. Tasks below guide you to its origin dock.';renderCatalog();renderTasks();renderInspector();
  if(requestedSection==='shipments'){$('[data-task-filter]').value='active';taskPage=0;renderTasks();$('[data-task-filter]').scrollIntoView({block:'center'});$('[data-task-filter]').focus();requestedSection=null;}
 }
 function refresh({manual=false,force=false}={}){
  if(disposed)return Promise.resolve();
  if(refreshTask)return force?refreshTask.then(()=>refresh({manual})):refreshTask;
  const context=revision;
  refreshTask=(async()=>{
   try{const next=await inventory.api('/api/world-supply?mapId='+encodeURIComponent(currentId()));if(disposed||context!==revision)return;data=next;onState(next);serverAt=Number(next.serverTime)||Date.now();receivedAt=performance.now();render();if(!notice||manual)status('Counts synchronized. Build an item, reserve cargo, then complete its sea delivery.');}
   catch(error){if(!disposed&&context===revision)status(error.message);}
   finally{refreshTask=null;if(!disposed&&context!==revision&&screen.dialog.open)void refresh();}
  })();
  return refreshTask;
 }
 async function post(operation,fields){
  const session=await inventory.session(),key=operation+':'+JSON.stringify(fields);if(!pending.has(key))pending.set(key,crypto.randomUUID());
  const result=await inventory.api('/api/world-supply/'+operation,{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify({...fields,mapId:currentId(),requestId:pending.get(key)})});pending.delete(key);return result;
 }
 async function run(operation,fields){
  if(busy||disposed)return;const context=revision;if(operation==='quote'){quote=null;quoteKey='';$('[data-price]').textContent='Requesting server price…';}busy=true;renderControls();status('Saving '+operation+'…');
  try{const result=await post(operation,fields);if(disposed||context!==revision)return;
   if(operation==='quote'){quote=result;quoteKey=selectionKey();$('[data-price]').textContent=`${count(result.priceMzk)} MZK · ${Number(result.discountPercent)||0}% discount · ${Math.ceil((Number(result.buildMs)||0)/1000)}s build`;renderRecipe();renderInspector();status('Server price received. Start production to run each production stage.');}
   else{signalInventoryChange();window.MZKWallet?.refreshShared?.().catch(()=>{});await refresh({force:true});if(context===revision)status(result.message||(operation==='produce'?'Production started. Finished output must be shipped before stores can use it.':operation==='dispatch'?'Shipment reserved. Follow the sea delivery task below.':'World supply updated.'));if(operation==='produce'){void inspectProduction(result.id);}if(operation==='pause'||operation==='resume'){void inspectProduction(fields.productionId);}if(operation==='dispatch'){taskPage=0;$('[data-task-filter]').value='active';renderTasks();$('[data-task-filter]').scrollIntoView({block:'center'});}}
  }catch(error){if(!disposed&&context===revision)status(error.message);}
  finally{if(context===revision){busy=false;renderControls();}}
 }
 function open(options={}){requestedSection=options.section||null;inspectedStageId=options.stageId||inspectedStageId;screen.open();if(data)render();}
 toggle.onclick=()=>open();$('[data-search]').addEventListener('input',()=>{page=0;invalidateQuote();renderCatalog();});$('[data-item]').onchange=event=>{selection=event.target.value;recipeDetails=null;inspectedProductionId=null;traceData=null;void loadRecipe();invalidateQuote();renderRecipe();renderInspector();};$('[data-quantity]').oninput=invalidateQuote;
 for(const [selector,update]of [['[data-destination]',value=>destination=value],['[data-source]',value=>sourceMapId=value],['[data-route]',value=>routeId=value],['[data-shipping-world]',value=>selectedShippingMap=value]])$(selector).onchange=event=>{update(event.target.value);renderControls();};
 $('[data-stock-map]').onchange=event=>{stockMap=event.target.value;renderStocks();};$('[data-task-filter]').onchange=()=>{taskPage=0;renderTasks();};$('[data-task-previous]').onclick=()=>{taskPage--;renderTasks();};$('[data-task-next]').onclick=()=>{taskPage++;renderTasks();};
 $('[data-max]').onclick=()=>{$('[data-quantity]').value=Math.min(supplySourceStock(data,sourceMapId,selection),supplyRouteCapacity(item(),route(),data?.rules));invalidateQuote();};
 $('[data-quote]').onclick=()=>run('quote',{itemId:selection,quantity:quantity()});$('[data-produce]').onclick=()=>run('produce',{itemId:selection,quantity:quantity(),expectedPriceMzk:quote?.priceMzk});$('[data-dispatch]').onclick=()=>run('dispatch',{itemId:selection,quantity:quantity(),sourceMapId,destinationMapId:destination,contractId:routeId,shippingMapId:selectedShippingMap});
 $('[data-refresh]').onclick=()=>refresh({manual:true});$('[data-previous]').onclick=()=>{page--;renderStocks();};$('[data-next]').onclick=()=>{page++;renderStocks();};
 panel.addEventListener('click',event=>{const pause=event.target.closest('[data-pause-production]'),resume=event.target.closest('[data-resume-production]');if(pause||resume){void run(pause?'pause':'resume',{productionId:pause?.dataset.pauseProduction||resume.dataset.resumeProduction});return;}const stage=event.target.closest('[data-inspect-stage]');if(stage){inspectedStageId=stage.dataset.inspectStage;renderInspector();}});
 $('[data-production]').onclick=event=>{const inspect=event.target.closest('[data-inspect-production]');if(inspect){void inspectProduction(inspect.dataset.inspectProduction);return;}const cancel=event.target.closest('[data-cancel-production]');if(cancel){void run('cancel',{productionId:cancel.dataset.cancelProduction});return;}const ready=event.target.closest('[data-ready-dispatch]'),job=data?.production?.find(row=>row.id===ready?.dataset.readyDispatch);if(job){selection=job.itemId;sourceMapId='factory';$('[data-search]').value='';$('[data-quantity]').value=Math.min(job.quantity,supplyRouteCapacity(data.catalog.find(row=>row.id===job.itemId),route(),data.rules));invalidateQuote();render();$('[data-source]').scrollIntoView({block:'center'});$('[data-source]').focus();}};
 $('[data-shipments]').onclick=async event=>{
  const cancel=event.target.closest('[data-cancel-shipment]');if(cancel){void run('cancel',{shipmentId:cancel.dataset.cancelShipment});return;}
  const action=event.target.closest('[data-sea-action]');if(!action||busy)return;const row=data?.shipments?.find(value=>value.id===action.dataset.shipment);if(!row)return;
  const operation=action.dataset.seaAction,selectedRoute=data.routes?.find(route=>route.id===row.contractId),context=revision;
  if(operation==='travel'){screen.close();if(onNavigate){try{await onNavigate(row.shippingMapId);}catch(error){if(context===revision){open({section:'shipments'});status(error.message);}}}else{const target=new URL('model-explorer.html',location.href);target.searchParams.set('environment',row.shippingMapId);target.searchParams.set('mode','multiplayer');location.assign(target.href);}return;}
  if(operation==='chart'||operation==='continue'){screen.close();onShipping({portId:selectedRoute?.from});return;}
  busy=true;renderControls();
  try{if(typeof command!=='function')throw new Error('Join the live shipping map to operate a cargo vessel.');const result=await command(operation==='origin'?'vehicle-navigate':'shipping',operation==='origin'?{destinationId:selectedRoute?.from}:operation==='board'?{operation:'board',entityId:self?.shipping?.boardingId}:{operation:'accept',contractId:row.contractId,shipmentId:row.id});if(!result)throw new Error('Join the live shipping map before accepting a task.');if(context!==revision)return;if(result.players){const id=result.selfId||actorId;self=result.players[id]||self;}if(operation==='board'){renderTasks();status('Vessel boarded. At the origin dock, accept this item shipment.');}else{screen.close();if(operation==='accept')onShipping({portId:selectedRoute?.from});announce(operation==='accept'?'Cargo assigned. Load, secure and sail the manifest to restock its destination.':'Navigating to the shipment’s origin port.');}}
  catch(error){if(context===revision)status(error.message);}
  finally{if(context===revision){busy=false;renderControls();}}
 };
 return {attachToggle(parent){const extra=toggle.cloneNode(true);extra.onclick=()=>open();parent.append(extra);extraToggles.push(extra);return extra;},open,close:()=>screen.close(),visible:()=>screen.dialog.open,refresh,update(snapshot,selfId,env){if(disposed)return;const changed=env?.id!==environment?.id,previousSelf=JSON.stringify([self?.vehicleId,self?.shipping?.availableContracts,self?.shipping?.boardingId,self?.shipping?.job?.id,self?.shipping?.job?.phase]);environment=env||environment;actorId=selfId||actorId;self=snapshot?.players?.[actorId]||null;if(changed){revision++;recipeRequest++;traceRequest++;recipeDetails=null;traceData=null;busy=false;data=null;quote=null;quoteKey='';selectedShippingMap='';notice='';if(screen.dialog.open){status('Loading destination map…');void refresh();}}else if(screen.dialog.open&&previousSelf!==JSON.stringify([self?.vehicleId,self?.shipping?.availableContracts,self?.shipping?.boardingId,self?.shipping?.job?.id,self?.shipping?.job?.phase]))renderTasks();},reset(){revision++;recipeRequest++;traceRequest++;recipeDetails=null;traceData=null;busy=false;data=null;quote=null;self=null;notice='';screen.close();},dispose(){disposed=true;revision++;clearInterval(pollTimer);clearInterval(tickTimer);screen.close();screen.disconnect();screen.dialog.remove();toggle.remove();for(const extra of extraToggles)extra.remove();}};
}
