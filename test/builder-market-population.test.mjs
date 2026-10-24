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
  vm.runInContext(definitions+'\nglobalThis.pack={loadCompletePack,renderBuilderPack,refresh,readTray,loadNativeCatalog,renderNativeCatalog};',context);
  return {context,get,pack:context.pack};
}
test('complete catalog populates every model, layout and filter and preserves selected tray state',async()=>{
  const {get,pack}=harness(); await pack.loadCompletePack();
  const models=catalog.assets.filter(item=>item.buildAssetId),layouts=catalog.assets.filter(item=>item.builderLayoutId);
  assert.equal((get('#builder-model-grid').innerHTML.match(/data-builder-model=/g)||[]).length,models.length);
  for(const item of models)assert.ok(get('#builder-model-grid').innerHTML.includes(`data-builder-model="${item.buildAssetId}"`));
  assert.equal((get('#room-style-grid').innerHTML.match(/data-room-style=/g)||[]).length,layouts.length-1);
  assert.match(get('#builder-model-grid').innerHTML,/class="builder-model selected" aria-pressed="true" data-builder-model="sofa"/);
  const categoryOf = item => item.builderCategory || item.type || 'props';
  for(const category of new Set(models.map(categoryOf))){pack.renderBuilderPack(category);assert.equal((get('#builder-model-grid').innerHTML.match(/data-builder-model=/g)||[]).length,models.filter(item=>categoryOf(item)===category).length);}
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

test('native catalog browses without an account and exposes canonical functions, maps and template components', async()=>{
  const {context,get,pack}=harness();
  const items=[
    {id:'upgrade:backpack:lift',sku:'backpack:lift',source:'upgrade',native:true,name:'Working Lift',category:'Builder furniture',nativeFunction:'elevator',nativeMaps:[{id:'tower',name:'Office Tower',count:2}],priceMzk:350},
    {id:'map:tower',source:'native-map',name:'Office Tower',category:'Map templates',basic:true,builderUrl:'environment-builder.html?layout=repository-tower',visitUrl:'model-explorer.html?environment=tower',itemCount:2,components:[{name:'Working Lift',count:2,sku:'backpack:lift'}]},
    {id:'model:private',source:'model',name:'Repository model'},
    {id:'upgrade:repository:a',sku:'repository:a',source:'upgrade',name:'Repository model'},
    {id:'player:sale',source:'player',name:'Member sale'}
  ];
  const requests=[];
  context.window.MUZIKAZ_API={fetch:async path=>{requests.push(path);return {ok:true,json:async()=>({data:items})};}};
  await pack.loadNativeCatalog();
  assert.deepEqual(requests,['/api/market/catalog']);
  assert.match(get('#builder-native-status').textContent,/2 of 2 native items/);
  const html=get('#builder-native-items').innerHTML;
  assert.match(html,/Functions: elevator/);
  assert.match(html,/Maps: Office Tower/);
  assert.match(html,/data-native-open="backpack:lift"/);
  assert.match(html,/2 map pieces · 1 item types/);
  assert.match(html,/Working Lift × 2/);
  assert.match(html,/href="environment-builder.html\?layout=repository-tower"/);
  assert.doesNotMatch(html,/Member sale|Repository model/);
  get('#builder-native-search').value='elevator';pack.renderNativeCatalog();
  assert.match(get('#builder-native-status').textContent,/1 of 2/);
  get('#builder-native-search').value='Office Tower';get('#builder-native-category').value='Builder furniture';pack.renderNativeCatalog();
  assert.match(get('#builder-native-status').textContent,/1 of 2/);
});

test('large native catalogs remain browsable with filters and bounded initial previews', async()=>{
  const {context,get,pack}=harness();
  const items=Array.from({length:45},(_,index)=>({source:'upgrade',native:true,sku:'native:'+index,name:'Native item '+index,category:index===44?'Unique':'Props',priceMzk:50}));
  context.window.MUZIKAZ_API={fetch:async()=>({ok:true,json:async()=>({data:items})})};
  await pack.loadNativeCatalog();
  assert.equal((get('#builder-native-items').innerHTML.match(/<article /g)||[]).length,36);
  assert.equal(get('#builder-native-more').hidden,false);
  get('#builder-native-category').value='Unique';pack.renderNativeCatalog();
  assert.equal((get('#builder-native-items').innerHTML.match(/<article /g)||[]).length,1);
  assert.equal(get('#builder-native-more').hidden,true);
  assert.match(get('#builder-native-items').innerHTML,/Native item 44/);
});
