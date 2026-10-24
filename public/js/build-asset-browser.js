import {organizeMarketWorkspace,releaseMarketWorkspacePreview} from './market-workspace.js';
import {marketItemPreview,hydrateMarketPreviews} from './market-item-preview.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const owned=asset=>asset.owned===true||asset.basic===true;
const number=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
function itemFacts(asset){
 const facts=[],dimensions=asset.dimensions;
 if(Array.isArray(dimensions)&&dimensions.length===3&&dimensions.every(value=>number(value)>0))facts.push(dimensions.map(value=>Number(Number(value).toFixed(2))).join(' × ')+' m');
 else if(asset.scale)facts.push(asset.scale);
 const placement=number(asset.unitPriceMzk??asset.useCostMzk),price=number(asset.priceMzk),stock=number(asset.stock);
 if(placement!==null)facts.push(placement+' MZK / placement');
 if(stock!==null)facts.push(stock+' prepaid pieces');
 if(!owned(asset)&&price!==null)facts.push(price+' MZK to unlock');
 return facts;
}
function itemSearch(asset){return [asset.name,asset.description,asset.category,asset.categoryLabel,asset.behavior,asset.action,asset.function_data?.behavior,asset.function_data?.action,asset.searchTerms,asset.tags?.join?.(' '),asset.keywords?.join?.(' '),asset.id].filter(Boolean).join(' ').toLowerCase();}
// Browsing selects a preview; the original build-inventory button keeps its
// delegated ownership and purchase checks in the game engine.
export function mountBuildAssetBrowser(root,{assets,tray=[],previous={}}){
 if(!document.querySelector('[data-in-game-building-catalog-style]')){const link=document.createElement('link');link.rel='stylesheet';link.dataset.inGameBuildingCatalogStyle='';link.href=new URL('../assets/in-game-building-catalog.css',import.meta.url).href;document.head.append(link);}
 root.classList.add('in-game-building-catalog');
 root.innerHTML='<div class="build-catalog-toolbar"><label class="build-asset-search">Find a building item<input type="search" data-build-search placeholder="Search names, categories and uses" autocomplete="off"></label><label>Show items<select data-build-ownership aria-label="Building item availability"><option value="all">All native items</option><option value="owned">Owned & basic items</option></select></label></div><p data-build-results role="status"></p><p data-build-empty hidden>No native items match. Try another search or show all items.</p><section data-build-items></section>';
 const items=root.querySelector('[data-build-items]'),search=root.querySelector('[data-build-search]'),availability=root.querySelector('[data-build-ownership]'),selected=new Set(tray.map(item=>item.id)),searchIndex=assets.map(itemSearch);
 items.innerHTML=assets.map(asset=>{
  const available=owned(asset),sku=asset.economySku||asset.sku,guard=sku?` data-economy-sku="${escape(sku)}"`:'',facts=itemFacts(asset),behavior=asset.behavior||asset.function_data?.behavior||'decor',role=behavior==='decor'?'Placeable object':String(behavior).replace(/-/g,' ');
  return `<article data-build-row data-build-id="${escape(asset.id)}">${marketItemPreview(asset)}<div class="build-native-copy"><p class="build-native-category">${escape(asset.categoryLabel||asset.category)} · ${escape(role)}</p><h3>${escape(asset.name)}</h3><p>${escape(asset.description||'A reusable native item for your world.')}</p><span class="build-native-availability" data-owned="${available}">${asset.basic?'Basic · included':available?'Owned':'Available in Marketplace'}</span>${facts.length?`<p class="build-native-facts">${facts.map(escape).join(' · ')}</p>`:''}</div><div class="game-market-actions"><button type="button" data-build-asset="${escape(asset.id)}"${guard} aria-pressed="${selected.has(asset.id)}">${selected.has(asset.id)?'Remove from build inventory':'Add to build inventory'}</button><button type="button" class="build-native-place" data-place-build-asset="${escape(asset.id)}"${guard}${available?'':' disabled'}>${available?'Place in world':'Unlock to place'}</button></div></article>`;
 }).join('');
 const rows=[...items.querySelectorAll('[data-build-row]')];
 function render(){const words=search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);let count=0;rows.forEach((row,index)=>{row.hidden=(availability.value==='owned'&&!owned(assets[index]))||!words.every(word=>searchIndex[index].includes(word));if(!row.hidden)count++;});root.querySelector('[data-build-results]').textContent=count+' of '+assets.length+' native building items';root.querySelector('[data-build-empty]').hidden=count!==0;organizeMarketWorkspace(items,{rowSelector:'[data-build-row]',records:assets});hydrateMarketPreviews(items);}
 search.value=previous.query||'';availability.value=previous.ownership==='owned'?'owned':'all';search.addEventListener('input',render);availability.addEventListener('change',render);render();const visible=rows.filter(row=>!row.hidden),index=visible.findIndex(row=>row.dataset.buildId===previous.selectedId);if(index>=0)items.querySelectorAll('.market-workspace-item')[index]?.click();if(previous.view==='tiles')items.querySelectorAll('.market-workspace-views button')[1]?.click();
 return {state(){return {query:search.value,ownership:availability.value,selectedId:items.querySelector('.is-market-selected')?.dataset.buildId,view:items.querySelector('.market-workspace')?.dataset.itemView};},dispose(){releaseMarketWorkspacePreview(items);}};
}
