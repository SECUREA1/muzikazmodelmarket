import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../builder-market.js', import.meta.url), 'utf8');
const catalog = JSON.parse(await readFile(new URL('../public/models/backpack-assets.json', import.meta.url), 'utf8'));
function harness(fetchCatalog = async () => ({ok:true,json:async()=>catalog})) {
  const nodes = new Map();
  const get = selector => { if (!nodes.has(selector)) nodes.set(selector, {textContent:'',innerHTML:'',value:'',classList:{toggle(){}},append(control){this.controls.push(control);},controls:[],querySelectorAll(){return this.controls;}}); return nodes.get(selector); };
  const context = vm.createContext({document:{querySelector:get,createElement:()=>({dataset:{}})},localStorage:{getItem:()=>JSON.stringify([{id:'sofa'}])},fetch:fetchCatalog,window:{},marketItemPreview:()=>'',hydrateMarketPreviews:()=>{},console,URLSearchParams,location:{search:''}});
  let definitions=source.slice(source.indexOf('  const categories'),source.indexOf("  document.addEventListener('click'"));
  vm.runInContext(definitions+'\nglobalThis.pack={loadCompletePack,renderBuilderPack,refresh,readTray};',context);
  return {context,get,pack:context.pack};
}
test('complete catalog populates every model, layout and filter and preserves selected tray state',async()=>{
  const {get,pack}=harness(); await pack.loadCompletePack();
  const models=catalog.assets.filter(item=>item.buildAssetId),layouts=catalog.assets.filter(item=>item.builderLayoutId);
  assert.equal((get('#builder-model-grid').innerHTML.match(/data-builder-model=/g)||[]).length,models.length);
  for(const item of models)assert.ok(get('#builder-model-grid').innerHTML.includes(`data-builder-model="${item.buildAssetId}"`));
  assert.equal((get('#room-style-grid').innerHTML.match(/data-room-style=/g)||[]).length,layouts.length-1);
  assert.match(get('#builder-model-grid').innerHTML,/class="builder-model selected" aria-pressed="true" data-builder-model="sofa"/);
  for(const category of new Set(models.map(item=>item.builderCategory))){pack.renderBuilderPack(category);assert.equal((get('#builder-model-grid').innerHTML.match(/data-builder-model=/g)||[]).length,models.filter(item=>item.builderCategory===category).length);}
});
test('catalog failure keeps core pack usable and reports incomplete loading',async()=>{
  const {get,pack}=harness(async()=>{throw Error('Offline');});pack.renderBuilderPack();await pack.loadCompletePack();
  assert.equal((get('#builder-model-grid').innerHTML.match(/data-builder-model=/g)||[]).length,21);
  assert.match(get('#builder-pack-status').textContent,/Offline.*Reload to retry/);
});

test('one failed account section does not suppress successful market listings', async()=>{
  const {context,get,pack}=harness();
  context.window.MUZIKAZ_API={fetch:async path=>({ok:path.includes('/market?'),json:async()=>path.includes('/market?')?{data:[{asset:{id:'asset',name:'Available asset',builder_category:'PROPS',version:'1'},asset_id:'asset',listing_id:'listing',price_mzk:10}]}:{message:'Account unavailable'}})};
  await pack.refresh();
  assert.match(get('#builder-listings').innerHTML,/Available asset/);
  assert.match(get('#builder-assets').innerHTML,/Unable to load/);
  assert.match(get('#builder-worlds').innerHTML,/Unable to load/);
});
