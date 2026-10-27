import {marketItemPreview,hydrateMarketPreviews,releaseMarketPreviews} from './market-item-preview.js';
import {mountMarketPreviewTuner} from './market-preview-tuner.js';
import {catalogSupplyLabel} from './catalog-supply.js';
import {buildingCatalogCategories,BUILDING_CATALOG_FUNCTIONS,matchesBuildingCatalogItem} from './in-game-building-catalog.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const owned=asset=>asset.owned===true||asset.basic===true;
const number=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const readable=value=>String(value||'').replace(/[-_]/g,' ');
const PAGE_SIZE=12;
const QUICK_CATEGORIES=[['all','All'],['materials','Materials'],['seats','Seats'],['interior','Furniture'],['vehicles','Vehicles'],['tools','Tools']];
const quickCategoryIds=new Set(QUICK_CATEGORIES.map(([id])=>id));
function itemFacts(asset){
 const facts=[],dimensions=asset.dimensions;
 if(Array.isArray(dimensions)&&dimensions.length===3&&dimensions.every(value=>number(value)>0))facts.push(['Dimensions',dimensions.map(value=>Number(Number(value).toFixed(2))).join(' × ')+' m']);
 else if(typeof asset.scale==='string')facts.push(['Scale',asset.scale]);
 const placement=number(asset.unitPriceMzk??asset.useCostMzk),price=number(asset.priceMzk),stock=number(asset.stock);
 if(placement!==null)facts.push(['Placement',placement===0?'Included':placement+(asset.toolId?' MZK / use':' MZK / drop')]);
 if(stock!==null)facts.push(['Stock',stock+' prepaid pieces']);
 const supply=catalogSupplyLabel(asset);if(supply)facts.push(['Supply',supply]);
 if(!owned(asset)&&price!==null)facts.push(['Unlock',price+' MZK']);
 return facts;
}
function functionFacts(asset){
 const config=asset.function_data||{},facts=[['Behavior',readable(asset.behavior||config.behavior||'decor')]];
 if(asset.action&&asset.action!=='none')facts.push(['Action',readable(asset.action)]);
 if(config.prompt)facts.push(['Interaction',config.prompt]);
 if(config.interactionKey)facts.push(['Key',String(config.interactionKey).toUpperCase()]);
 if(asset.vehicleSettings?.mode)facts.push(['Vehicle',readable(asset.vehicleSettings.mode)]);
 if(asset.animationState?.clip||asset.animation)facts.push(['Animation',readable(asset.animationState?.clip||asset.animation)]);
 if(asset.questSettings?.title)facts.push(['Quest',asset.questSettings.title]);
 return facts;
}
// Selection only changes the preview. Placement and tray buttons retain the
// game's delegated ownership, purchase, and multiplayer authorization checks.
export function mountBuildAssetBrowser(root,{assets=[],tray=[],previous={},category='all'}){
 if(!document.querySelector('[data-in-game-building-catalog-style]')){const link=document.createElement('link');link.rel='stylesheet';link.dataset.inGameBuildingCatalogStyle='';link.href=new URL('../assets/in-game-building-catalog.css',import.meta.url).href;document.head.append(link);}
 root.classList.add('in-game-building-catalog');
 const categories=buildingCatalogCategories(assets),selectedTray=new Set(tray.map(item=>item.id)),nativeCount=assets.filter(item=>!item.catalogSource||item.catalogSource==='native').length,glbCount=assets.filter(item=>item.catalogSource==='glb').length,toolCount=assets.filter(item=>item.catalogSource==='tool').length;
 const options=entries=>entries.map(item=>`<option value="${escape(item.id)}">${escape(item.label)}${item.count!==undefined?' · '+item.count:''}</option>`).join('');
 root.innerHTML=`<div class="build-catalog-toolbar"><label class="build-asset-search"><span class="build-search-label">Find an item</span><input type="search" data-build-search placeholder="Search all ${assets.length} items…" autocomplete="off"></label><button type="button" class="build-owned-toggle" data-build-owned-toggle aria-pressed="false"><span aria-hidden="true">✓</span> Owned</button><button type="button" class="build-filter-reset" data-build-reset>Reset</button><div class="build-quick-categories" role="group" aria-label="Quick item categories">${QUICK_CATEGORIES.filter(([id])=>categories.some(category=>category.id===id)).map(([id,label])=>`<button type="button" data-build-quick-category="${id}" aria-pressed="false"><span>${label}</span><small>${categories.find(category=>category.id===id).count}</small></button>`).join('')}</div><details class="build-more-filters" data-build-more-filters><summary>More filters <span data-build-active-filters hidden></span></summary><div class="build-advanced-filters"><label>Category<select data-build-category>${options(categories)}</select></label><label>Availability<select data-build-ownership><option value="all">All items</option><option value="owned">Owned & basic</option><option value="locked">Available to unlock</option></select></label><label>Model source<select data-build-source><option value="all">All sources</option><option value="native">Native items</option><option value="glb">GLB models</option><option value="tool">Tools</option></select></label><label>Function<select data-build-function>${options(BUILDING_CATALOG_FUNCTIONS)}</select></label></div></details></div><div class="build-catalog-result-line"><p data-build-results role="status" aria-live="polite"></p><div class="build-catalog-summary"><span>${nativeCount} native</span><span>${glbCount} GLB</span><span>${toolCount} tools</span></div></div><section class="build-catalog-empty" data-build-empty hidden><strong>No matching items</strong><p>Try a different name, category or function.</p><button type="button" data-build-reset>Show all items</button></section><div class="build-catalog-layout" data-build-layout><section class="build-catalog-collection" aria-label="Building item library"><div class="build-catalog-grid" data-build-items></div><nav class="build-catalog-pager" aria-label="Building item pages"><button type="button" data-build-previous aria-label="Previous building item page">← Previous</button><output data-build-page></output><button type="button" data-build-next aria-label="Next building item page">Next →</button></nav></section><aside class="build-catalog-inspector" data-build-inspector aria-label="Selected building item"></aside></div>`;
 const search=root.querySelector('[data-build-search]'),availability=root.querySelector('[data-build-ownership]'),categorySelect=root.querySelector('[data-build-category]'),source=root.querySelector('[data-build-source]'),functionSelect=root.querySelector('[data-build-function]'),items=root.querySelector('[data-build-items]'),inspector=root.querySelector('[data-build-inspector]'),moreFilters=root.querySelector('[data-build-more-filters]');
 let selectedId=previous.selectedId||'',page=Math.max(0,Number(previous.page)||0),filtered=[],tuner=null,disposed=false;
 const setValue=(control,value,fallback='all')=>control.value=[...control.options].some(option=>option.value===value)?value:fallback;
 search.value=previous.query||'';setValue(availability,previous.ownership);setValue(categorySelect,previous.category??category);setValue(source,previous.source);setValue(functionSelect,previous.functionId);
 function activeAdvancedCount(){return Number(source.value!=='all')+Number(functionSelect.value!=='all')+Number(availability.value==='locked')+Number(!quickCategoryIds.has(categorySelect.value));}
 moreFilters.open=activeAdvancedCount()>0;
 function syncQuickFilters(){
  root.querySelector('[data-build-owned-toggle]').setAttribute('aria-pressed',String(availability.value==='owned'));
  for(const button of root.querySelectorAll('[data-build-quick-category]'))button.setAttribute('aria-pressed',String(button.dataset.buildQuickCategory===categorySelect.value));
  const count=activeAdvancedCount(),badge=root.querySelector('[data-build-active-filters]');badge.hidden=count===0;badge.textContent=count+' active';
 }
 function inspect(asset){
  tuner?.dispose();tuner=null;releaseMarketPreviews(inspector);
  if(!asset){inspector.replaceChildren();return;}
  const available=owned(asset),isTool=Boolean(asset.toolId),isJersey=Boolean(asset.basketballTeam),isEquipment=isTool||isJersey,sku=asset.economySku||asset.sku,guard=sku?` data-economy-sku="${escape(sku)}"`:'',facts=itemFacts(asset),functions=functionFacts(asset),added=selectedTray.has(asset.id);
  const actions=`<div class="game-market-actions"><button type="button" class="build-native-place" data-place-build-asset="${escape(asset.id)}"${guard}${available?'':sku?'':' disabled'}>${available?isTool?'Equip tool':isJersey?'Equip jersey':'Place in world':sku?isEquipment?'Unlock to equip':'Unlock to place':'Unavailable'}</button>${isTool||!available?'':`<button type="button" data-build-asset="${escape(asset.id)}"${guard} aria-pressed="${added}"${!available&&!sku?' disabled':''}>${added?'Remove from build inventory':available?'Add to build inventory':'Unlock item'}</button>`}</div>`;
  const hint=isTool?available?'Equip this tool to use it in the current world.':'Unlock this tool to equip it from your kit.':isJersey?available?'Equip this jersey on your player to join its basketball team.':'Unlock this jersey to equip it on your player.':available?'Aim, then tap to place. Placement settings: rotate, size & snap.':'Unlock to place this item in your world.';
  inspector.innerHTML=`<article data-build-row data-build-id="${escape(asset.id)}" class="is-build-selected"><p class="build-native-category">${escape(asset.catalogCategoryLabel||asset.categoryLabel||asset.category)} · ${asset.catalogSource==='glb'?'GLB model':isTool?'Equipment':'Native model'}</p><h3>${escape(asset.name)}</h3>${marketItemPreview(asset,{preferModel:true})}<span class="build-native-availability" data-owned="${available}">${asset.basic?'Basic · included':available?isEquipment?'Owned · ready to equip':'Owned · ready to place':'Available to unlock'}</span>${actions}<p class="build-placement-hint">${hint}</p><details class="build-item-details" data-build-item-details${matchMedia('(min-width:571px) and (min-height:501px)').matches?' open':''}><summary>Details & functions</summary><div class="build-native-copy"><p>${escape(asset.catalogDescription||asset.description||'Place and configure this item in your world.')}</p>${facts.length?`<dl class="build-item-facts">${facts.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`:''}<section class="build-item-functions" aria-label="Item functions"><h4>Item functions</h4><dl>${functions.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl></section></div></details></article>`;
  tuner=mountMarketPreviewTuner(inspector,asset);
  const previewControls=inspector.querySelector('.market-preview-tuning');
  if(previewControls)inspector.querySelector('.build-native-copy').before(previewControls);
  hydrateMarketPreviews(inspector);
 }
 function select(id){
  const asset=filtered.find(item=>item.id===id);if(!asset)return;selectedId=id;
  for(const card of items.querySelectorAll('[data-build-select]'))card.setAttribute('aria-pressed',String(card.dataset.buildSelect===id));
  for(const card of items.querySelectorAll('[data-build-card]'))card.classList.toggle('is-build-selected',card.dataset.buildCard===id);
  inspect(asset);if(matchMedia('(max-width:570px)').matches)inspector.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
 }
 function render({filtersChanged=false}={}){
  if(disposed)return;
  syncQuickFilters();
  if(filtersChanged)page=0;
  filtered=assets.filter(asset=>matchesBuildingCatalogItem(asset,categorySelect.value,search.value,{source:source.value,functionId:functionSelect.value})&&(availability.value==='all'||availability.value==='owned'&&owned(asset)||availability.value==='locked'&&!owned(asset)));
  const pageCount=Math.ceil(filtered.length/PAGE_SIZE);page=Math.max(0,Math.min(page,Math.max(0,pageCount-1)));
  if(!filtered.some(asset=>asset.id===selectedId))selectedId=filtered[0]?.id||'';
  const start=page*PAGE_SIZE,pageItems=filtered.slice(start,start+PAGE_SIZE);
  if(pageItems.length&&!pageItems.some(asset=>asset.id===selectedId))selectedId=pageItems[0].id;
  root.querySelector('[data-build-results]').textContent=`${filtered.length} of ${assets.length} building items`;
  root.querySelector('[data-build-empty]').hidden=filtered.length!==0;root.querySelector('[data-build-layout]').hidden=filtered.length===0;
  releaseMarketPreviews(items);items.innerHTML=pageItems.map(asset=>`<article class="build-catalog-card${asset.id===selectedId?' is-build-selected':''}" data-build-card="${escape(asset.id)}">${marketItemPreview(asset,{preferModel:true})}<button type="button" data-build-select="${escape(asset.id)}" aria-pressed="${asset.id===selectedId}" aria-label="Preview ${escape(asset.name)}"><strong>${escape(asset.name)}</strong><span>${escape(asset.catalogCategoryLabel||asset.categoryLabel||asset.category)} · ${asset.catalogSource==='glb'?'GLB':asset.toolId?'Tool':'Native'}</span><small>${asset.basic?'Basic · included':owned(asset)?'Owned':'Locked'}</small>${catalogSupplyLabel(asset)?'<small>'+escape(catalogSupplyLabel(asset))+'</small>':''}</button></article>`).join('');
  root.querySelector('[data-build-page]').textContent=pageCount?`${start+1}–${Math.min(start+PAGE_SIZE,filtered.length)} · Page ${page+1} / ${pageCount}`:'0 items';
  root.querySelector('[data-build-previous]').disabled=page===0;root.querySelector('[data-build-next]').disabled=page>=pageCount-1;
  inspect(filtered.find(asset=>asset.id===selectedId));hydrateMarketPreviews(items);
 }
 function onClick(event){
  const reset=event.target.closest('[data-build-reset]');if(reset){search.value='';for(const control of [availability,categorySelect,source,functionSelect])control.value='all';moreFilters.open=false;render({filtersChanged:true});search.focus();return;}
  const quick=event.target.closest('[data-build-quick-category]');if(quick){categorySelect.value=quick.dataset.buildQuickCategory;search.value='';source.value='all';functionSelect.value='all';if(!activeAdvancedCount())moreFilters.open=false;render({filtersChanged:true});return;}
  if(event.target.closest('[data-build-owned-toggle]')){availability.value=availability.value==='owned'?'all':'owned';render({filtersChanged:true});return;}
  if(event.target.closest('[data-build-previous]')){page--;render();return;}if(event.target.closest('[data-build-next]')){page++;render();return;}
  const card=event.target.closest('[data-build-card]');if(card&&!event.target.closest('a,input,select,details,.device-demo'))select(card.dataset.buildCard);
 }
 root.addEventListener('click',onClick);
 const filter=()=>render({filtersChanged:true});search.addEventListener('input',filter);for(const control of [availability,categorySelect,source,functionSelect])control.addEventListener('change',filter);
 render();
 return {state(){return {query:search.value,ownership:availability.value,category:categorySelect.value,source:source.value,functionId:functionSelect.value,selectedId,page};},dispose(){disposed=true;tuner?.dispose();releaseMarketPreviews(root);root.removeEventListener('click',onClick);search.removeEventListener('input',filter);for(const control of [availability,categorySelect,source,functionSelect])control.removeEventListener('change',filter);}};
}
