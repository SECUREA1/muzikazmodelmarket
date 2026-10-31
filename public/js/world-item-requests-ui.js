import {signalInventoryChange} from './shared-game-inventory.js';
import {FORGE_RECIPES} from './forge-recipes.js?v=world-requests-20261031';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const records=value=>Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];
const units=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const count=value=>units(value).toLocaleString();
const terminal=new Set(['delivered','cancelled']);
const html=(node,value)=>{if(node.dataset.render!==value){node.dataset.render=value;node.innerHTML=value;}};
const completedStock=(request,lots)=>Number.isSafeInteger(request.completedQuantity)?units(request.completedQuantity):Array.isArray(lots)?lots.filter(lot=>lot.itemId===request.itemId&&(!request.source||request.source==='any'||lot.source===request.source)).reduce((sum,lot)=>sum+units(lot.availableQuantity),0):null;
const forgeRecipe=itemId=>FORGE_RECIPES.find(recipe=>'native:'+recipe.buildAssetId===itemId)||null;
const itemImage=item=>{
 const image=item?.thumbnailUrl||item?.image||item?.thumbnail_url||'';
 if(/^(?:\/(?!\/)|https?:\/\/)/i.test(image))return image;
 const id=item?.buildAssetId||String(item?.itemId||item?.id||'').replace(/^native:/,'');
 return /^[a-z0-9-]+$/.test(id)?'/public/images/native-designs/'+id+'.svg?v=world-requests-20261031':'';
};

/** Read authoritative progress only; a production timer or sea arrival never
 * stands in for completed stock at the request's receiving address. */
export function worldItemRequestView(request={}){
 const quantity=units(request.quantity),deliveredQuantity=Math.min(quantity,units(request.deliveredQuantity)),complete=request.phase==='delivered'&&quantity>0&&deliveredQuantity>=quantity;
 const invalidComplete=request.phase==='delivered'&&!complete;
 const phase=invalidComplete?'attention':request.phase||'open';
 const labels={open:'Awaiting a maker',claimed:'Maker accepted · completed stock needed',building:'Production underway',producing:'Production underway',ready:'Completed stock ready for freight','awaiting-shipping':'Completed stock ready for freight',shipping:'Shipping and receiving handover underway',partial:'Some units received · remaining stock still needed','in-transit':'Shipping and receiving handover underway',onward:'Sea arrival confirmed · receiving delivery pending',attention:'Request needs attention',delivered:'Receiving stock confirmed',cancelled:'Request cancelled'};
 return {phase,complete,quantity,deliveredQuantity,committedQuantity:units(request.committedQuantity),fulfillableQuantity:Number.isSafeInteger(request.fulfillableQuantity)?units(request.fulfillableQuantity):Math.max(0,quantity-units(request.committedQuantity)),label:labels[phase]||'Waiting for a confirmed work update',canClaim:request.canClaim===true&&!terminal.has(phase),canCancel:request.canCancel===true&&!terminal.has(phase),canFulfill:request.canFulfill===true&&!terminal.has(phase),canMake:request.claimedByMe===true&&!terminal.has(phase),recipe:forgeRecipe(request.itemId),reference:request.shipmentIds?.at(-1)?{shipmentId:request.shipmentIds.at(-1),...(request.lotIds?.at(-1)?{lotId:request.lotIds.at(-1)}:{})}:request.lotIds?.at(-1)?{lotId:request.lotIds.at(-1)}:null};
}

export function filterWorldItemRequests(requests,{search='',scope='all',mapId='',phase='active'}={}){
 const words=String(search).trim().toLowerCase().split(/\s+/).filter(Boolean);
 return records(requests).filter(request=>{
  if(scope==='mine'&&!request.mine&&!request.claimedByMe)return false;
  if(mapId&&request.destinationMapId!==mapId&&request.address?.mapId!==mapId)return false;
  if(phase==='active'&&terminal.has(request.phase)||phase==='delivered'&&request.phase!=='delivered'||phase==='open'&&request.phase!=='open')return false;
  const text=[request.itemName,request.itemId,request.requesterName,request.address?.name,request.address?.mapName,request.destinationMapId,request.id].filter(Boolean).join(' ').toLowerCase();
  return words.every(word=>text.includes(word));
 });
}

/** Calls share the receiving-map and text filters, while claim/progress filters
 * apply to funded requests. Every matching call remains reachable by page. */
export function worldItemCallPage(calls,{search='',mapId='',page=0,pageSize=12}={}){
 const words=String(search).trim().toLowerCase().split(/\s+/).filter(Boolean);
 const matching=records(calls).filter(call=>{
  if(mapId&&(call.address?.mapId||call.destinationMapId||call.mapId)!==mapId)return false;
  const text=[call.itemName,call.itemId,call.address?.name,call.addressName,call.address?.mapName,call.mapName,call.destinationMapId,call.mapId,call.contact,call.title,call.reason].filter(Boolean).join(' ').toLowerCase();
  return words.every(word=>text.includes(word));
 });
 const size=Number.isSafeInteger(pageSize)&&pageSize>0?Math.min(50,pageSize):12,pages=Math.max(1,Math.ceil(matching.length/size)),index=Math.max(0,Math.min(pages-1,Number.isSafeInteger(page)?page:0));
 return {calls:matching.slice(index*size,(index+1)*size),total:matching.length,page:index,pages};
}

export function worldItemRequestCard(request,{busy=false,catalog=[],completedOwnedLots=null}={}){
 const view=worldItemRequestView(request),item=catalog.find(item=>(item.id||item.itemId)===request.itemId)||request,image=itemImage(item),address=request.address||{},available=completedStock(request,completedOwnedLots),dispatchQuantity=Math.min(view.fulfillableQuantity,available??view.fulfillableQuantity);
 const button=(action,label,inactive=false)=>'<button type="button" data-request-action="'+action+'" data-inventory-request="'+esc(request.id)+'"'+(busy||inactive?' disabled':'')+'>'+label+'</button>';
 const actions=[];
 if(view.canClaim)actions.push(button('claim','Accept making request'));
 if(view.canMake){if(request.source!=='forge')actions.push(button('factory','Make at World Item Factory'));if(view.recipe&&request.source!=='factory')actions.push(button('forge','Forge by hand'));}
 if(view.canFulfill&&view.fulfillableQuantity>0)actions.push(button('fulfill',dispatchQuantity?'Dispatch '+count(dispatchQuantity)+' completed owned '+(dispatchQuantity===1?'unit':'units'):'Complete & seal stock before dispatch',dispatchQuantity<1));
 if(view.reference)actions.push(button('trace','Inspect exact freight receipts'));
 if(request.shipmentIds?.length&&!view.complete&&!terminal.has(view.phase))actions.push(button('shipping','Open shipping & delivery'));
 if(view.canCancel)actions.push(button('cancel','Cancel remaining request'));
 return '<article class="world-request-card" data-world-request="'+esc(request.id)+'" data-request-phase="'+esc(view.phase)+'"><header>'+(image?'<img src="'+esc(image)+'" alt="" loading="lazy">':'')+'<div><span class="world-request-kind">'+esc(request.source==='forge'?'HAND-FORGED WORK ORDER':'WORLD ITEM WORK ORDER')+'</span><h4>'+esc(request.itemName||item.name||request.itemId)+'</h4><p>'+count(view.quantity)+(view.quantity===1?' unit · ':' units · ')+count(request.rewardMzk)+' MZK total reward</p></div></header><p class="world-request-recipient"><strong>'+esc(address.name||'Verified receiving address')+'</strong><span>'+esc(address.mapName||request.destinationMapId)+' · Requested by '+esc(request.requesterName||'A world member')+'</span></p><strong class="world-request-state">'+esc(view.label)+'</strong><progress max="'+Math.max(1,view.quantity)+'" value="'+view.deliveredQuantity+'" aria-label="Verified receiving progress"></progress><p class="world-request-counts">'+count(view.deliveredQuantity)+' / '+count(view.quantity)+' received · '+count(view.committedQuantity)+' committed to freight</p>'+(view.canMake&&available!==null?'<p class="world-request-note">Your completed, sealed stock: '+count(available)+' available units.</p>':'')+(request.attentionReason?'<p class="world-request-note">'+esc(request.attentionReason)+'</p>':'')+'<div class="world-request-actions">'+actions.join('')+'</div><small>Reward stays in escrow until the server confirms this item at its receiving address. Factory completion and sea arrival are separate steps.</small></article>';
}

export function worldItemAICallCard(call,{busy=false}={}){
 const address=call.address||{},quantity=units(call.quantity||call.suggestedQuantity),kind=call.kind==='shop'?'SHOP RESTOCK CALL':call.kind==='deed'?'DEED INVENTORY CALL':'AI RESTOCK CALL';
 return '<article class="world-request-call" data-ai-inventory-call="'+esc(call.id)+'"><span class="world-request-kind">'+kind+' · UNFUNDED</span><h4>'+esc(call.itemName||call.itemId)+'</h4><p>'+esc(address.name||call.addressName||call.name||'World facility')+' · '+esc(address.mapName||call.mapName||call.destinationMapId||call.mapId)+'</p><p>'+count(quantity)+' units requested'+(Number.isSafeInteger(call.currentStock)?' · '+count(call.currentStock)+' in '+esc(call.stockLabel||'current map stock'):'')+'</p><small>'+esc(call.reason||call.title||'Review the receiving address, quantity and MZK reward before funding a making request.')+(call.contact?' · '+esc(call.contact):'')+'</small><button type="button" data-request-action="select-call" data-ai-call="'+esc(call.id)+'"'+(busy?' disabled':'')+'>Review & fund this call</button></article>';
}

/** Inline workspace: the existing World Supply picker supplies canonical item,
 * shipping route and receiving address. Only the explicit fund button spends. */
export function mountWorldItemRequestsUI({host,inventory,getContext=()=>({}),onSelectCall=()=>{},onFactory=()=>{},onForge=()=>{},onShipping=()=>{},onTrace=()=>{},announce=()=>{},onChanged=()=>{}}={}){
 if(!host)throw new Error('World requests need a workspace host.');
 if(!document.querySelector('#world-item-request-styles')){const link=document.createElement('link');link.id='world-item-request-styles';link.rel='stylesheet';link.href=new URL('../css/world-item-requests.css?v=world-requests-20261031',import.meta.url).href;document.head.append(link);}
 host.classList.add('world-item-requests');host.setAttribute('aria-label','World inventory making requests');
 host.innerHTML='<header class="world-request-heading"><div><span class="world-request-kind">FROM THE WORLD / TO YOUR WORKBENCH</span><h3>World inventory requests</h3><p>Deeds, shops and members call for real items. Accept a request, finish production, then deliver its counted stock through the shipping network.</p></div><button type="button" data-request-refresh>Refresh world calls</button></header><div class="world-request-compose"><div><h4>Fund a making request</h4><p data-request-context></p><p class="world-request-note">Choose the item and receiving address in the World Supply controls. This reward pays the maker after verified delivery; production materials and route costs are separate.</p></div><form data-request-form><label>Whole units<input name="quantity" type="number" min="1" max="100" step="1" value="1" required></label><label>Total reward / MZK<input name="rewardMzk" type="number" min="1" max="1000000" step="1" value="100" required></label><label>Making method<select name="source"><option value="any">Any verified completed item</option><option value="factory">Completed factory production</option><option value="forge">Traditional hand forging</option></select></label><button type="submit" data-request-create>Fund request · 100 MZK escrow</button></form><p data-request-create-reason class="world-request-note"></p></div><div class="world-request-filters"><label>Find an item, maker or place<input type="search" data-request-search placeholder="Lantern, shop, map…"></label><label>Requests<select data-request-scope><option value="all">All world requests</option><option value="mine">My requests & making work</option></select></label><label>Progress<select data-request-phase><option value="active">Active requests</option><option value="open">Awaiting a maker</option><option value="delivered">Receiving stock confirmed</option><option value="all">All records</option></select></label><label>Receiving map<select data-request-map><option value="">All maps</option></select></label></div><p class="world-request-summary" data-request-summary></p><div class="world-request-grid" data-request-list></div><div class="world-request-pagination"><button type="button" data-request-previous>Previous requests</button><span data-request-page></span><button type="button" data-request-next>Next requests</button></div><details class="world-request-ai"><summary>Shop, deed &amp; AI inventory calls</summary><p>These calls describe real inventory needs. A member must fund the MZK reward before a call becomes a making request. Browsing does not create stock, pay rewards or place orders.</p><p class="world-request-summary" data-call-summary></p><div class="world-request-grid" data-ai-call-list></div><div class="world-request-pagination"><button type="button" data-call-previous>Previous stock calls</button><span data-call-page></span><button type="button" data-call-next>Next stock calls</button></div></details><p class="world-request-message" data-request-message role="status" aria-live="polite"></p>';
 const $=selector=>host.querySelector(selector),form=$('[data-request-form]'),pageSize=8,pending=new Map();
 let state=null,busy=false,disposed=false,revision=0,page=0,callPage=0,selectedCall=null,lastContextKey='';
 const message=(text,error=false)=>{const node=$('[data-request-message]');node.textContent=text;node.dataset.error=String(error);if(error)announce(text);};
 const allRequests=()=>records(state?.inventoryRequests||state?.requests);
 const allCalls=()=>records(state?.aiCalls||state?.inventoryCalls);
 const catalog=()=>[...records(state?.catalog),...records(state?.transferCatalog)];
 function context(){return getContext()||{};}
 function renderComposer(){
  const selected=context(),address=selected.address,item=catalog().find(item=>(item.id||item.itemId)===selected.itemId),key=JSON.stringify([selected.itemId,address?.id,selected.quantity]);
  if(selectedCall&&(selectedCall.itemId!==selected.itemId||(selectedCall.address?.id||selectedCall.addressId)!==address?.id))selectedCall=null;
  if(key!==lastContextKey){lastContextKey=key;if(!selectedCall&&Number.isSafeInteger(selected.quantity))form.elements.quantity.value=Math.min(100,Math.max(1,selected.quantity));}
  const canForge=!!forgeRecipe(selected.itemId);form.elements.source.querySelector('[value="forge"]').disabled=!canForge;if(!canForge&&form.elements.source.value==='forge')form.elements.source.value='factory';
  const quantity=Number(form.elements.quantity.value),rewardMzk=Number(form.elements.rewardMzk.value),validQuantity=Number.isSafeInteger(quantity)&&quantity>=1&&quantity<=100,validReward=Number.isSafeInteger(rewardMzk)&&rewardMzk>=1&&rewardMzk<=1000000;
  const reason=!state?.ownerId?'Sign in through Members to fund a making request.':!selected.itemId||!item?'Choose a current item from the shared catalog.':!address?.id?'Choose a verified shop, building or deed receiving address.':address.canOrder===false?'This receiving address is not accepting new orders.':!validQuantity?'Choose 1–100 whole units.':!validReward?'Choose a whole MZK reward from 1 to 1,000,000.':'';
  $('[data-request-context]').textContent=(item?.name||selected.itemId||'No item selected')+' → '+(address?.name||'No receiving address selected')+(address?.mapName?' · '+address.mapName:'');
  $('[data-request-create-reason]').textContent=reason||'Funding locks '+count(rewardMzk)+' MZK once. The current maker receives it only after all requested units are received.';
  $('[data-request-create]').disabled=busy||!!reason;$('[data-request-create]').textContent='Fund request · '+count(rewardMzk)+' MZK escrow';
 }
 function render(){
  if(disposed)return;renderComposer();
  const filters={search:$('[data-request-search]').value,scope:$('[data-request-scope]').value,phase:$('[data-request-phase]').value,mapId:$('[data-request-map]').value},requests=filterWorldItemRequests(allRequests(),filters);
  const maps=new Map([...allCalls().map(call=>({id:call.address?.mapId||call.destinationMapId||call.mapId,name:call.address?.mapName||call.mapName})),...allRequests().map(request=>({id:request.destinationMapId,name:request.address?.mapName}))].filter(map=>map.id).map(map=>[map.id,map.name||map.id]));
  const mapSelect=$('[data-request-map]'),mapValue=mapSelect.value,options='<option value="">All maps</option>'+[...maps].map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
  if(mapSelect.innerHTML!==options){mapSelect.innerHTML=options;if(maps.has(mapValue))mapSelect.value=mapValue;}
  const pages=Math.max(1,Math.ceil(requests.length/pageSize));page=Math.max(0,Math.min(page,pages-1));
  html($('[data-request-list]'),requests.slice(page*pageSize,(page+1)*pageSize).map(request=>worldItemRequestCard(request,{busy,catalog:catalog(),completedOwnedLots:state?.completedOwnedLots})).join('')||'<p class="world-request-empty">No matching making requests. Choose an item and verified receiving address to fund the first one.</p>');
  $('[data-request-summary]').textContent=count(requests.length)+' matching requests · completed items and receiving receipts remain server verified.';
  $('[data-request-page]').textContent=(page+1)+' / '+pages;$('[data-request-previous]').disabled=busy||page===0;$('[data-request-next]').disabled=busy||page>=pages-1;
  const callView=worldItemCallPage(allCalls(),{...filters,page:callPage});callPage=callView.page;
  html($('[data-ai-call-list]'),callView.calls.map(call=>worldItemAICallCard(call,{busy})).join('')||'<p class="world-request-empty">No verified restock calls match this item or receiving map.</p>');
  $('[data-call-summary]').textContent=count(callView.total)+' matching stock calls · use the item / place search and receiving-map filters above.';
  $('[data-call-page]').textContent=(callPage+1)+' / '+callView.pages;$('[data-call-previous]').disabled=busy||callPage===0;$('[data-call-next]').disabled=busy||callPage>=callView.pages-1;
  $('[data-request-refresh]').disabled=busy;
 }
 async function mutate(operation,fields){
  if(disposed||busy)return;busy=true;const generation=revision,key=operation+':'+JSON.stringify(fields);if(!pending.has(key))pending.set(key,crypto.randomUUID());render();
  try{
   const session=await inventory.session();if(disposed||generation!==revision)return;
   const result=await inventory.api('/api/world-supply/request-'+operation,{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify({...fields,requestId:pending.get(key)})});
   if(disposed||generation!==revision)return;pending.delete(key);message(result?.message||({create:'Making request funded. Your MZK reward is held until verified receiving completion.',claim:'Making request accepted. Complete the item before dispatching owned stock.',cancel:'Request cancelled. Any refundable reward returned through the server ledger.',fulfill:'Completed stock committed to its shipping manifest. Receiving confirmation remains pending.'}[operation]));
   signalInventoryChange();await onChanged(result);
  }catch(error){if(!disposed&&generation===revision)message(error.message||'Unable to update the world making request.',true);}
  finally{if(!disposed&&generation===revision){busy=false;render();}}
 }
 form.addEventListener('input',renderComposer);
 form.addEventListener('change',renderComposer);
 form.addEventListener('submit',event=>{
  event.preventDefault();renderComposer();if($('[data-request-create]').disabled)return;
  const selected=context();void mutate('create',{itemId:selected.itemId,addressId:selected.address.id,expectedAddressRevision:selected.address.revision,quantity:Number(form.elements.quantity.value),rewardMzk:Number(form.elements.rewardMzk.value),source:form.elements.source.value,shippingMapId:selected.shippingMapId,contractId:selected.contractId,onwardMode:selected.onwardMode||'road',...(selectedCall?{sourceCallId:selectedCall.id}:{})});
 });
 const invoke=(callback,details)=>{void Promise.resolve().then(()=>callback(details)).catch(error=>{if(!disposed)message(error.message||'Unable to open this request’s next step.',true);});};
 host.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled||disposed)return;
  if(button.hasAttribute('data-request-refresh')){void refresh();return;}
  if(button.hasAttribute('data-request-previous')){page--;render();return;}if(button.hasAttribute('data-request-next')){page++;render();return;}
  if(button.hasAttribute('data-call-previous')){callPage--;render();return;}if(button.hasAttribute('data-call-next')){callPage++;render();return;}
  if(button.dataset.requestAction==='select-call'){
   const call=allCalls().find(call=>call.id===button.dataset.aiCall);if(!call)return;
   const generation=revision;try{await onSelectCall(call);if(disposed||generation!==revision)return;selectedCall=call;form.elements.quantity.value=Math.max(1,Math.min(100,units(call.quantity||call.suggestedQuantity)||1));if(call.source)form.elements.source.value=call.source;renderComposer();form.scrollIntoView({block:'center'});form.elements.rewardMzk.focus({preventScroll:true});message('Review the selected call and reward. It becomes a paid request only when you fund it.');}catch(error){if(!disposed&&generation===revision)message(error.message||'Unable to select this restock call.',true);}return;
  }
  const request=allRequests().find(request=>request.id===button.dataset.inventoryRequest),action=button.dataset.requestAction;if(!request)return;
  const selected=context(),details={...request,inventoryRequestId:request.id},view=worldItemRequestView(request);
  if(action==='claim'&&view.canClaim)void mutate('claim',{inventoryRequestId:request.id});
  else if(action==='cancel'&&view.canCancel)void mutate('cancel',{inventoryRequestId:request.id});
  else if(action==='fulfill'&&view.canFulfill){const available=completedStock(request,state?.completedOwnedLots),quantity=Math.min(view.fulfillableQuantity,available??view.fulfillableQuantity);if(quantity>0)void mutate('fulfill',{inventoryRequestId:request.id,quantity,shippingMapId:selected.shippingMapId,contractId:selected.contractId,onwardMode:selected.onwardMode||'road'});}
  else if(action==='factory'&&view.canMake&&request.source!=='forge')invoke(onFactory,details);
  else if(action==='forge'&&view.canMake&&view.recipe&&request.source!=='factory')invoke(onForge,{...details,recipeId:view.recipe.id,buildAssetId:view.recipe.buildAssetId});
  else if(action==='shipping')invoke(onShipping,details);
  else if(action==='trace'&&view.reference)invoke(onTrace,{...view.reference,inventoryRequestId:request.id,itemId:request.itemId,sourceMapId:'factory',section:'trace'});
 });
 for(const selector of ['[data-request-search]','[data-request-scope]','[data-request-phase]','[data-request-map]'])$(selector).addEventListener(selector.includes('search')?'input':'change',()=>{page=0;callPage=0;render();});
 async function refresh(){if(disposed)return;try{await onChanged();if(!disposed)message('World making requests refreshed.');}catch(error){if(!disposed)message(error.message||'Unable to refresh world making requests.',true);}}
 render();
 return {update(data){if(disposed)return;const ownerChanged=state?.ownerId&&state.ownerId!==data?.ownerId;if(ownerChanged){revision++;busy=false;pending.clear();selectedCall=null;}state=data||null;render();},syncContext(){if(!disposed)renderComposer();},refresh,reset(){revision++;state=null;busy=false;pending.clear();selectedCall=null;page=0;callPage=0;lastContextKey='';message('');render();},dispose(){if(disposed)return;disposed=true;revision++;pending.clear();host.replaceChildren();}};
}
