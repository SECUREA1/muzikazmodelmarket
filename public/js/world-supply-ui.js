import {factoryInspectorMarkup} from './world-supply-inspector.js';
import {fullscreenPanel} from './fullscreen-panels.js';
import {loadGameMenuStyles} from './game-menu-controls.js';
import {requestGameInputRelease} from './game-input-release.js';
import {signalInventoryChange} from './shared-game-inventory.js';
import {mountWorldFactoryDesigner} from './world-factory-designer.js';
import {deedDeliveryRecords,deedDeliveryRoute,deedDeliveryRouteMarkup,deedDeliveryTasksMarkup} from './world-deed-delivery-ui.js';
import {supplyAddressRecords,supplyAddressMatches,supplyAddressLabel,supplyAddressMarkup,supplyAddressRoute} from './world-supply-address-ui.js';
export {factoryDeedOrderUrl} from './world-factory-links.js';
import {isShippingEnvironment,SHIPPING_ID,SHIPPING_PORTS,SHIPPING_VESSELS} from './shipping-config.js';
import {straitAirRoute,straitPortFreight} from './strait-freight-network.js';
import {airFreightRows,airFreightFinished,airFreightTaskMarkup} from './world-air-freight-ui.js';

const count=value=>Math.max(0,Number(value)||0).toLocaleString();
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const terminal=new Set(['delivered','cancelled']);
const activeSeaJob=job=>['loading','secured','sailing','unloading'].includes(job?.phase);
const portName=id=>SHIPPING_PORTS.find(port=>port.id===id)?.name||id||'Port';
const originPort=(shipment,route)=>shipment.originPortId||shipment.portTransferTask?.toPortId||route?.from;
const destinationPort=(shipment,route)=>shipment.destinationPortId||route?.to;
const productionSource=item=>typeof item?.productionSource==='string'?item.productionSource:item?.productionSource?.label||item?.productionSource?.name||'';
const inactiveBlueprintMessage='Blueprint no longer listed. Existing stock can still be shipped.';
const html=(node,value)=>{if(node.dataset.render===value)return;node.dataset.render=value;node.innerHTML=value;};
export function supplySelectableCatalog(data){
 const items=new Map((data?.catalog||[]).map(item=>[item.id,item]));
 for(const item of data?.transferCatalog||[])if(!items.has(item.id))items.set(item.id,{...item,factoryProducible:false});
 return [...items.values()];
}
export function filterSupplyItems(catalog,search=''){
 const words=String(search).trim().toLowerCase().split(/\s+/).filter(Boolean);
 return (catalog||[]).filter(item=>{const text=[item.name,item.id,item.buildAssetId,item.modelUrl,item.category,item.recipe?.name,productionSource(item),item.factoryVariant?'custom blueprint':'',item.renderKind==='image'?'custom artwork':'',item.factoryProducible===false?'unlisted stock transfer only':'',(item.aliases||[]).join(' '),(item.nativeMaps||[]).map(map=>[map.id,map.name,...(map.aliases||[])].join(' ')).join(' ')].filter(Boolean).join(' ').toLowerCase();return words.every(word=>text.includes(word));});
}
export function supplyPortTransferText(shipment,route){
 const task=shipment.portTransferTask;if(!task)return '';
 const quantity=count(task.quantity),port=portName(originPort(shipment,route));
 const state=task.phase==='delivered'?'Sea delivery completed':task.phase==='returned'?'Returned to the source warehouse':task.phase==='loading'?'Loading at '+port:'Staged at '+port;
 return state+' · '+quantity+' units · warehouse → port transfer simulated; sea passage playable.';
}
export function supplyShipmentTask(shipment,mapId){
 if(shipment.phase==='delivered')return 'Delivered to destination inventory';
 if(shipment.phase==='cancelled')return shipment.seaReceipt?'Cancelled · unsent cargo held at the receiving port':'Cancelled · cargo returned to source inventory';
 if(shipment.phase==='port-held')return 'Cargo held at the receiving port';
 if(shipment.onwardMode==='air'&&shipment.seaReceipt&&!['land-transit','loading-trucks','doorstep-delivery'].includes(shipment.phase))return 'Sea unload confirmed · shore transfer and verified air delivery required before final trucks';
 if(shipment.phase==='port-received')return 'Sea unload confirmed · splitting cargo into truck loads';
 if(['land-transit','loading-trucks','doorstep-delivery'].includes(shipment.phase))return 'Automatic truck delivery underway · stock arrives after the deed drop-off';
 if(shipment.seaReceipt)return 'Sea arrival confirmed · final delivery is waiting for a clear route';
 if(shipment.jobId||['reserved','sailing','in-transit','assigned'].includes(shipment.phase))return 'Assigned to a captain · complete the shipping manifest';
 return shipment.shippingMapId===mapId?'Board a ship at the origin port, then accept this shipment':'Travel to the assigned shipping map to take this task';
}
export function supplySourceStock(data,sourceMapId,itemId){
 const stock=sourceMapId==='factory'?(data?.availableFactoryStock||data?.factoryStock):sourceMapId==='world'?data?.worldStock:data?.maps?.find(map=>map.id===sourceMapId)?.stock;
 return Math.max(0,Number(stock?.[itemId])||0);
}
export function supplyChallengeMatchesSelection(challenge,selection){
 return !!challenge&&['itemId','quantity','sourceMapId','destinationMapId','shippingMapId','contractId'].every(key=>challenge[key]===selection[key]);
}
export function supplyRouteCapacity(item,route,rules={}){
 const packing=Number(item?.recipe?.unitsPerContainer??rules.itemsPerContainer??1000),containers=Number(route?.units||4);
 return route&&Number.isSafeInteger(packing)&&packing>0?Math.min(Number(rules.maxQuantity)||10000,packing*containers):0;
}
export function supplyOrderPresentation(order){
 const labels={building:'Manufacturing through four stages',paused:'Production paused', 'awaiting-shipping':'Packed · waiting for a captain','in-transit':'Shipping in progress','port-received':order.onwardMode==='air'?'Sea arrival confirmed · shore and air freight pending':'Port arrival confirmed · preparing trucks','awaiting-air':'At departure apron · waiting for a pilot','awaiting-air-cargo':'Port truck → departure apron · waiting for a pilot','air-transit':'Air freight in progress','loading-trucks':'Breaking down cargo into truck loads','land-transit':'Truck delivery in progress','doorstep-delivery':'Final approach to the deed drop-off',blocked:'Delivery held · route needs clearance',delivered:'Delivered to deed inventory',cancelled:'Order cancelled',attention:'Order needs attention'};
 return {label:labels[order.phase]||'Confirming order status',delivered:Math.max(0,Number(order.deliveredQuantity)||0),total:Math.max(0,Number(order.quantity)||0)};
}
export function supplyOnwardAvailability(route,shippingMapId=SHIPPING_ID){
 const connection=straitPortFreight(route?.to),air=route?.to?straitAirRoute(route.to):null;
 return {connection,air,available:shippingMapId===SHIPPING_ID&&!!air,reason:shippingMapId!==SHIPPING_ID?'Air onward freight is available on the Strait shipping map.':!air?'This receiving port has no approved airfield. Use its shore road and truck connection.':''};
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
 if(['port-received','land-transit','loading-trucks','doorstep-delivery','port-held'].includes(shipment.phase))return {action:'none',message:supplyShipmentTask(shipment,mapId)};
 if(shipment.seaReceipt)return {action:'none',message:supplyShipmentTask(shipment,mapId)};
 if(shipment.jobId||shipment.phase==='reserved')return {action:shipment.jobId&&shipment.jobId===self?.shipping?.job?.id?'continue':'none',message:supplyShipmentTask(shipment,mapId)};
 if(shipment.shippingMapId!==mapId)return {action:'travel',message:'Travel to the shipping map, then board at '+portName(originPort(shipment,route))+'.'};
 if(activeSeaJob(self?.shipping?.job))return {action:'none',message:'Finish or cancel your current sea manifest before taking another shipment.'};
 if(!self?.vehicleId)return {action:self?.shipping?.boardingId?'board':'chart',message:'Board a cargo ship at '+portName(originPort(shipment,route))+'.'};
 const allowed=self?.shipping?.availableContracts;
 if(!Array.isArray(allowed)||!allowed.some(id=>(typeof id==='string'?id:id.id)===shipment.contractId))return {action:'origin',message:'Stop at '+portName(originPort(shipment,route))+' aboard the required vessel to accept this shipment.'};
 return {action:'accept',message:'At the origin dock. Accept this item shipment, then load and secure its containers.'};
}

export function mountWorldSupplyUI({stage,inventory,command,showLabel=false,onOpen=()=>{},onClose=()=>{},onShipping=()=>{},onMap=()=>{},onState=()=>{},onNavigate=null,announce=()=>{}}){
 loadGameMenuStyles();
 if(!document.querySelector('#world-supply-style')){const style=document.createElement('link');style.id='world-supply-style';style.rel='stylesheet';style.href=new URL('../css/world-supply.css',import.meta.url).href;document.head.append(style);}
 const toggle=document.createElement('button');toggle.type='button';toggle.className='factory-toggle world-supply-toggle';toggle.title='World item factory';toggle.setAttribute('aria-label','World item factory');toggle.setAttribute('aria-controls','world-supply-panel');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-haspopup','dialog');toggle.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 20V10l6 3V8l6 3V4h4v16H3ZM6 17h2m3 0h2m3 0h2M8 4l3-2 3 2M11 2v5"/></svg>';if(showLabel){toggle.classList.add('world-supply-toggle-label');toggle.insertAdjacentHTML('beforeend','<span>World item factory</span>');}stage.append(toggle);
 const panel=document.createElement('section');panel.id='world-supply-panel';panel.className='world-supply-panel';panel.hidden=true;panel.setAttribute('aria-label','World item factory');
 panel.innerHTML=`<div class="supply-intro"><span>WORLD SUPPLY NETWORK</span><h3>Build. Ship. Restock.</h3><p>Build any catalog item in batches. Factory output stays in the warehouse until a captain sails a verified shipping route and unloads it at the receiving port. Orders to stores, buildings and deeds continue along port roads, optionally by aircraft, then by truck and a final doorstep approach before reaching local stock.</p><p>Public world stock starts with 1,000 of each item. Private custom designs start at zero. Untouched maps draw from that reserve. Delivered local stock depletes as it is bought or deployed and must be restocked through shipping. Warehouse links to shipping ports are simulated; sea passage is playable.</p></div>
 <p class="supply-status" data-status role="status" aria-live="polite">Loading world supply…</p>
 <section class="supply-deed-orders" aria-label="Deed supply orders"><h3>Order supplies for a deed, store or building</h3><p class="supply-muted">Choose an owned deed or public delivery address, item and quantity, then review the price. The factory builds and packs your order and creates the shipping tasks automatically. The receiving map gains stock after the truck delivery and final drop-off. Sea unloading keeps goods reserved at the receiving port.</p><label>Receiving deed<select data-deed><option value="">Choose an owned deed</option></select></label><p data-deed-summary class="supply-muted"></p><section class="supply-address-picker" aria-label="Store and building delivery addresses"><h4>Or ship to a public address</h4><label>Receiving map<select data-address-map></select></label><label>Find a store or building<input data-address-search type="search" placeholder="Store, building, street or owner" autocomplete="off"></label><label>Store / building address<select data-address><option value="">Choose a delivery address</option></select></label><button type="button" data-address-refresh>Refresh map addresses</button><button type="button" data-address-more hidden>Load more addresses</button><p data-address-status class="supply-muted" role="status"></p><div data-address-detail></div></section><div data-deed-delivery-route></div><button type="button" data-delivery-refresh>Recalculate delivery approach</button><p data-order-plan class="supply-route-detail"></p><div class="supply-buttons"><button type="button" data-order-review>Choose items &amp; review price</button><button type="button" data-open-designer>Develop a custom item</button></div><p class="supply-muted" data-order-reason>Choose an owned deed and get an item price below.</p><div data-orders></div></section>
 <section data-designer></section>
 <section class="supply-inspector" data-inspector></section>
 <section class="supply-challenges" aria-label="Distribution challenges"><h3>Distribution challenges</h3><p class="supply-muted">Build and ship rockets, tools, materials and supplies into the shared warehouses. Requirements and completion come from the server. Normal freight rewards apply.</p><div data-challenges></div><p data-selected-challenge class="supply-muted" role="status"></p></section>
 <div class="supply-layout"><section><h3>1. Choose & build</h3><label>Find any item<input type="search" data-search placeholder="Search items, GLB models or production types" autocomplete="off"></label><p class="supply-muted" data-matches></p><label>Item<select data-item></select></label><div data-item-info></div><div class="supply-counts" data-counts></div><div class="supply-recipe" data-recipe></div><label>Quantity<input data-quantity type="number" min="1" max="10000" step="1" value="10" inputmode="numeric"></label><p data-discount class="supply-muted"></p><div class="supply-buttons"><button type="button" data-quote>Get price</button><button type="button" data-produce disabled>Start production</button><button type="button" data-order disabled>Build &amp; ship to deed</button><button type="button" data-address-order disabled hidden>Build &amp; ship to address</button></div><p data-price>Choose an item and request a price.</p><h4>Production orders</h4><p class="supply-muted">Each stage runs on the server. Completed builds enter factory stock; shipping is the next step.</p><div data-production></div></section>
 <section><h3>2. Reserve a shipment</h3><label>Source inventory<select data-source></select></label><p data-source-count class="supply-muted"></p><label>Destination inventory<select data-destination></select></label><label>Shipping map<select data-shipping-world></select></label><label>Shipping route<select data-route></select></label><label>After sea unloading<select data-onward-mode><option value="road">Shore road → truck → receiving drop-off</option><option value="air">Shore road → aircraft → truck → receiving drop-off</option></select></label><p data-onward-plan class="supply-route-detail"></p><p data-shipping-map class="supply-muted"></p><p data-capacity class="supply-route-detail"></p><div class="supply-buttons"><button type="button" data-max>Use maximum shipment</button><button type="button" data-dispatch>Dispatch selected item & quantity</button></div><p data-dispatch-reason class="supply-muted"></p><p class="supply-muted">The source stock is reserved when you dispatch. Addressed cargo stays reserved through sea unloading, truck transport and the final delivery drop-off. Other map transfers receive stock after the verified sea unload.</p><h4 id="supply-shipment-heading" tabindex="-1">3. Sail & deliver</h4><label>Shipment tasks<select data-task-filter><option value="active">Active tasks</option><option value="queued">Waiting for a captain</option><option value="reserved">Assigned voyages</option><option value="port-received">Received at port</option><option value="land-transit">Road deliveries</option><option value="delivered">Delivered</option><option value="all">All tasks</option></select></label><p data-task-count class="supply-muted"></p><button type="button" data-clear-order-filter hidden>Show all shipment orders</button><div data-shipments></div><div class="supply-pagination"><button type="button" data-task-previous>Previous tasks</button><span data-task-page></span><button type="button" data-task-next>Next tasks</button></div></section></div>
 <section class="supply-air-freight" aria-label="Air freight tasks"><h3>4. Port roads &amp; air freight</h3><p class="supply-muted">Sea unloading reserves the cargo at port. For an air order, the dock truck takes sealed freight to the departure apron. Board a cargo-capable aircraft, load and secure its assigned manifest, fly the marked route, then stop and unload at the receiving apron. Trucks complete the final address delivery.</p><label>Air manifests<select data-air-filter><option value="active">Active air tasks</option><option value="all">All air tasks</option></select></label><p data-air-count class="supply-muted"></p><div data-air-tasks></div><div class="supply-pagination"><button type="button" data-air-previous>Previous air tasks</button><span data-air-page></span><button type="button" data-air-next>Next air tasks</button></div></section>
 <section class="supply-stock"><div class="supply-stock-heading"><h3>Item-by-item stock</h3><label>Map inventory<select data-stock-map></select></label><button type="button" data-refresh>Refresh counts</button></div><div class="supply-table-scroll"><table><thead><tr><th scope="col">Item</th><th scope="col">World</th><th scope="col">Factory</th><th scope="col">Map</th></tr></thead><tbody data-stock></tbody></table></div><div class="supply-pagination"><button type="button" data-previous>Previous</button><span data-page></span><button type="button" data-next>Next</button></div></section>`;
 const $=selector=>panel.querySelector(selector);
 let environment=null,self=null,aircraft=null,actorId=null,data=null,busy=false,disposed=false,revision=0,page=0,taskPage=0,quote=null,quoteKey='',pollTimer=null,tickTimer=null,refreshTask=null,stockMap='',selection='',destination='',sourceMapId='factory',selectedShippingMap='',routeId='gulf-gateway',onwardMode='road',airPage=0,serverAt=0,receivedAt=0,notice='',requestedSection=null,inspectedProductionId=null,inspectedStageId=null,traceData=null,traceRequest=0,recipeDetails=null,recipeRequest=0;
 const pending=new Map(),extraToggles=[];
 let deedId='',requestedDeedId=new URL(location.href).searchParams.get('supplyDeed')||'',deepLinkOpened=false,workspace=false,taskOrderId='';
 let addressId='',addressMap='',requestedAddressId=new URL(location.href).searchParams.get('supplyAddress')||'',requestedItemId=new URL(location.href).searchParams.get('supplyItem')||'',addressLoading=false,addressError='',addressRequest=0,addressResolving=false;
 const addressRecords=new Map(),loadedAddressMaps=new Set(),addressPages=new Map();
 let mergedAddressData=null;
 const designer=mountWorldFactoryDesigner($('[data-designer]'),{inventory,announce:message=>status(message),onSaved:async saved=>{
  if(busy)throw new Error('Wait for the current factory operation, then register your saved design again.');
  const context=revision;busy=true;renderControls();
  try{
   const registered=await post('register-design',{customItemId:saved.id});
   if(disposed||context!==revision)return;
   const registeredId=registered.itemId||registered.item?.supplyId||registered.supplyId;
   await refresh({force:true});
   if(disposed||context!==revision)return;
   if(!catalog().some(row=>row.id===registeredId))throw new Error('The saved blueprint is not available in this workspace yet. Retry registration.');
   selection=registeredId;
   selectedChallengeId='';recipeDetails=null;inspectedProductionId=null;traceData=null;
   $('[data-search]').value='';invalidateQuote();render();void loadRecipe();
   status('Private blueprint ready. Choose a quantity and get a price to build it. Bulk output reaches your plot only through shipping.');
   $('[data-quantity]').scrollIntoView({block:'center'});$('[data-quantity]').focus();
  }finally{if(!disposed&&context===revision){busy=false;renderControls();}}
 }});
 let selectedChallengeId='';
 const currentId=()=>environment?.id||'';
 const catalog=()=>supplySelectableCatalog(data);
 const item=()=>catalog().find(row=>row.id===selection);
 const route=()=>data?.routes?.find(row=>row.id===routeId);
 const receivingAddress=()=>addressRecords.get(addressId)||null;
 const quantity=()=>Number($('[data-quantity]').value);
 const challengeSelection=()=>({itemId:selection,quantity:quantity(),sourceMapId,destinationMapId:destination,shippingMapId:selectedShippingMap,contractId:routeId});
 const selectedChallenge=()=>{const challenge=data?.challenges?.find(row=>row.id===selectedChallengeId);return supplyChallengeMatchesSelection(challenge,challengeSelection())?challenge:null;};
 const selectionKey=()=>JSON.stringify([selection,quantity(),onwardMode,...(addressId?['address',addressId,receivingAddress()?.revision,selectedShippingMap,routeId]:deedId?[deedId,selectedShippingMap,routeId]:[])]);
 const now=()=>serverAt+Math.max(0,performance.now()-receivedAt);
 const status=message=>{notice=message;$('[data-status]').textContent=message;};
 const screen=fullscreenPanel(panel,{onOpen:()=>{document.exitPointerLock?.();requestGameInputRelease('world-supply-open');onOpen();clearInterval(pollTimer);clearInterval(tickTimer);pollTimer=setInterval(()=>{if(!busy)void refresh();},5000);tickTimer=setInterval(renderBuildClocks,250);void refresh();},onClose:()=>{clearInterval(pollTimer);clearInterval(tickTimer);pollTimer=tickTimer=null;onClose();}});
 screen.dialog.classList.add('world-supply-dialog');
 function selectedOptions(select,records,selected){const signature=JSON.stringify(records.map(row=>[row.id,row.name]));if(select.dataset.signature!==signature){select.dataset.signature=signature;select.replaceChildren();for(const row of records){const option=document.createElement('option');option.value=row.id;option.textContent=row.name||row.id;select.append(option);}}if(select.value!==selected)select.value=selected;}
 function invalidateQuote(){quote=null;quoteKey='';$('[data-price]').textContent='Choose an item and request a price.';renderControls();}
 function mergeAddresses(rows,{replaceMap}={}){
  if(replaceMap)for(const [id,address]of addressRecords)if(address.mapId===replaceMap)addressRecords.delete(id);
  for(const address of supplyAddressRecords(rows))if(address?.id&&address.mapId)addressRecords.set(address.id,address);
 }
 function renderAddresses(){
  const maps=(data?.maps||[]).filter(map=>map.id!=='world');
  if(!maps.some(map=>map.id===addressMap))addressMap=maps.some(map=>map.id===currentId())?currentId():maps[0]?.id||'';
  selectedOptions($('[data-address-map]'),maps,addressMap);
  const available=[...addressRecords.values()].filter(address=>address.mapId===addressMap&&supplyAddressMatches(address,$('[data-address-search]').value)).sort((a,b)=>supplyAddressLabel(a).localeCompare(supplyAddressLabel(b)));
  if(addressId&&!available.some(address=>address.id===addressId)){addressId='';invalidateQuote();}
  const shown=available.slice(0,500),selected=receivingAddress();if(selected&&available.includes(selected)&&!shown.includes(selected))shown.unshift(selected);
  selectedOptions($('[data-address]'),[{id:'',name:'Choose a delivery address'},...shown.map(address=>({id:address.id,name:supplyAddressLabel(address)}))],addressId);
  const pageInfo=addressPages.get(addressMap),loaded=[...addressRecords.values()].filter(address=>address.mapId===addressMap).length;
  $('[data-address-status]').textContent=addressLoading?'Loading current map addresses…':addressError||(available.length>500?'Showing 500 of '+available.length+' matching addresses. Refine your search.':available.length+' matching public addresses')+(pageInfo?.hasMore?' · '+loaded+' of '+pageInfo.total+' loaded. Load more to search further.':'. Choose Refresh map addresses to load the latest layout.');
  $('[data-address-more]').hidden=!pageInfo?.hasMore;
  html($('[data-address-detail]'),supplyAddressMarkup(receivingAddress()));
 }
 async function loadAddresses(mapId,{resolveId='',force=false,more=false}={}){
  const pageInfo=addressPages.get(mapId),offset=more?Number(pageInfo?.nextOffset)||0:0;
  if(disposed||!resolveId&&(!mapId||more&&!pageInfo?.hasMore||loadedAddressMaps.has(mapId)&&!force&&!more))return [];
  const context=revision,request=++addressRequest;addressLoading=true;addressError='';renderControls();
  try{
   const result=await inventory.api('/api/world-supply/addresses?'+(resolveId?'addressId='+encodeURIComponent(resolveId):'mapId='+encodeURIComponent(mapId)+'&offset='+offset+'&limit=200'));
   if(disposed||context!==revision||request!==addressRequest)return [];
   const rows=supplyAddressRecords(result?.addresses??(Array.isArray(result)?result:[]));
   mergeAddresses(rows,{replaceMap:resolveId||more?null:mapId});if(!resolveId){loadedAddressMaps.add(mapId);addressPages.set(mapId,{total:Number(result?.total)||rows.length,hasMore:result?.hasMore===true,nextOffset:Number(result?.nextOffset)||offset+rows.length});}
   return rows;
  }catch(error){if(!disposed&&context===revision&&request===addressRequest)addressError=error.message;return [];}
  finally{if(!disposed&&context===revision&&request===addressRequest){addressLoading=false;renderAddresses();renderControls();}}
 }
 async function resolveRequestedAddress(){
  if(!requestedAddressId||addressResolving||!data)return;
  const id=requestedAddressId,context=revision;addressResolving=true;
  try{
   let address=addressRecords.get(id);
   if(!address){await loadAddresses('',{resolveId:id});if(disposed||context!==revision)return;address=addressRecords.get(id);}
   if(disposed||context!==revision||requestedAddressId!==id)return;requestedAddressId='';
   if(!address){status('This delivery address is no longer available. Choose a current store or building address.');return;}
   addressId=address.id;addressMap=address.mapId;deedId='';destination=address.mapId;taskOrderId='';$('[data-address-search]').value='';invalidateQuote();render();
  }finally{addressResolving=false;}
 }
 function renderControls(){
  const valid=!!item()&&Number.isSafeInteger(quantity())&&quantity()>0&&quantity()<=(data?.rules?.maxQuantity||10000),available=supplySourceStock(data,sourceMapId,selection),capacity=supplyRouteCapacity(item(),route(),data?.rules);
  for(const selector of ['[data-item]','[data-quantity]','[data-search]','[data-destination]','[data-source]','[data-shipping-world]','[data-route]','[data-onward-mode]','[data-deed]','[data-open-designer]','[data-address-map]','[data-address-search]'])$(selector).disabled=busy;
  $('[data-address]').disabled=busy||addressLoading;$('[data-address-refresh]').disabled=busy||addressLoading;$('[data-address-more]').disabled=busy||addressLoading;
  const producible=item()?.factoryProducible!==false,onward=supplyOnwardAvailability(route(),selectedShippingMap),onwardReason=onwardMode==='air'&&!onward.available?onward.reason:'';
  $('[data-onward-mode]').querySelector('[value="air"]').disabled=!onward.available;
  $('[data-onward-plan]').textContent=onwardMode==='air'?(onwardReason||'Sea receiving port → shore road → '+onward.air.origin.name+' → verified flight → '+onward.air.destination.name+' → receiving trucks → final drop-off.'):onward.connection?'Sea receiving dock → '+(onward.connection.bay.name||'shore freight bay')+' → receiving map truck route → final drop-off.':'Sea receiving port → receiving map truck route → final drop-off.';
  $('[data-quote]').disabled=busy||!valid||!producible;$('[data-produce]').disabled=busy||!valid||!producible||!quote||quoteKey!==selectionKey();
  const deed=data?.deeds?.find(row=>row.id===deedId),orderReason=!deed?'Choose an owned deed.':onwardReason?onwardReason:!valid?'Choose an item and whole quantity.':!producible?'Choose a blueprint available for production.':!route()||!selectedShippingMap?'Choose a shipping map and route.':!quote||quoteKey!==selectionKey()?'Get the current item price below.':'';
  $('[data-order]').disabled=busy||!!orderReason;$('[data-order]').hidden=!deedId;$('[data-order-reason]').textContent=orderReason||'Ready to pay '+count(quote.priceMzk)+' MZK and process this deed order.';
  const address=receivingAddress(),addressReason=!workspace?'Sign in through Members to send a supply shipment.':onwardReason?onwardReason:!address?'Choose a receiving store or building address.':address.canOrder===false?'This address is not accepting new orders.':!valid?'Choose an item and whole quantity.':!producible?'Choose a blueprint available for production.':!route()||!selectedShippingMap?'Choose a shipping map and route.':!quote||quoteKey!==selectionKey()?'Get the current item price below.':'';
  $('[data-address-order]').hidden=!addressId;$('[data-address-order]').disabled=busy||addressLoading||!!addressReason;
  if(addressId)$('[data-order-reason]').textContent=addressReason||'Ready to pay '+count(quote.priceMzk)+' MZK from your wallet and ship to '+address.name+'.';
  $('[data-deed-summary]').textContent=deed?'Receiving inventory: '+(deed.hostedSpace?.name||deed.name)+' · '+(deed.spaceId||'plot-'+deed.id)+'. The destination is verified against your current deed on the server.':workspace?'Your active owned deeds appear here. Existing warehouse production and map transfers remain available below.':'Sign in through Members to order for a deed and develop private custom items.';
  const approach=address?supplyAddressRoute(data,address.id):deed?deedDeliveryRoute(data,deed.id):null;
  html($('[data-deed-delivery-route]'),address||deed?deedDeliveryRouteMarkup(approach,{navigate:true,onwardMode}):'');
  $('[data-delivery-refresh]').hidden=!deed&&!address;
  const receivingName=address?.name||deed?.hostedSpace?.name||deed?.name;
  $('[data-order-plan]').textContent=receivingName&&valid&&capacity?'Order plan: '+count(quantity())+' × '+item().name+' → four production stages → '+count(Math.ceil(quantity()/capacity))+' sea '+(Math.ceil(quantity()/capacity)===1?'shipment':'shipments')+(onwardMode==='air'?' → shore truck → verified air freight':' → shore road')+' → truck loads → delivery drop-off → '+receivingName+'.':'Choose an item, quantity and shipping route below to plan the order.';
  if(!producible)$('[data-price]').textContent=inactiveBlueprintMessage;
  else if(!quote&&$('[data-price]').textContent===inactiveBlueprintMessage)$('[data-price]').textContent='Choose an item and request a price.';
  const exactAirDestination=addressId&&receivingAddress()?.mapId===destination||(data?.deeds||[]).some(deed=>(deed.destinationMapId||deed.spaceId||'plot-'+deed.id)===destination)||destination?.startsWith('plot-'),airDispatchReason=onwardMode==='air'&&!exactAirDestination?'Choose a deed or public receiving address before dispatching air freight.':'';
  const reason=onwardReason?onwardReason:airDispatchReason?airDispatchReason:!valid?'Choose a whole item quantity.':!destination?'Choose a destination.':sourceMapId===destination?'Choose a different destination inventory.':!route()||!selectedShippingMap?'Choose an available shipping map and route.':quantity()>capacity?'This route holds '+count(capacity)+' of this item. Use a smaller batch or a larger manifest.':available<quantity()?'The selected source needs '+count(quantity()-available)+' more units before dispatch.':'';
  $('[data-dispatch]').disabled=busy||!!reason;$('[data-dispatch-reason]').textContent=reason||'Ready to reserve '+count(quantity())+' units for a verified sea delivery.';
  $('[data-max]').disabled=busy||!item()||!route()||Math.min(available,capacity)<1;
  $('[data-refresh]').disabled=busy;$('[data-delivery-refresh]').disabled=busy;for(const button of panel.querySelectorAll('[data-sea-action],[data-cancel-shipment],[data-cancel-production],[data-ready-dispatch],[data-pause-production],[data-resume-production],[data-cancel-order],[data-air-action]'))button.disabled=busy||button.dataset.airDisabled==='true';
  for(const button of panel.querySelectorAll('[data-prepare-challenge]'))button.disabled=busy;
  const goal=selectedChallenge();$('[data-selected-challenge]').textContent=goal?'Selected: '+goal.name+' · deliver '+count(goal.quantity)+' at '+goal.minimumQuality+'% quality or better.':'';
  $('[data-source-count]').textContent='Available at source: '+count(available)+' units of the selected item.';
  const local=data?.maps?.find(map=>map.id===currentId());$('[data-counts]').textContent=item()?`World: ${count(data.worldStock?.[selection])} · Factory: ${count(data.factoryStock?.[selection])} · This map: ${count(local?.stock?.[selection])}`:'';
  const selected=route(),vessel=SHIPPING_VESSELS.find(ship=>ship.modelId===selected?.requiredVessel);
  $('[data-capacity]').textContent=selected?portName(selected.from)+' → '+portName(selected.to)+' · '+(selected.units||4)+' containers · '+count(capacity)+' items maximum'+(vessel?' · '+vessel.name+' or larger':''):'';
 }
 function renderInspector(){
  const job=data?.production?.find(job=>job.id===inspectedProductionId);
  if(job&&Array.isArray(data.lots)){
   const lots=data.lots.filter(lot=>lot.productionId===job.id),ids=new Set(lots.map(lot=>lot.id)),allocations=(data.allocations||[]).filter(allocation=>allocation.lots.some(line=>ids.has(line.lotId))),shipments=(data.shipments||[]).filter(shipment=>allocations.some(allocation=>allocation.shipmentId===shipment.id));
   traceData={lots,allocations,shipments,deliveryTasks:deedDeliveryRecords(data.deliveryTasks).filter(task=>shipments.some(shipment=>shipment.id===task.shipmentId)),portReceipts:deedDeliveryRecords(data.portReceipts).filter(receipt=>shipments.some(shipment=>shipment.id===receipt.shipmentId)),dropoffReceipts:deedDeliveryRecords(data.dropoffReceipts).filter(receipt=>shipments.some(shipment=>shipment.id===receipt.shipmentId)),stockReceipts:(data.stockReceipts||[]).filter(receipt=>shipments.some(shipment=>shipment.id===receipt.shipmentId))};
  }
  html($('[data-inspector]'),factoryInspectorMarkup({item:item()?{...item(),recipe:quoteKey===selectionKey()&&quote?.recipe||recipeDetails?.recipe||item().recipe}:null,job,trace:job?traceData:null,stageId:inspectedStageId,now:job?.effectiveAt||now()}));renderControls();
 }
 async function inspectProduction(id){
  inspectedProductionId=id;traceData=null;const request=++traceRequest;renderInspector();$('[data-inspector]').scrollIntoView({block:'start'});$('[data-inspector]').querySelector('[data-pause-production],[data-resume-production]')?.focus({preventScroll:true});
  try{const trace=await inventory.api('/api/world-supply/'+(workspace?'workspace/':'')+'trace?productionId='+encodeURIComponent(id));if(disposed||request!==traceRequest)return;traceData=trace;renderInspector();}catch(error){if(request===traceRequest)status(error.message);}
 }
 async function loadRecipe(){
  if(!selection||item()?.factoryProducible===false){recipeRequest++;recipeDetails=null;return;}const id=selection,request=++recipeRequest;
  try{const plan=await inventory.api('/api/world-supply/'+(workspace?'workspace/':'')+'recipe?itemId='+encodeURIComponent(id));if(disposed||request!==recipeRequest||selection!==id)return;recipeDetails=plan;renderRecipe();renderInspector();}catch{}
 }
 function renderRecipe(){
  const selected=item(),savedRecipe=selected?.factoryProducible===false?data?.production?.find(job=>job.itemId===selected.id&&job.recipe)?.recipe:null,recipe=savedRecipe||quoteKey===selectionKey()&&quote?.recipe||recipeDetails?.recipe||selected?.recipe;
  const unitPrice=quoteKey===selectionKey()&&quote?.unitPriceMzk||selected?.factoryUnitPriceMzk||selected?.priceMzk;
  const kind=(selected?.privateFactoryBlueprint?'Private · ':'')+(selected?.renderKind==='image'?'Custom artwork blueprint':selected?.factoryVariant?(selected.modelUrl?'Custom GLB blueprint':'Custom native blueprint'):selected?.modelUrl?'GLB / 3D model':selected?.kind==='care'?'Care supply':'Native world item');
  const source=productionSource(selected);
  html($('[data-item-info]'),selected?'<strong>'+esc(selected.name)+'</strong><p class="supply-muted">'+esc([kind,source,selected.category,selected.description].filter(Boolean).join(' · '))+'</p><p data-unit-price>'+(selected.factoryProducible===false?'New production unavailable.':Number.isSafeInteger(unitPrice)&&unitPrice>0?'Factory unit price: '+count(unitPrice)+' MZK before bulk discounts.':'Request a server quote for this item’s factory unit price.')+'</p>'+(selected.priceMzk===0?'<p class="supply-muted">Basic access is free. Factory production has a minimum base cost of 1 MZK per unit before bulk discounts.</p>':'')+(selected.nativeMaps?.length?'<p class="supply-muted">Used in: '+selected.nativeMaps.map(map=>esc(map.name||map.id)+(map.count?' × '+count(map.count):'')).join(' · ')+'</p>':''):'');
  html($('[data-recipe]'),recipe?'<strong>'+esc(recipe.name)+'</strong><p>'+esc(recipe.description||'')+'</p><ol>'+(recipe.stages||[]).map(stage=>'<li><strong>'+esc(stage.name)+'</strong>'+ (stage.description?'<span>'+esc(stage.description)+'</span>':'')+'</li>').join('')+'</ol><small>'+count(recipe.unitsPerContainer)+' units per shipping container. Finished output requires shipping.</small>':'<p>Get a server quote to review this item’s production time and bulk price. Finished output requires shipping.</p>');
 }
 function renderChallenges(){
  html($('[data-challenges]'),(data?.challenges||[]).map(goal=>'<article class="supply-task"><strong>'+esc(goal.name)+'</strong><span>'+esc(goal.description)+'</span><span>'+esc(goal.itemName)+' × '+count(goal.quantity)+' → '+esc(goal.destinationName)+'</span><small>Factory: '+count(goal.availableStock)+' · Destination: '+count(goal.destinationStock)+' · '+count(goal.minimumQuality)+'% quality · Completed deliveries: '+count(goal.completionCount)+'</small><button type="button" data-prepare-challenge="'+esc(goal.id)+'">Prepare challenge</button></article>').join('')||'<p class="supply-muted">No distribution challenges are available in this world directory.</p>');
 }
 function renderCatalog(){
  const matches=filterSupplyItems(catalog(),$('[data-search]').value),transferOnly=matches.filter(row=>row.factoryProducible===false).length;$('[data-matches]').textContent=`${matches.length.toLocaleString()} items · Native items, tools, supplies and 3D models${transferOnly?' · '+transferOnly+' stock transfer only':''}`;
  const previous=selection;if(!matches.some(row=>row.id===selection))selection=matches[0]?.id||'';
  selectedOptions($('[data-item]'),matches.map(row=>row.factoryProducible===false?{...row,name:row.name+' · Stock transfer only'}:row),selection);if(item()?.factoryProducible===false){quote=null;quoteKey='';recipeDetails=null;recipeRequest++;}if(previous!==selection){inspectedProductionId=null;traceData=null;recipeDetails=null;invalidateQuote();void loadRecipe();}renderRecipe();renderControls();renderStocks();
 }
 function renderStocks(){
  const rows=filterSupplyItems(catalog(),$('[data-search]').value),pages=Math.max(1,Math.ceil(rows.length/30));page=Math.max(0,Math.min(page,pages-1));const map=data?.maps?.find(row=>row.id===stockMap);
  html($('[data-stock]'),rows.slice(page*30,(page+1)*30).map(row=>'<tr><th scope="row">'+esc(row.name)+'<small>'+esc(row.id)+'</small></th><td>'+count(data.worldStock?.[row.id])+'</td><td>'+count(data.factoryStock?.[row.id])+'</td><td>'+count(map?.stock?.[row.id])+'</td></tr>').join('')||'<tr><td colspan="4">No items match your search.</td></tr>');
  $('[data-page]').textContent=`Page ${page+1} of ${pages}`;$('[data-previous]').disabled=page===0;$('[data-next]').disabled=page>=pages-1;
 }
 function renderBuildClocks(){
  if(!screen.dialog.open||!data)return;
  for(const node of panel.querySelectorAll('[data-build-id]')){const job=data.production?.find(row=>row.id===node.dataset.buildId);if(!job)continue;const view=supplyBuildPresentation(job,now());node.querySelector('[data-build-status]').textContent=view.label;node.querySelector('progress').value=view.progress;}
  if(self?.airFreight&&Math.floor(now()/1000)!==lastAirSecond){lastAirSecond=Math.floor(now()/1000);renderAirTasks();}
 }
 let lastAirSecond=-1;
 function renderAirTasks(){
  if(!data)return;
  const all=airFreightRows(data.airTasks).filter(task=>(!taskOrderId||task.orderId===taskOrderId)&&($('[data-air-filter]').value==='all'||!airFreightFinished(task))).slice().reverse(),pages=Math.max(1,Math.ceil(all.length/8));airPage=Math.max(0,Math.min(airPage,pages-1));
  $('[data-air-count]').textContent=all.length+' matching air manifests. Each flight reserves its exact counted goods; stock remains reserved through the final doorstep receipt.';
  html($('[data-air-tasks]'),all.slice(airPage*8,(airPage+1)*8).map(task=>airFreightTaskMarkup(task,{mapId:currentId(),ownerId:data.ownerId,selfId:actorId,self,aircraft,now:now()})).join('')||'<p class="supply-muted">No matching air manifests. Choose aircraft onward delivery before ordering or dispatching to a deed or public address, then complete the sea voyage first.</p>');
  $('[data-air-page]').textContent='Page '+(airPage+1)+' of '+pages;$('[data-air-previous]').disabled=airPage===0;$('[data-air-next]').disabled=airPage>=pages-1;
  for(const button of panel.querySelectorAll('[data-air-action]'))button.disabled=busy||button.dataset.airDisabled==='true';
 }
 function renderOrders(){
  const orders=(data?.orders||[]).filter(order=>order.ownerId===data.ownerId&&(!addressId||order.addressId===addressId)&&(!deedId||order.deedId===deedId)).slice().reverse();
  html($('[data-orders]'),orders.map(order=>{
   const view=supplyOrderPresentation(order),shipments=(data.shipments||[]).filter(shipment=>shipment.orderId===order.id),active=shipments.some(shipment=>shipment.phase==='reserved'),cancellable=!['cancelled','delivered'].includes(order.phase)&&!active;
   const roadTasks=deedDeliveryRecords(data.deliveryTasks).filter(task=>task.orderId===order.id),portReceived=Number(order.receivedAtPortQuantity)||shipments.filter(shipment=>shipment.seaReceipt).reduce((sum,shipment)=>sum+shipment.quantity,0),deliveryRoute=order.addressId?supplyAddressRoute(data,order.addressId):deedDeliveryRoute(data,order.deedId);
   return '<article class="supply-task" data-order-id="'+esc(order.id)+'"><strong>'+esc(order.itemName||order.itemId)+' × '+count(view.total)+' → '+esc(order.address?.name||order.deedName||order.deedId)+'</strong>'+(order.address?supplyAddressMarkup(order.address,{compact:true}):'')+'<span data-order-phase>'+esc(view.label)+'</span><progress max="'+Math.max(1,view.total)+'" value="'+view.delivered+'" aria-label="Order delivered quantity"></progress><span>'+count(view.delivered)+' / '+count(view.total)+' units delivered · '+count(shipments.length)+' shipping tasks</span>'+(roadTasks.length||portReceived?'<span>'+count(portReceived)+' units received at port · '+count(roadTasks.length)+' truck loads · inventory waits for the final drop-off.</span>':'')+deedDeliveryTasksMarkup(roadTasks)+(deliveryRoute?'<details><summary>Calculated delivery path</summary>'+deedDeliveryRouteMarkup(deliveryRoute,{navigate:true,onwardMode:order.onwardMode})+'</details>':'')+(order.attentionReason||order.deliveryBlockedReason?'<span>'+esc(order.attentionReason||order.deliveryBlockedReason)+'</span>':'')+'<small>Order '+esc(order.id)+'</small><div class="supply-buttons"><button type="button" data-inspect-production="'+esc(order.productionId)+'">Inspect order production</button>'+(shipments.length?'<button type="button" data-order-tasks="'+esc(order.id)+'">View shipment tasks</button>':'')+(cancellable?'<button type="button" data-cancel-order="'+esc(order.id)+'">'+(['building','paused'].includes(order.phase)?'Cancel order & refund':portReceived?'Hold remaining cargo at port':'Cancel remaining order')+'</button>':'')+'</div></article>';
  }).join('')||'<p class="supply-muted">No receiving orders yet. Orders stay connected to their address, production batch and shipping tasks.</p>');
 }
 function renderTasks(){
  if(!data)return;const names=new Map(catalog().map(row=>[row.id,row.name])),maps=new Map((data.maps||[]).map(row=>[row.id,row.name]));
  const production=[...(data.production||[]).filter(row=>['building','paused'].includes(row.phase)).reverse(),...(data.production||[]).filter(row=>!['building','paused'].includes(row.phase)).slice(-10).reverse()];
  renderOrders();
  html($('[data-production]'),production.map(row=>'<article class="supply-task" data-build-id="'+esc(row.id)+'"><strong>'+esc(names.get(row.itemId)||row.itemId)+' × '+count(row.quantity)+'</strong><span data-build-status></span><progress max="1" value="0" aria-label="'+esc((names.get(row.itemId)||row.itemId)+' production progress')+'"></progress>'+(row.stages?.length?'<ol class="supply-stages">'+row.stages.map(stage=>'<li data-phase="'+esc(stage.phase)+'"><strong>'+esc(stage.name)+'</strong><span>'+esc(stage.phase==='complete'?'Complete':stage.phase==='processing'?'In progress':'Waiting')+'</span></li>').join('')+'</ol>':'')+'<button type="button" data-inspect-production="'+esc(row.id)+'">Inspect operations & trace</button>'+(row.phase==='building'?'<button type="button" data-pause-production="'+esc(row.id)+'">Pause production</button>':row.phase==='paused'?'<button type="button" data-resume-production="'+esc(row.id)+'">Resume production</button>':'')+(['building','paused'].includes(row.phase)?'<button type="button" data-cancel-production="'+esc(row.id)+'">Cancel production & refund</button>':row.phase==='ready'&&!row.orderId?'<button type="button" data-ready-dispatch="'+esc(row.id)+'">Prepare shipment</button>':'')+'</article>').join('')||'<p class="supply-muted">No production orders yet.</p>');renderBuildClocks();
  const filter=$('[data-task-filter]').value,all=(data.shipments||[]).filter(row=>(!taskOrderId||row.orderId===taskOrderId)&&(filter==='all'||filter==='active'&&!terminal.has(row.phase)||row.phase===filter)).slice().reverse(),pages=Math.max(1,Math.ceil(all.length/10));taskPage=Math.max(0,Math.min(taskPage,pages-1));
  $('[data-task-count]').textContent=all.length+' matching shipment tasks.'+(taskOrderId?' Showing the selected receiving order.':'')+' Active cargo remains reserved until delivery or cancellation.';
  $('[data-clear-order-filter]').hidden=!taskOrderId;
  html($('[data-shipments]'),all.slice(taskPage*10,(taskPage+1)*10).map(row=>{
   const roadTasks=deedDeliveryRecords(data.deliveryTasks).filter(task=>task.shipmentId===row.id),selectedRoute=data.routes?.find(route=>route.id===row.contractId),access=supplyShipmentAccess(row,currentId(),self,selectedRoute),source=row.sourceMapId&&row.sourceMapId!=='factory'?(maps.get(row.sourceMapId)||row.sourceMapId):'Factory output';
   const labels={travel:'Travel to shipping map',board:'Board cargo ship',chart:'Open origin port chart',origin:'Navigate to origin port',accept:'Accept shipping task',continue:'Continue sea delivery'};
   const action=access.action!=='none'?'<button type="button" data-sea-action="'+esc(access.action)+'" data-shipment="'+esc(row.id)+'">'+labels[access.action]+'</button>':'';
   return '<article class="supply-task"><strong>'+esc(names.get(row.itemId)||row.itemName||row.itemId)+' × '+count(row.quantity)+'</strong><span>From '+esc(source)+' → To '+esc(maps.get(row.destinationMapId)||row.destinationMapId)+'</span>'+(row.address?supplyAddressMarkup(row.address,{compact:true}):'')+'<span>'+esc(access.message)+'</span>'+deedDeliveryTasksMarkup(roadTasks)+(['port-received','land-transit','loading-trucks','doorstep-delivery','port-held'].includes(row.phase)?'<button type="button" data-delivery-navigate="'+esc(row.destinationMapId)+'">Visit delivery drop-off</button>':'')+(row.portTransferTask?'<span data-port-transfer>'+esc(supplyPortTransferText(row,selectedRoute))+'</span>':'')+(row.challenge?'<span>'+esc(row.challenge.name)+' · '+(row.challengeResult?esc(row.challengeResult.message):'Requires '+count(row.challenge.minimumQuality)+'% delivered quality')+'</span>':'')+'<small>'+esc(data.shippingMaps?.find(map=>map.id===row.shippingMapId)?.name||row.shippingMapId)+' · '+esc(portName(originPort(row,selectedRoute)))+' → '+esc(portName(destinationPort(row,selectedRoute)))+(row.packing?' · '+count(row.packing.containersRequired)+' sealed / '+count(row.packing.containerSlots)+' manifest containers':'')+'</small><div class="supply-buttons">'+action+(row.phase==='queued'&&!row.jobId?'<button type="button" data-cancel-shipment="'+esc(row.id)+'">'+(row.orderId?'Cancel remaining receiving order':'Return cargo to source')+'</button>':'')+'</div></article>';
  }).join('')||'<p class="supply-muted">No matching tasks. Dispatch completed stock to create a sea delivery.</p>');
  $('[data-task-page]').textContent=`Page ${taskPage+1} of ${pages}`;$('[data-task-previous]').disabled=taskPage===0;$('[data-task-next]').disabled=taskPage>=pages-1;renderAirTasks();renderControls();
 }
 function render(){
  if(!data)return;const maps=data.maps||[];
  if(mergedAddressData!==data){
   if(Array.isArray(data.addresses)){
    const page=data.addressPage,previous=addressPages.get(currentId()),moreLoaded=page?.hasMore&&Number(previous?.nextOffset)>Number(page?.nextOffset),selected=receivingAddress();
    mergeAddresses(data.addresses,{replaceMap:moreLoaded?null:currentId()});
    if(page?.hasMore&&selected?.mapId===currentId()&&!addressRecords.has(selected.id))addressRecords.set(selected.id,selected);
    loadedAddressMaps.add(currentId());
    if(page)addressPages.set(currentId(),{...page,...(moreLoaded?{nextOffset:previous.nextOffset,hasMore:previous.nextOffset<page.total}:{})});
    if(selected&&receivingAddress()?.revision!==selected.revision){invalidateQuote();status(receivingAddress()?'This delivery address changed. Review the current recipient and drop-off, then get a new price.':'This delivery address is no longer available. Choose a current address and review its recipient.');}
   }
   mergedAddressData=data;
  }
  if(requestedItemId){
   if(catalog().some(row=>row.id===requestedItemId)){selection=requestedItemId;$('[data-search]').value='';recipeDetails=null;void loadRecipe();}
   else status('The linked product is unavailable for factory production. Choose a current item before requesting a quote.');
   requestedItemId='';
  }
  const deeds=data.deeds||[];
  if(requestedDeedId){
   if(deeds.some(deed=>deed.id===requestedDeedId)){deedId=requestedDeedId;const deed=deeds.find(row=>row.id===deedId);destination=deed.destinationMapId||deed.spaceId||'plot-'+deed.id;}
   else status('This deed is unavailable to your current account. Choose an active deed you own.');
   requestedDeedId='';
  }
  if(deedId&&!deeds.some(deed=>deed.id===deedId)){deedId='';invalidateQuote();}
  selectedOptions($('[data-deed]'),[{id:'',name:'Choose an owned deed'},...deeds.map(deed=>({id:deed.id,name:deed.hostedSpace?.name||deed.name||deed.id}))],deedId);
  renderAddresses();
  if(!maps.some(row=>row.id===destination))destination=maps.some(row=>row.id===currentId())?currentId():maps[0]?.id||'';
  if(!maps.some(row=>row.id===stockMap))stockMap=maps.some(row=>row.id===currentId())?currentId():maps[0]?.id||'';
  const sources=[{id:'factory',name:'Factory output'},...maps];if(!sources.some(row=>row.id===sourceMapId))sourceMapId='factory';selectedOptions($('[data-source]'),sources,sourceMapId);selectedOptions($('[data-destination]'),maps,destination);selectedOptions($('[data-stock-map]'),maps,stockMap);
  const shippingMaps=Array.isArray(data.shippingMaps)?data.shippingMaps:[{id:SHIPPING_ID,name:'Strait of Hormuz Shipping Academy'},...(isShippingEnvironment(environment)&&currentId()!==SHIPPING_ID?[{id:currentId(),name:environment.name||currentId()}]:[])];
  if(!shippingMaps.some(row=>row.id===selectedShippingMap))selectedShippingMap=shippingMaps.some(row=>row.id===currentId())?currentId():shippingMaps.find(row=>row.id===SHIPPING_ID)?.id||shippingMaps[0]?.id||'';
  selectedOptions($('[data-shipping-world]'),shippingMaps,selectedShippingMap);const routes=data.routes||[];if(!routes.some(row=>row.id===routeId))routeId=routes[0]?.id||'';selectedOptions($('[data-route]'),routes,routeId);
  const rules=data.rules||{};$('[data-quantity]').max=rules.maxQuantity||10000;$('[data-discount]').textContent=`${rules.bulkDiscountPercent??20}% bulk discount from ${rules.bulkMinimum??10} units. Completed output enters shared factory stock.`;
  $('[data-shipping-map]').textContent='Choose the route for the actual sea leg. Tasks below guide you to its origin dock.';renderChallenges();renderCatalog();renderTasks();renderInspector();
  if(requestedSection==='orders'){$('.supply-deed-orders').scrollIntoView({block:'start'});$(requestedAddressId||addressId?'[data-address]':'[data-deed]').focus({preventScroll:true});requestedSection=null;}
  if(requestedSection==='shipments'){$('[data-task-filter]').value='active';taskPage=0;renderTasks();$('[data-task-filter]').scrollIntoView({block:'center'});$('[data-task-filter]').focus();requestedSection=null;}
  if(requestedAddressId)void resolveRequestedAddress();
 }
 function refresh({manual=false,force=false}={}){
  if(disposed)return Promise.resolve();
  if(refreshTask)return force?refreshTask.then(()=>refresh({manual})):refreshTask;
  const context=revision;
  refreshTask=(async()=>{
   try{
    let next,authenticated=true;
    try{next=await inventory.api('/api/world-supply/workspace?mapId='+encodeURIComponent(currentId()));}
    catch(error){if(error.status!==401&&error.status!==403)throw error;authenticated=false;next=await inventory.api('/api/world-supply?mapId='+encodeURIComponent(currentId()));}
    if(disposed||context!==revision)return;workspace=authenticated;data=next;onState(next);serverAt=Number(next.serverTime)||Date.now();receivedAt=performance.now();render();if(!notice||manual)status('Counts synchronized. Order for a deed, or build and dispatch warehouse stock below.');
   }
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
  try{
   if(addressId&&['quote','dispatch'].includes(operation)){
    const reviewed=receivingAddress(),selectedId=addressId,response=await inventory.api('/api/world-supply/addresses?addressId='+encodeURIComponent(selectedId));
    if(disposed||context!==revision||addressId!==selectedId)return;
    const latest=supplyAddressRecords(response?.addresses).find(address=>address.id===selectedId);
    if(!latest){addressRecords.delete(selectedId);addressId='';invalidateQuote();renderAddresses();throw new Error('This delivery address is no longer available. Choose a current address and review its recipient.');}
    addressRecords.set(latest.id,latest);renderAddresses();renderControls();
    if(reviewed?.revision!==latest.revision){invalidateQuote();throw new Error('This delivery address changed. Review the current recipient and drop-off, then '+(operation==='quote'?'get a new price.':'dispatch again.'));}
    if(operation==='dispatch')fields={...fields,expectedAddressRevision:reviewed.revision};
   }
   const result=await post(operation,fields);if(disposed||context!==revision)return;
   if(operation==='quote'){quote=result;quoteKey=selectionKey();$('[data-price]').textContent=`${count(result.priceMzk)} MZK · ${Number(result.discountPercent)||0}% discount · ${Math.ceil((Number(result.buildMs)||0)/1000)}s build`;renderRecipe();renderInspector();status(addressId?'Server price received. Build & ship to address starts the supply order for the selected recipient.':deedId?'Server price received. Build & ship to deed starts the connected production and shipping order.':'Server price received. Start production to run each production stage.');}
   else{signalInventoryChange();window.MZKWallet?.refreshShared?.().catch(()=>{});await refresh({force:true});if(context===revision)status(result.message||(operation==='order-address'?'Address order started. Sail the packed shipments, then automatic truck loads complete delivery at the selected building.':operation==='order'?'Deed order started. Sail the packed shipments, then automatic truck loads complete the delivery at your deed drop-off.':operation==='produce'?'Production started. Finished output must be shipped before stores can use it.':operation==='dispatch'?'Shipment reserved. Follow the sea delivery task below.':'World supply updated.'));if(operation==='produce'||operation==='order'||operation==='order-address'){void inspectProduction(operation==='order'||operation==='order-address'?result.productionId:result.id);}if(operation==='pause'||operation==='resume'){void inspectProduction(fields.productionId);}if(operation==='dispatch'){taskPage=0;$('[data-task-filter]').value='active';renderTasks();$('[data-task-filter]').scrollIntoView({block:'center'});}}
  }catch(error){if(!disposed&&context===revision)status(error.message);}
  finally{if(context===revision){busy=false;renderControls();}}
 }
 function open(options={}){requestedSection=options.section||null;inspectedStageId=options.stageId||inspectedStageId;if(options.deedId){requestedDeedId=options.deedId;addressId='';}if(options.addressId)requestedAddressId=options.addressId;if(options.itemId){selection=options.itemId;requestedItemId=options.itemId;$('[data-search]').value='';}screen.open();if(data)render();if(options.section==='designer')designer.open();}
 async function visitDelivery(mapId){
  if(busy||!data?.maps?.some(map=>map.id===mapId))return;
  const context=revision;screen.close();
  if(mapId===currentId()){announce('The receiving drop-off and calculated delivery route are marked on this map.');return;}
  if(onNavigate){try{await onNavigate(mapId);announce('Follow the marked delivery route to the receiving drop-off.');}catch(error){if(context===revision){open({section:'orders'});status(error.message);}}}
  else{const target=new URL('model-explorer.html',location.href);target.searchParams.set('environment',mapId);target.searchParams.set('autoplay','1');location.assign(target.href);}
 }
 toggle.onclick=()=>open();$('[data-search]').addEventListener('input',()=>{selectedChallengeId='';page=0;invalidateQuote();renderCatalog();});$('[data-item]').onchange=event=>{selectedChallengeId='';selection=event.target.value;recipeDetails=null;inspectedProductionId=null;traceData=null;void loadRecipe();invalidateQuote();renderRecipe();renderInspector();};$('[data-quantity]').oninput=()=>{selectedChallengeId='';invalidateQuote();};
 for(const [selector,update]of [['[data-destination]',value=>destination=value],['[data-source]',value=>sourceMapId=value],['[data-route]',value=>routeId=value],['[data-shipping-world]',value=>selectedShippingMap=value]])$(selector).onchange=event=>{selectedChallengeId='';update(event.target.value);if(selector==='[data-destination]'&&addressId&&receivingAddress()?.mapId!==destination){addressId='';requestedAddressId='';invalidateQuote();renderAddresses();}if((deedId||addressId)&&['[data-route]','[data-shipping-world]'].includes(selector))invalidateQuote();renderControls();};
 $('[data-onward-mode]').onchange=event=>{onwardMode=event.target.value==='air'?'air':'road';selectedChallengeId='';invalidateQuote();renderControls();};
 $('[data-air-filter]').onchange=()=>{airPage=0;renderAirTasks();};$('[data-air-previous]').onclick=()=>{airPage--;renderAirTasks();};$('[data-air-next]').onclick=()=>{airPage++;renderAirTasks();};
 $('[data-deed]').onchange=event=>{deedId=event.target.value;if(deedId){addressId='';requestedAddressId='';}const deed=data?.deeds?.find(row=>row.id===deedId);if(deed)destination=deed.destinationMapId||deed.spaceId||'plot-'+deed.id;taskOrderId='';invalidateQuote();render();};
 $('[data-open-designer]').onclick=()=>designer.open();
 $('[data-order-review]').onclick=()=>{$('[data-search]').scrollIntoView({block:'center'});$('[data-search]').focus();};
 $('[data-order]').onclick=()=>run('order',{deedId,itemId:selection,quantity:quantity(),shippingMapId:selectedShippingMap,contractId:routeId,onwardMode,expectedPriceMzk:quote?.priceMzk});
 $('[data-address-order]').onclick=()=>run('order-address',{addressId,expectedAddressRevision:receivingAddress()?.revision,itemId:selection,quantity:quantity(),shippingMapId:selectedShippingMap,contractId:routeId,onwardMode,expectedPriceMzk:quote?.priceMzk});
 $('[data-address-map]').onchange=event=>{addressMap=event.target.value;addressId='';requestedAddressId='';taskOrderId='';addressError='';invalidateQuote();renderAddresses();void loadAddresses(addressMap);};
 $('[data-address-search]').oninput=()=>{renderAddresses();renderControls();};
 $('[data-address]').onchange=event=>{requestedAddressId='';addressId=event.target.value;const address=receivingAddress();if(address){deedId='';requestedDeedId='';destination=address.mapId;}taskOrderId='';invalidateQuote();render();};
 $('[data-address-refresh]').onclick=()=>loadAddresses(addressMap,{force:true});
 $('[data-address-more]').onclick=()=>loadAddresses(addressMap,{more:true});
 $('[data-orders]').onclick=event=>{const cancel=event.target.closest('[data-cancel-order]');if(cancel){void run('cancel',{orderId:cancel.dataset.cancelOrder});return;}const inspect=event.target.closest('[data-inspect-production]');if(inspect){void inspectProduction(inspect.dataset.inspectProduction);return;}const tasks=event.target.closest('[data-order-tasks]');if(tasks){taskOrderId=tasks.dataset.orderTasks;taskPage=0;$('[data-task-filter]').value='all';renderTasks();$('[data-task-filter]').scrollIntoView({block:'center'});$('[data-task-filter]').focus();}};
 $('[data-clear-order-filter]').onclick=()=>{taskOrderId='';taskPage=0;renderTasks();};
 $('[data-stock-map]').onchange=event=>{stockMap=event.target.value;renderStocks();};$('[data-task-filter]').onchange=()=>{taskPage=0;renderTasks();};$('[data-task-previous]').onclick=()=>{taskPage--;renderTasks();};$('[data-task-next]').onclick=()=>{taskPage++;renderTasks();};
 $('[data-max]').onclick=()=>{selectedChallengeId='';$('[data-quantity]').value=Math.min(supplySourceStock(data,sourceMapId,selection),supplyRouteCapacity(item(),route(),data?.rules));invalidateQuote();};
 $('[data-quote]').onclick=()=>run('quote',{itemId:selection,quantity:quantity()});$('[data-produce]').onclick=()=>run('produce',{itemId:selection,quantity:quantity(),expectedPriceMzk:quote?.priceMzk});$('[data-dispatch]').onclick=()=>run('dispatch',{...challengeSelection(),onwardMode,...(addressId&&receivingAddress()?.mapId===destination?{addressId}:{}),...(selectedChallenge()?{challengeId:selectedChallengeId}:{})});
 $('[data-challenges]').onclick=event=>{const id=event.target.closest('[data-prepare-challenge]')?.dataset.prepareChallenge,goal=data?.challenges?.find(row=>row.id===id);if(!goal||busy)return;selectedChallengeId=goal.id;addressId='';requestedAddressId='';selection=goal.itemId;recipeDetails=null;inspectedProductionId=null;traceData=null;void loadRecipe();sourceMapId=goal.sourceMapId;destination=goal.destinationMapId;selectedShippingMap=goal.shippingMapId;routeId=goal.contractId;onwardMode='road';$('[data-onward-mode]').value=onwardMode;$('[data-search]').value='';$('[data-quantity]').value=goal.quantity;invalidateQuote();render();status('Prepare '+goal.name+'. Build missing units, then dispatch and complete the sea voyage.');$('[data-quote]').scrollIntoView({block:'center'});$('[data-quote]').focus();};
 $('[data-delivery-refresh]').onclick=()=>refresh({manual:true,force:true});$('[data-refresh]').onclick=()=>refresh({manual:true});$('[data-previous]').onclick=()=>{page--;renderStocks();};$('[data-next]').onclick=()=>{page++;renderStocks();};
 panel.addEventListener('click',event=>{const delivery=event.target.closest('[data-delivery-navigate]');if(delivery){void visitDelivery(delivery.dataset.deliveryNavigate);return;}const pause=event.target.closest('[data-pause-production]'),resume=event.target.closest('[data-resume-production]');if(pause||resume){void run(pause?'pause':'resume',{productionId:pause?.dataset.pauseProduction||resume.dataset.resumeProduction});return;}const stage=event.target.closest('[data-inspect-stage]');if(stage){inspectedStageId=stage.dataset.inspectStage;renderInspector();}});
 $('[data-production]').onclick=event=>{const inspect=event.target.closest('[data-inspect-production]');if(inspect){void inspectProduction(inspect.dataset.inspectProduction);return;}const cancel=event.target.closest('[data-cancel-production]');if(cancel){void run('cancel',{productionId:cancel.dataset.cancelProduction});return;}const ready=event.target.closest('[data-ready-dispatch]'),job=data?.production?.find(row=>row.id===ready?.dataset.readyDispatch);if(job){selectedChallengeId='';selection=job.itemId;inspectedProductionId=job.id;traceData=null;recipeDetails=null;void loadRecipe();sourceMapId='factory';$('[data-search]').value='';$('[data-quantity]').value=Math.min(job.quantity,supplyRouteCapacity(item(),route(),data.rules));invalidateQuote();render();$('[data-source]').scrollIntoView({block:'center'});$('[data-source]').focus();}};
 $('[data-shipments]').onclick=async event=>{
  const cancel=event.target.closest('[data-cancel-shipment]');if(cancel){void run('cancel',{shipmentId:cancel.dataset.cancelShipment});return;}
  const action=event.target.closest('[data-sea-action]');if(!action||busy)return;const row=data?.shipments?.find(value=>value.id===action.dataset.shipment);if(!row)return;
  const operation=action.dataset.seaAction,selectedRoute=data.routes?.find(route=>route.id===row.contractId),context=revision;
  if(operation==='travel'){screen.close();if(onNavigate){try{await onNavigate(row.shippingMapId);}catch(error){if(context===revision){open({section:'shipments'});status(error.message);}}}else{const target=new URL('model-explorer.html',location.href);target.searchParams.set('environment',row.shippingMapId);target.searchParams.set('mode','multiplayer');if(row.orderId)target.searchParams.set('supplyOrder',row.orderId);location.assign(target.href);}return;}
  if(operation==='chart'||operation==='continue'){screen.close();onShipping({portId:originPort(row,selectedRoute)});return;}
  busy=true;renderControls();
  try{if(typeof command!=='function')throw new Error('Join the live shipping map to operate a cargo vessel.');const result=await command(operation==='origin'?'vehicle-navigate':'shipping',operation==='origin'?{destinationId:originPort(row,selectedRoute)}:operation==='board'?{operation:'board',entityId:self?.shipping?.boardingId}:{operation:'accept',contractId:row.contractId,shipmentId:row.id});if(!result)throw new Error('Join the live shipping map before accepting a task.');if(context!==revision)return;if(result.players){const id=result.selfId||actorId;self=result.players[id]||self;}if(operation==='board'){renderTasks();status('Vessel boarded. At the origin dock, accept this item shipment.');}else{screen.close();if(operation==='accept')onShipping({portId:originPort(row,selectedRoute)});announce(operation==='accept'?'Cargo assigned. Load, secure and sail the manifest to restock its destination.':'Navigating to the shipment’s origin port.');}}
  catch(error){if(context===revision)status(error.message);}
  finally{if(context===revision){busy=false;renderControls();}}
 };
 $('[data-air-tasks]').onclick=async event=>{
  const button=event.target.closest('[data-air-action]');if(!button||button.disabled||busy)return;
  const task=airFreightRows(data?.airTasks).find(row=>row.id===button.dataset.airTaskId);if(!task)return;
  const operation=button.dataset.airAction,context=revision;
  if(operation==='map'){screen.close();onMap({airTaskId:task.id,origin:task.route?.origin,destination:task.route?.destination});announce('Port roads and cargo airfields are marked on the world map. Departure: '+(task.route?.origin?.name||'departure apron')+'. Receiving: '+(task.route?.destination?.name||'receiving apron')+'.');return;}
  if(operation==='travel'){
   screen.close();if(onNavigate){try{await onNavigate(task.mapId||SHIPPING_ID);}catch(error){if(context===revision){open({section:'shipments'});status(error.message);}}}
   else{const target=new URL('model-explorer.html',location.href);target.searchParams.set('environment',task.mapId||SHIPPING_ID);target.searchParams.set('autoplay','1');target.searchParams.set('mode','multiplayer');location.assign(target.href);}return;
  }
  busy=true;renderControls();
  try{
   if(typeof command!=='function')throw new Error('Join the live shipping map and board the assigned aircraft to operate air freight.');
   const result=await command(operation==='fly'?'vehicle-navigate':'world-supply-air',operation==='fly'?{destinationId:task.route?.destination?.runwayId||task.route?.destination?.id}:{operation,airTaskId:task.id});
   if(!result)throw new Error('Join the live shipping map before operating air freight.');if(disposed||context!==revision)return;
   if(result.players){const id=result.selfId||actorId;self=result.players[id]||self;aircraft=result.actors?.[self?.vehicleId]||aircraft;}
   if(operation==='fly'){screen.close();announce('Automatic flight follows the assigned receiving airfield. After landing, stop at its cargo apron and confirm unloading in World item factory.');}
   else{await refresh({force:true});if(!disposed&&context===revision)status(operation==='reserve'?'Aircraft and counted air cargo reserved. Load and secure the manifest before takeoff.':operation==='secure'?'Air cargo secured. Fly to the marked receiving airfield.':operation==='release'?'Air reservation released. Undelivered goods remain reserved in the supply chain.':'Air freight updated from the server.');}
  }catch(error){if(!disposed&&context===revision)status(error.message);}
  finally{if(!disposed&&context===revision){busy=false;renderAirTasks();renderControls();}}
 };
 return {attachToggle(parent){const extra=toggle.cloneNode(true);extra.onclick=()=>open();parent.append(extra);extraToggles.push(extra);return extra;},open,close:()=>screen.close(),visible:()=>screen.dialog.open,refresh,update(snapshot,selfId,env){if(disposed)return;const changed=env?.id!==environment?.id,previousSelf=JSON.stringify([self?.vehicleId,self?.shipping?.availableContracts,self?.shipping?.boardingId,self?.shipping?.job?.id,self?.shipping?.job?.phase,[self?.airFreight?.airTaskId,self?.airFreight?.phase,self?.airFreight?.loadReadyAt,self?.airFreight?.unloadReadyAt],aircraft?.id,aircraft?.flight?.airborne,Math.max(Math.abs(aircraft?.flight?.speed||0),Math.abs(aircraft?.flight?.airspeed||0))<.8]);environment=env||environment;actorId=selfId||actorId;self=snapshot?.players?.[actorId]||null;aircraft=snapshot?.actors?.[self?.vehicleId]||null;if(changed){revision++;addressRequest++;addressLoading=false;addressResolving=false;recipeRequest++;traceRequest++;recipeDetails=null;traceData=null;busy=false;data=null;quote=null;quoteKey='';selectedShippingMap='';notice='';if(screen.dialog.open){status('Loading destination map…');void refresh();}}else if(screen.dialog.open&&previousSelf!==JSON.stringify([self?.vehicleId,self?.shipping?.availableContracts,self?.shipping?.boardingId,self?.shipping?.job?.id,self?.shipping?.job?.phase,[self?.airFreight?.airTaskId,self?.airFreight?.phase,self?.airFreight?.loadReadyAt,self?.airFreight?.unloadReadyAt],aircraft?.id,aircraft?.flight?.airborne,Math.max(Math.abs(aircraft?.flight?.speed||0),Math.abs(aircraft?.flight?.airspeed||0))<.8]))renderTasks();if(!deepLinkOpened&&self&&(requestedDeedId||requestedAddressId||new URL(location.href).searchParams.has('supplyOrder'))){deepLinkOpened=true;taskOrderId=new URL(location.href).searchParams.get('supplyOrder')||'';open({section:taskOrderId?'shipments':'orders'});}},reset(){selectedChallengeId='';revision++;addressRequest++;addressLoading=false;addressResolving=false;recipeRequest++;traceRequest++;recipeDetails=null;traceData=null;busy=false;data=null;quote=null;self=null;aircraft=null;notice='';screen.close();},dispose(){disposed=true;revision++;addressRequest++;designer.dispose();clearInterval(pollTimer);clearInterval(tickTimer);screen.close();screen.disconnect();screen.dialog.remove();toggle.remove();for(const extra of extraToggles)extra.remove();}};
}
