import {fullscreenPanel} from './fullscreen-panels.js';
import {loadGameMenuStyles} from './game-menu-controls.js';
import {requestGameInputRelease} from './game-input-release.js';
import {signalInventoryChange} from './shared-game-inventory.js';
import {isShippingEnvironment,SHIPPING_ID} from './shipping-config.js';

const count=value=>Math.max(0,Number(value)||0).toLocaleString();
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function filterSupplyItems(catalog,search=''){
 const words=String(search).trim().toLowerCase().split(/\s+/).filter(Boolean);
 return (catalog||[]).filter(item=>words.every(word=>[item.name,item.id,item.buildAssetId,item.modelUrl].filter(Boolean).join(' ').toLowerCase().includes(word)));
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

export function mountWorldSupplyUI({stage,inventory,command,showLabel=false,onOpen=()=>{},onClose=()=>{},onShipping=()=>{},announce=()=>{}}){
 loadGameMenuStyles();
 if(!document.querySelector('#world-supply-style')){const style=document.createElement('link');style.id='world-supply-style';style.rel='stylesheet';style.href=new URL('../css/world-supply.css',import.meta.url).href;document.head.append(style);}
 const toggle=document.createElement('button');toggle.type='button';toggle.className='factory-toggle world-supply-toggle';toggle.title='World item factory';toggle.setAttribute('aria-label','World item factory');toggle.setAttribute('aria-controls','world-supply-panel');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-haspopup','dialog');toggle.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 20V10l6 3V8l6 3V4h4v16H3ZM6 17h2m3 0h2m3 0h2M8 4l3-2 3 2M11 2v5"/></svg>';if(showLabel){toggle.classList.add('world-supply-toggle-label');toggle.insertAdjacentHTML('beforeend','<span>World item factory</span>');}stage.append(toggle);
 const panel=document.createElement('section');panel.id='world-supply-panel';panel.className='world-supply-panel';panel.hidden=true;panel.setAttribute('aria-label','World item factory');
 panel.innerHTML='<div class="supply-intro"><span>WORLD SUPPLY NETWORK</span><h3>Build. Ship. Restock.</h3><p>World stock starts with 1,000 of each item and depletes as items are purchased or deployed. Untouched maps draw from that reserve. Once an item is delivered to a map, its local inventory must be restocked through shipping.</p><p>Warehouse links to shipping ports are simulated; sea passage is playable. Delivered stock supplies destination map warehouses and stores.</p></div><p class="supply-status" data-status role="status" aria-live="polite">Loading world supply…</p><div class="supply-layout"><section><h3>1. Factory production</h3><label>Find any item<input type="search" data-search placeholder="Search native items or GLB models" autocomplete="off"></label><p class="supply-muted" data-matches></p><label>Item<select data-item></select></label><div class="supply-counts" data-counts></div><label>Quantity<input data-quantity type="number" min="1" max="10000" step="1" value="10" inputmode="numeric"></label><p data-discount class="supply-muted"></p><div class="supply-buttons"><button type="button" data-quote>Get price</button><button type="button" data-produce disabled>Start production</button></div><p data-price>Choose an item and request a price.</p><h4>Production orders</h4><div data-production></div></section><section><h3>2. Shipping dispatch</h3><label>Source inventory<select data-source></select></label><p data-source-count class="supply-muted"></p><label>Destination inventory<select data-destination></select></label><label>Shipping map<select data-shipping-world></select></label><label>Shipping route<select data-route></select></label><p data-shipping-map class="supply-muted"></p><button type="button" data-dispatch>Dispatch selected item & quantity</button><p class="supply-muted">Dispatch reserves existing stock from the selected source. The destination receives it only after the assigned sea route is sailed, docked and fully unloaded.</p><h4>Shipment tasks</h4><div data-shipments></div></section></div><section class="supply-stock"><div class="supply-stock-heading"><h3>Item-by-item stock</h3><label>Map inventory<select data-stock-map></select></label><button type="button" data-refresh>Refresh counts</button></div><div class="supply-table-scroll"><table><thead><tr><th scope="col">Item</th><th scope="col">World</th><th scope="col">Factory</th><th scope="col">Map</th></tr></thead><tbody data-stock></tbody></table></div><div class="supply-pagination"><button type="button" data-previous>Previous</button><span data-page></span><button type="button" data-next>Next</button></div></section>';
 const $=selector=>panel.querySelector(selector);
 let environment=null,data=null,busy=false,disposed=false,revision=0,page=0,quote=null,quoteKey='',pollTimer=null,refreshing=false,stockMap='',selection='',destination='',sourceMapId='factory',selectedShippingMap='',routeId='gulf-gateway';
 const pending=new Map(),extraToggles=[];
 const currentId=()=>environment?.id||'';
 const item=()=>data?.catalog?.find(row=>row.id===selection);
 const quantity=()=>Number($('[data-quantity]').value);
 const selectionKey=()=>JSON.stringify([selection,quantity()]);
 const status=message=>{$('[data-status]').textContent=message;};
 const screen=fullscreenPanel(panel,{onOpen:()=>{document.exitPointerLock?.();requestGameInputRelease('world-supply-open');onOpen();clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!busy)void refresh();},5000);void refresh();},onClose:()=>{clearInterval(pollTimer);pollTimer=null;onClose();}});
 screen.dialog.classList.add('world-supply-dialog');
 function selectedOptions(select,records,selected){select.replaceChildren();for(const row of records){const option=document.createElement('option');option.value=row.id;option.textContent=row.name||row.id;select.append(option);}select.value=selected;}
 function invalidateQuote(){quote=null;quoteKey='';$('[data-price]').textContent='Choose an item and request a price.';renderControls();}
 function renderControls(){
  const valid=!!item()&&Number.isSafeInteger(quantity())&&quantity()>0&&quantity()<=10000;
  for(const selector of ['[data-item]','[data-quantity]','[data-search]','[data-destination]','[data-source]','[data-shipping-world]','[data-route]'])$(selector).disabled=busy;
  $('[data-quote]').disabled=busy||!valid;$('[data-produce]').disabled=busy||!valid||!quote||quoteKey!==selectionKey();
  $('[data-dispatch]').disabled=busy||!valid||!destination||!routeId||sourceMapId===destination||supplySourceStock(data,sourceMapId,selection)<quantity();
  $('[data-refresh]').disabled=busy;for(const button of panel.querySelectorAll('[data-accept],[data-cancel-shipment],[data-cancel-production]'))button.disabled=busy;
  $('[data-source-count]').textContent='Available at source: '+count(supplySourceStock(data,sourceMapId,selection))+' units of the selected item.';
  const local=data?.maps?.find(map=>map.id===currentId());
  $('[data-counts]').textContent=item()?`World: ${count(data.worldStock?.[selection])} · Factory: ${count(data.factoryStock?.[selection])} · This map: ${count(local?.stock?.[selection])}`:'';
 }
 function renderCatalog(){
  const matches=filterSupplyItems(data?.catalog,$('[data-search]').value);$('[data-matches]').textContent=`${matches.length.toLocaleString()} items · Native items and GLB models`;
  if(!matches.some(row=>row.id===selection))selection=matches[0]?.id||'';
  selectedOptions($('[data-item]'),matches,selection);renderControls();renderStocks();
 }
 function renderStocks(){
  const rows=filterSupplyItems(data?.catalog,$('[data-search]').value),pages=Math.max(1,Math.ceil(rows.length/30));page=Math.max(0,Math.min(page,pages-1));
  const map=data?.maps?.find(row=>row.id===stockMap);
  $('[data-stock]').innerHTML=rows.slice(page*30,(page+1)*30).map(row=>'<tr><th scope="row">'+esc(row.name)+'<small>'+esc(row.id)+'</small></th><td>'+count(data.worldStock?.[row.id])+'</td><td>'+count(data.factoryStock?.[row.id])+'</td><td>'+count(map?.stock?.[row.id])+'</td></tr>').join('')||'<tr><td colspan="4">No items match your search.</td></tr>';
  $('[data-page]').textContent=`Page ${page+1} of ${pages}`;$('[data-previous]').disabled=page===0;$('[data-next]').disabled=page>=pages-1;
 }
 function renderTasks(){
  const names=new Map((data?.catalog||[]).map(row=>[row.id,row.name])),maps=new Map((data?.maps||[]).map(row=>[row.id,row.name]));
  const production=(data?.production||[]).slice(-20).reverse();
  $('[data-production]').innerHTML=production.map(row=>'<article class="supply-task"><strong>'+esc(names.get(row.itemId)||row.itemId)+' × '+count(row.quantity)+'</strong><span>'+esc(row.phase==='building'?'Building · '+Math.max(0,Math.ceil((row.readyAt-(data.serverTime||Date.now()))/1000))+'s remaining':row.phase==='ready'?'Ready in factory stock':row.phase)+'</span>'+(row.phase==='building'?'<button type="button" data-cancel-production="'+esc(row.id)+'">Cancel production & refund</button>':'')+'</article>').join('')||'<p class="supply-muted">No production orders yet.</p>';
  const shipments=(data?.shipments||[]).slice(-30).reverse();
  $('[data-shipments]').innerHTML=shipments.map(row=>{
   const available=['queued','ready','awaiting-shipping','pending'].includes(row.phase)&&!row.jobId,canAccept=available&&currentId()===row.shippingMapId&&isShippingEnvironment(environment);
   return '<article class="supply-task"><strong>'+esc(names.get(row.itemId)||row.itemId)+' × '+count(row.quantity)+'</strong><span>From '+esc(row.sourceMapId&&row.sourceMapId!=='factory'?(maps.get(row.sourceMapId)||row.sourceMapId):'Factory output')+' → To '+esc(maps.get(row.destinationMapId)||row.destinationMapId)+'</span><span>'+esc(supplyShipmentTask(row,currentId()))+'</span><small>'+esc(row.shippingMapId)+' · '+esc(row.contractId)+'</small><div class="supply-buttons">'+(canAccept?'<button type="button" data-accept="'+esc(row.id)+'">Accept shipping task</button>':'')+(available?'<button type="button" data-cancel-shipment="'+esc(row.id)+'">Return cargo to source</button>':'')+'</div></article>';
  }).join('')||'<p class="supply-muted">Dispatch completed stock to create a shipping task.</p>';
 }
 function render(){
  if(!data)return;const maps=data.maps||[];
  if(!maps.some(row=>row.id===destination))destination=maps.some(row=>row.id===currentId())?currentId():maps[0]?.id||'';
  if(!maps.some(row=>row.id===stockMap))stockMap=maps.some(row=>row.id===currentId())?currentId():maps[0]?.id||'';
  const sources=[{id:'factory',name:'Factory output'},...maps];if(!sources.some(row=>row.id===sourceMapId))sourceMapId='factory';selectedOptions($('[data-source]'),sources,sourceMapId);
  selectedOptions($('[data-destination]'),maps,destination);selectedOptions($('[data-stock-map]'),maps,stockMap);
  const shippingMaps=data.shippingMaps?.length?data.shippingMaps:[{id:SHIPPING_ID,name:'Strait of Hormuz Shipping Academy'},...(isShippingEnvironment(environment)&&currentId()!==SHIPPING_ID?[{id:currentId(),name:environment.name||currentId()}]:[])];
  if(!shippingMaps.some(row=>row.id===selectedShippingMap))selectedShippingMap=isShippingEnvironment(environment)?currentId():shippingMaps.find(row=>row.id===SHIPPING_ID)?.id||shippingMaps[0]?.id;
  selectedOptions($('[data-shipping-world]'),shippingMaps,selectedShippingMap);
  const routes=data.routes||[];if(!routes.some(row=>row.id===routeId))routeId=routes[0]?.id||'';selectedOptions($('[data-route]'),routes,routeId);
  const rules=data.rules||{};$('[data-discount]').textContent=`${rules.bulkDiscountPercent??20}% bulk discount from ${rules.bulkMinimum??10} units. Completed output enters shared factory stock.`;
  $('[data-shipping-map]').textContent='Board at the selected route’s origin port to collect your reserved cargo.';
  const priorSelection=selection;renderCatalog();if(priorSelection!==selection)invalidateQuote();renderTasks();renderControls();
 }
 async function refresh(){
  if(disposed||refreshing)return;const context=revision;refreshing=true;
  try{const next=await inventory.api('/api/world-supply?mapId='+encodeURIComponent(currentId()));if(disposed||context!==revision)return;data=next;render();if(!busy)status('Counts synchronized. Choose an item to build or a shipment task to deliver.');}
  catch(error){if(!disposed&&context===revision)status(error.message);}
  finally{refreshing=false;if(!disposed&&context!==revision&&screen.dialog.open)void refresh();}
 }
 async function post(operation,fields){
  const session=await inventory.session(),key=operation+':'+JSON.stringify(fields);if(!pending.has(key))pending.set(key,crypto.randomUUID());
  const result=await inventory.api('/api/world-supply/'+operation,{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify({...fields,mapId:currentId(),requestId:pending.get(key)})});pending.delete(key);return result;
 }
 async function run(operation,fields){
  if(busy||disposed)return;const context=revision;if(operation==='quote'){quote=null;quoteKey='';$('[data-price]').textContent='Requesting server price…';}busy=true;renderControls();status('Saving '+operation+'…');
  try{const result=await post(operation,fields);if(disposed||context!==revision)return;
   if(operation==='quote'){quote=result;quoteKey=selectionKey();$('[data-price]').textContent=`${count(result.priceMzk)} MZK · ${Number(result.discountPercent)||0}% discount · ${Math.ceil((Number(result.buildMs)||0)/1000)}s build`;status('Server price received. Start production to place this order.');}
   else{signalInventoryChange();window.MZKWallet?.refreshShared?.().catch(()=>{});await refresh();if(context===revision)status(result.message||'World supply updated.');}
  }catch(error){if(!disposed&&context===revision)status(error.message);}
  finally{if(context===revision){busy=false;renderControls();}}
 }
 toggle.onclick=()=>screen.open();$('[data-search]').addEventListener('input',()=>{page=0;invalidateQuote();renderCatalog();});
 $('[data-item]').onchange=event=>{selection=event.target.value;invalidateQuote();};$('[data-quantity]').oninput=invalidateQuote;
 $('[data-destination]').onchange=event=>{destination=event.target.value;renderControls();};$('[data-source]').onchange=event=>{sourceMapId=event.target.value;renderControls();};$('[data-stock-map]').onchange=event=>{stockMap=event.target.value;renderStocks();};$('[data-route]').onchange=event=>{routeId=event.target.value;renderControls();};$('[data-shipping-world]').onchange=event=>{selectedShippingMap=event.target.value;renderControls();};
 $('[data-quote]').onclick=()=>run('quote',{itemId:selection,quantity:quantity()});$('[data-produce]').onclick=()=>run('produce',{itemId:selection,quantity:quantity(),expectedPriceMzk:quote?.priceMzk});
 $('[data-dispatch]').onclick=()=>run('dispatch',{itemId:selection,quantity:quantity(),sourceMapId,destinationMapId:destination,contractId:routeId,shippingMapId:selectedShippingMap});
 $('[data-refresh]').onclick=()=>refresh();$('[data-previous]').onclick=()=>{page--;renderStocks();};$('[data-next]').onclick=()=>{page++;renderStocks();};
 $('[data-production]').onclick=event=>{const cancel=event.target.closest('[data-cancel-production]');if(cancel)void run('cancel',{productionId:cancel.dataset.cancelProduction});};
 $('[data-shipments]').onclick=async event=>{
  const cancel=event.target.closest('[data-cancel-shipment]');if(cancel){void run('cancel',{shipmentId:cancel.dataset.cancelShipment});return;}
  const accept=event.target.closest('[data-accept]');if(!accept||busy)return;const row=data?.shipments?.find(value=>value.id===accept.dataset.accept);if(!row)return;
  const context=revision;busy=true;renderControls();
  try{const result=await command('shipping',{operation:'accept',contractId:row.contractId,shipmentId:row.id});if(!result)throw new Error('Join the live shipping map before accepting a task.');if(context!==revision)return;screen.close();onShipping();announce('Cargo assigned. Load, secure and sail the shipping manifest to restock its destination.');}
  catch(error){if(context===revision)status(error.message);}
  finally{if(context===revision){busy=false;renderControls();}}
 };
 return {attachToggle(parent){const extra=toggle.cloneNode(true);extra.onclick=()=>screen.open();parent.append(extra);extraToggles.push(extra);return extra;},open:()=>screen.open(),close:()=>screen.close(),visible:()=>screen.dialog.open,refresh,update(snapshot,selfId,env){if(disposed)return;const changed=env?.id!==environment?.id;environment=env||environment;if(changed){revision++;busy=false;data=null;quote=null;quoteKey='';selectedShippingMap='';if(screen.dialog.open){status('Loading destination map…');void refresh();}}},reset(){revision++;busy=false;data=null;quote=null;screen.close();},dispose(){disposed=true;revision++;clearInterval(pollTimer);screen.close();screen.disconnect();screen.dialog.remove();toggle.remove();for(const extra of extraToggles)extra.remove();}};
}
