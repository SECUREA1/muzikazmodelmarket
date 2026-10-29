import {factoryAddressOrderUrl} from './world-supply-address-ui.js';
import {readJsonResponse} from './json-response.js';

export {factoryAddressOrderUrl} from './world-supply-address-ui.js';
const rows=value=>Array.isArray(value)?value:Array.isArray(value?.addresses)?value.addresses:[];
const text=value=>String(value??'');
const coordinate=value=>Number.isFinite(Number(value))?Number(value).toFixed(1):'—';
export function storeAddressFacts(address){
 if(!address)return [];
 const point=address.dropoff?.position||address.position||{};
 return [['Address',address.addressLine||address.name||address.id],['Map',address.mapName||address.mapId],['Recipient',address.owner?.name||'Public facility'],['Drop-off',`${coordinate(point.x)}, ${coordinate(point.y)}, ${coordinate(point.z)}`]];
}
export function factoryOrderItemId(record={}){
 const item=record.asset||record.model||record;
 if(record.factoryProducible===false||item.factoryProducible===false)return null;
 if(record.factoryProducible!==true&&item.factoryProducible!==true)return null;
 const id=record.factoryItemId||item.factoryItemId;
 return typeof id==='string'&&id.length>0&&id.length<=400&&!/^(?:https?|blob|data|file|javascript):/i.test(id)&&!/[\x00-\x1f]/.test(id)?id:null;
}
export function chooseStoreAddress(addresses,context={}){
 return addresses.find(address=>address.id===(context.addressId||context.deliveryAddressId))||addresses.find(address=>context.storeObjectId&&address.objectId===context.storeObjectId)||null;
}
export function mergeStoreAddressPage(previous,records,{append=false,mapId='',offset=0}={}){
 const incoming=rows(records).slice(0,200).filter(row=>row&&typeof row.id==='string'&&row.id&&(!mapId||row.mapId===mapId)),merged=new Map((append?previous:[]).map(address=>[address.id,address]));
 for(const address of incoming)merged.set(address.id,address);
 const addresses=[...merged.values()],next=records?.nextOffset,hasMore=records?.hasMore===true&&incoming.length>0&&Number.isSafeInteger(next)&&next>offset;
 return {addresses,total:Math.max(addresses.length,Number.isSafeInteger(records?.total)?records.total:addresses.length),nextOffset:hasMore?next:null};
}

/** Address discovery is explicitly opened by the player. No background or
 * per-frame catalog request, product renderer, payment or production is added. */
export function mountStoreAddressUI(root,{inventory,request,getEnvironment=()=>null,itemId=null,onStatus=()=>{},mode='store'}={}){
 const doc=root.ownerDocument;
 if(!doc.querySelector('[data-store-address-style]')){
  const style=doc.createElement('style');style.dataset.storeAddressStyle='';style.textContent='.store-address-ui{margin:16px 0;border:1px solid #42616e;border-radius:10px;background:#10232e;color:#e1edf1;padding:0 14px;min-width:0;overflow-wrap:anywhere}.store-address-ui [hidden]{display:none!important}.store-address-ui summary{min-height:44px;display:list-item;padding:12px 0;cursor:pointer;font:600 14px/1.5 system-ui}.store-address-ui .store-address-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.store-address-ui label{display:flex;flex-direction:column;gap:6px;font:12px/1.4 system-ui;color:#b8d3d5;margin:10px 0}.store-address-ui input,.store-address-ui select{box-sizing:border-box;width:100%;min-width:0;max-width:100%;min-height:44px;padding:8px;border:1px solid #547780;border-radius:6px;background:#0a1e27;color:#eaf6f1;font:14px system-ui}.store-address-ui button,.store-address-ui a[data-store-address-order]{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 12px;border:1px solid #6ca296;border-radius:7px;background:#214740;color:#e4f6ed;text-decoration:none;font:600 12px/1.4 system-ui;cursor:pointer}.store-address-ui button:disabled{opacity:.5;cursor:wait}.store-address-ui dl{margin:12px 0}.store-address-ui dl>div{display:grid;grid-template-columns:82px minmax(0,1fr);gap:10px;font:12px/1.5 system-ui;padding:5px 0}.store-address-ui dt{color:#9db8bd}.store-address-ui dd{margin:0;overflow-wrap:anywhere}.store-address-ui p{font:12px/1.5 system-ui;color:#a9c3c7}.store-address-ui :focus-visible{outline:3px solid #b6e6b8;outline-offset:3px}.store-address-ui .store-address-actions{display:flex;gap:10px;flex-wrap:wrap;padding-bottom:12px}@media(max-width:600px){.store-address-ui .store-address-fields{grid-template-columns:minmax(0,1fr)}.store-address-ui .store-address-actions>a{width:100%}}';doc.head.append(style);
 }
 root.classList.add('store-address-ui');
 root.innerHTML='<details data-store-address-details><summary data-store-address-summary>'+ (mode==='product'?'Order factory supply for a store or deed':'Store address & shipping supply')+'</summary><p>Choose a receiving address, then review production and shipping in the factory. You pay with your own MZK; no order starts from this link.</p><div class="store-address-fields"><label data-store-map-search-label>Find a map<input type="search" data-store-map-search placeholder="Map or member plot"></label><label data-store-map-label>Delivery map<select data-store-address-map><option value="">Choose a map</option></select></label></div><label>Find a store or building<input type="search" data-store-address-search placeholder="Store, building, owner or street"></label><label>Store or building<select data-store-address-select><option value="">Choose an address</option></select></label><p data-store-address-count></p><button type="button" data-store-address-more hidden>Load more addresses</button><p data-store-address-status role="status" aria-live="polite">Open to discover current receiving addresses.</p><dl data-store-address-facts></dl><div class="store-address-actions"><button type="button" data-store-address-refresh>Refresh addresses</button><a data-store-address-order hidden>Ship supplies to this store</a></div></details>';
 const $=selector=>root.querySelector(selector),details=$('[data-store-address-details]');
 let context={},maps=null,addresses=[],selected='',generation=0,disposed=false,loading=false,controller=null,nextOffset=null,total=0;
 const status=message=>{if(disposed)return;$('[data-store-address-status]').textContent=message;onStatus(message);};
 async function api(path,signal){
  if(inventory?.api)return inventory.api(path,{signal});
  const fetcher=request||globalThis.window?.MUZIKAZ_API?.fetch?.bind(globalThis.window.MUZIKAZ_API)||globalThis.fetch?.bind(globalThis);
  if(!fetcher)throw Error('Delivery addresses are unavailable.');
  const response=await fetcher(path,{signal,credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}),payload=typeof response?.json==='function'?await readJsonResponse(response):response;
  if(response?.ok===false||payload?.success===false)throw Object.assign(Error(payload?.message||'Delivery addresses are unavailable.'),{status:response?.status});
  return payload?.data??payload;
 }
 function setOptions(select,values,value,placeholder){
  select.replaceChildren(new Option(placeholder,''));
  for(const row of values){const option=doc.createElement('option');option.value=row.id;option.textContent=row.name||row.id;select.append(option);}
  select.value=values.some(row=>row.id===value)?value:'';
 }
 function renderMaps(){
  const needle=$('[data-store-map-search]').value.trim().toLocaleLowerCase(),matches=(maps||[]).filter(map=>!needle||[map.name,map.ownerName,map.id].join(' ').toLocaleLowerCase().includes(needle));
  const shown=matches.slice(0,500);if(context.mapId&&!shown.some(map=>map.id===context.mapId)){const current=(maps||[]).find(map=>map.id===context.mapId);if(current)shown.unshift(current);}
  setOptions($('[data-store-address-map]'),shown,context.mapId,'Choose a map');
  if(matches.length>500)status('Showing the first 500 matching maps. Refine the map search.');
 }
 function renderAddresses(){
  const needle=$('[data-store-address-search]').value.trim().toLocaleLowerCase(),matches=addresses.filter(address=>!needle||[address.name,address.addressLine,address.owner?.name,address.kind].join(' ').toLocaleLowerCase().includes(needle));
  const shown=matches.slice(0,500),current=addresses.find(address=>address.id===selected);if(current&&!shown.some(address=>address.id===current.id))shown.unshift(current);
  setOptions($('[data-store-address-select]'),shown.map(address=>({id:address.id,name:address.name+' · '+(address.addressLine||address.id)})),selected,addresses.length?'Choose an address':'No receiving addresses found');
  $('[data-store-address-count]').textContent=addresses.length?(matches.length>500?'Showing 500 of '+matches.length+' loaded matches. Refine the search.':matches.length+' matching receiving address'+(matches.length===1?'':'es')+'.')+(total>addresses.length?' '+addresses.length+' of '+total+' addresses loaded; load more to search the rest.':''):'';
  $('[data-store-address-more]').hidden=nextOffset===null;
  $('[data-store-address-more]').textContent='Load more addresses'+(total?' ('+addresses.length+' / '+total+')':'');
 }
 function renderSelection(){
  const address=addresses.find(row=>row.id===selected),facts=$('[data-store-address-facts]'),link=$('[data-store-address-order]');facts.replaceChildren();
  for(const [label,value]of storeAddressFacts(address)){const row=doc.createElement('div'),term=doc.createElement('dt'),detail=doc.createElement('dd');term.textContent=label;detail.textContent=value;row.append(term,detail);facts.append(row);}
  const url=address&&address.canOrder!==false?factoryAddressOrderUrl(address.id,{itemId}):null;
  link.hidden=!url;if(url)link.href=url;else link.removeAttribute('href');
  link.textContent=mode==='product'?'Review factory order & shipping':address?.kind==='store'?'Ship supplies to this store':'Ship supplies to this address';
  if(address)status(address.canOrder===false?'This address cannot receive a new order.':'Any signed-in player can send a paid shipment to this address. Goods arrive through the shipping channels and final drop-off.');
 }
 function controls(){for(const input of root.querySelectorAll('input,select,button'))input.disabled=loading;}
 async function load({append=false}={}){
  if(disposed||!details.open)return;
  if(append&&nextOffset===null)return;
  const offset=append?nextOffset:0;
  controller?.abort();controller=new AbortController();const signal=controller.signal,current=++generation;loading=true;controls();$('[data-store-address-order]').hidden=true;status('Loading current delivery addresses…');
  try{
   if(mode==='product'&&!maps){
    const records=await api('/api/environments',signal);if(disposed||current!==generation)return;
    maps=(Array.isArray(records)?records:records?.environments||[]).filter(map=>map.visibility!=='private'&&map.playable!==false).sort((a,b)=>text(a.name).localeCompare(text(b.name)));renderMaps();
   }
   if(!context.mapId&&!context.addressId){addresses=[];selected='';nextOffset=null;total=0;renderAddresses();renderSelection();status('Choose a delivery map to find its stores, buildings and deed entrances.');return;}
   const query=context.addressId&&!append?'addressId='+encodeURIComponent(context.addressId):'mapId='+encodeURIComponent(context.mapId)+(append?'&offset='+offset+'&limit=200':''),records=await api('/api/world-supply/addresses?'+query,signal);if(disposed||current!==generation)return;
   const page=mergeStoreAddressPage(addresses,records,{append,mapId:context.mapId,offset});addresses=page.addresses;nextOffset=page.nextOffset;total=page.total;
   // A looked-at building may lie beyond the first page. Resolve that exact
   // public identity without downloading every intervening page.
   if(!append&&!chooseStoreAddress(addresses,context)&&context.storeObjectId&&context.mapId){
    const id='address:'+encodeURIComponent(context.mapId)+':'+encodeURIComponent(context.storeObjectId);
    try{const exact=await api('/api/world-supply/addresses?addressId='+encodeURIComponent(id),signal);if(disposed||current!==generation)return;for(const address of rows(exact))if(address?.id===id&&address.mapId===context.mapId){addresses=[...addresses.filter(row=>row.id!==id),address];total=Math.max(total,addresses.length);}}
    catch(error){if(error?.status!==404)throw error;}
   }
   const preferred=chooseStoreAddress(addresses,context);selected=preferred?.id||(addresses.some(row=>row.id===selected)?selected:'');
   if(!context.mapId&&preferred)context.mapId=preferred.mapId;
   if(mode==='store')setOptions($('[data-store-address-map]'),[{id:context.mapId,name:context.mapName||preferred?.mapName||context.mapId}],context.mapId,'Current map');else renderMaps();
   renderAddresses();
   renderSelection();if(!selected)status(addresses.length?'Choose the store or building to receive your supplies.':'No public receiving addresses were found on this map. Try another map or refresh.');
  }catch(error){if(!disposed&&current===generation&&error?.name!=='AbortError'){if(!append){addresses=[];selected='';nextOffset=null;total=0;}renderAddresses();renderSelection();status(error?.message||'Delivery addresses could not be loaded.');}}
  finally{if(!disposed&&current===generation){loading=false;controls();}}
 }
 function prepare(options={}){
  const environment=getEnvironment()||{},addressId=options.addressId||options.deliveryAddressId||'',next={mapId:options.mapId||(!addressId&&(environment.id||inventory?.getMapId?.()))||'',mapName:options.mapName||environment.name||'',addressId,storeObjectId:options.storeObjectId||''};
  if(JSON.stringify(next)!==JSON.stringify(context)){generation++;controller?.abort();loading=false;context=next;addresses=[];selected='';nextOffset=null;total=0;$('[data-store-address-search]').value='';$('[data-store-address-count]').textContent='';$('[data-store-address-more]').hidden=true;setOptions($('[data-store-address-select]'),[],null,'Choose an address');renderSelection();controls();}
  $('[data-store-map-label]').hidden=mode==='store'&&!next.mapId;$('[data-store-map-search-label]').hidden=mode!=='product';
  if(mode==='store'&&next.mapId)setOptions($('[data-store-address-map]'),[{id:next.mapId,name:next.mapName||next.mapId}],next.mapId,'Current map');
 }
 const toggle=()=>{if(details.open)void load();else if(!details.open){generation++;controller?.abort();loading=false;controls();}};details.addEventListener('toggle',toggle);
 const select=()=>{selected=$('[data-store-address-select]').value;const address=addresses.find(row=>row.id===selected);context={...context,addressId:'',storeObjectId:address?.objectId||''};renderSelection();};$('[data-store-address-select]').addEventListener('change',select);
 const mapChange=()=>{context={...context,mapId:$('[data-store-address-map]').value,addressId:'',storeObjectId:''};addresses=[];selected='';nextOffset=null;total=0;renderAddresses();renderSelection();void load();};$('[data-store-address-map]').addEventListener('change',mapChange);
 const addressSearch=()=>renderAddresses();$('[data-store-address-search]').addEventListener('input',addressSearch);
 const mapSearch=()=>renderMaps();$('[data-store-map-search]').addEventListener('input',mapSearch);
 const refresh=()=>{void load();};$('[data-store-address-refresh]').addEventListener('click',refresh);
 const more=()=>{void load({append:true});};$('[data-store-address-more]').addEventListener('click',more);
 prepare();
 return {prepare,open(options={}){prepare(options);if(details.open)void load();else details.open=true;},close(){generation++;controller?.abort();loading=false;details.open=false;controls();},dispose(){if(disposed)return;disposed=true;generation++;controller?.abort();details.removeEventListener('toggle',toggle);root.replaceChildren();}};
}
