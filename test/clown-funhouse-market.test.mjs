import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {FUNHOUSE_ITEMS} from '../public/js/clown-funhouse-items.js';
import {FUNHOUSE_ID,funhouseStations} from '../public/js/clown-funhouse-config.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {editableMapScene} from '../public/js/editable-map-import.js';
import {nativeMarketCatalog} from '../native-market-catalog.mjs';
import {filterMainMarket,mainMarketEntries} from '../public/js/main-market-filters.js';
import {marketFacets} from '../public/js/market-facets.js';
import {FUNHOUSE_COMPONENT_PLACEMENTS} from '../public/js/clown-funhouse-builder.js';

const ids=Object.keys(FUNHOUSE_ITEMS),byModel=new Map(GAME_ECONOMY.map(item=>[item.buildAssetId,item]));
const manifest=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
const world=manifest.find(map=>map.id===FUNHOUSE_ID);
function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});for(const resource of resources)resource.dispose();}

test('every funhouse assembly, character, costume and water blaster has an individual canonical market item and real model',()=>{
 assert.equal(ids.length,28,'include the full carnival assembly library and five clown characters');
 assert.equal(ids.filter(id=>FUNHOUSE_ITEMS[id].type==='avatar').length,5);
 assert.equal(ids.filter(id=>FUNHOUSE_ITEMS[id].type==='wearable').length,2);
 for(const id of ids){
  const native=NATIVE_BUILDER_ITEMS[id],item=byModel.get(id),authored=FUNHOUSE_ITEMS[id];
  assert.ok(native,id+' is in the Builder item library');assert.ok(item,id+' has an economy offer');
  assert.equal(item.sku,'native:'+id);assert.equal(item.native,true);assert.equal(item.assetType,authored.type);
  assert.equal(item.priceMzk,authored.priceMzk,id+' retains its advertised price');
  assert.deepEqual(item.function_data,native.function_data);assert.equal(item.function_data.damage,0);
  assert.equal(item.function_data.funhouseItem,id);
  assert.equal(marketFacets(item).category,'funhouse',id+' appears in the themed market filter');
  for(const reference of [{sku:item.sku},{economySku:item.sku},{id:'economy:'+item.sku}])assert.equal(marketFacets(reference).category,'funhouse',id+' also classifies through its canonical inventory reference');
  if(authored.type==='avatar')assert.ok(marketFacets(item).uses.includes('avatar'));
  if(authored.type==='wearable')assert.ok(marketFacets(item).uses.includes('wear'));
  const model=createBuilderModel(id);assert.ok(model,id+' has a procedural factory');
  try{
   let vertices=0,meshes=0;model.traverse(node=>{if(node.isMesh){meshes++;vertices+=node.geometry.attributes.position?.count||0;}});
   const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
   assert.ok(meshes>=1&&vertices>12,id+' renders real geometry');
   assert.ok(!bounds.isEmpty()&&[...bounds.min,...bounds.max].every(Number.isFinite),id+' has finite bounds');
   assert.ok(size.x>0&&size.y>0&&size.z>0,id+' is a dimensional model');
   if(authored.type==='avatar')assert.ok(Math.abs(size.y-1.8)<.05,id+' is normalized for player selection');
  }finally{dispose(model);}
 }
 assert.equal(filterMainMarket(mainMarketEntries(GAME_ECONOMY.map(item=>({...item,source:'upgrade'}))),{source:'upgrade',category:'funhouse'}).length,ids.length);
});

test('the public funhouse map, its component purchases and editable template are linked in both market directions',()=>{
 assert.ok(world?.permanent&&world.publicDestination&&world.playable);
 const {items,maps}=nativeMarketCatalog(GAME_ECONOMY,manifest.map(map=>({...map,source:'repository'}))),map=maps.find(map=>map.worldId===FUNHOUSE_ID);
 assert.ok(map&&!map.geometryOnly);assert.ok(map.itemCount>0);assert.equal(map.components.reduce((sum,part)=>sum+part.count,0),map.itemCount);
 assert.match(map.visitUrl,/environment=muzikaz-clown-funhouse/);assert.match(map.builderUrl,/layout=repository-muzikaz-clown-funhouse/);
 for(const id of ids){
  const component=map.components.find(part=>part.buildAssetId===id),item=items.find(item=>item.buildAssetId===id);
  assert.ok(component?.count>0,id+' is discoverable in the funhouse bill of materials');
  assert.equal(component.sku,item.sku);
  assert.ok(item.nativeMaps.some(map=>map.id===FUNHOUSE_ID&&map.count===component.count),id+' links back to the map');
 }
 const entries=mainMarketEntries(items.map(item=>({...item,source:'upgrade'})).concat(maps));
 assert.equal(filterMainMarket(entries,{source:'native',query:'Midnight Laughs Funhouse'}).filter(entry=>ids.includes(entry.item.buildAssetId)).length,ids.length);
 const before=JSON.stringify(world),copy=editableMapScene(world);
 const placed=FUNHOUSE_COMPONENT_PLACEMENTS.filter(part=>!part.includedIn&&part.modelId!=='funhouse-midway-floor');
 assert.equal(copy.objects.length,placed.length);assert.equal(new Set(copy.objects.map(object=>object.id)).size,copy.objects.length);
 assert.deepEqual(new Set(copy.objects.map(object=>object.id)),new Set(placed.map(part=>part.id)),'every top-level assembly retains one editable placement');
 for(const part of FUNHOUSE_COMPONENT_PLACEMENTS.filter(part=>part.includedIn))assert.equal(copy.objects.filter(object=>object.id===part.id).length,0,part.id+' is already rendered by its parent assembly');
 assert.equal(copy.objects.filter(object=>object.modelId==='funhouse-midway-floor').length,0,'the fixed foundation is not duplicated as a placed item');
 copy.objects[0].position.x+=5;assert.equal(JSON.stringify(world),before,'editing a draft never modifies the permanent map');
});

async function freePort(){const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const {port}=server.address();await new Promise(resolve=>server.close(resolve));return port;}
test('every funhouse offer purchases through the real account flow, survives replay in Backpack and rejects unowned room deployment',{timeout:90000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'funhouse-market-')),port=await freePort(),base='http://127.0.0.1:'+port;let stderr='';
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),MUZIKAZ_DATA_DIR:directory,MUZIKAZ_USER_DATABASE_FILE:join(directory,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(directory,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(directory,'payments.json'),MUZIKAZ_CUSTOM_MAPS_FILE:join(directory,'custom-maps.json'),MUZIKAZ_ENVIRONMENT_DATA_FILE:join(directory,'environments.json')},stdio:['ignore','ignore','pipe']});
 child.stderr.on('data',data=>{stderr=(stderr+data).slice(-8000);});
 t.after(async()=>{if(child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}await rm(directory,{recursive:true,force:true});});
 let ready=false;for(let attempt=0;attempt<160;attempt++){if(child.exitCode!==null)throw Error(stderr);try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,50));}assert.ok(ready,stderr);
 async function request(path,{headers={},body}={}){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return {response,...await response.json()};}
 const catalog=await request('/api/market/catalog');assert.equal(catalog.response.status,200);
 const offers=catalog.data.filter(item=>item.source==='upgrade'&&ids.includes(item.buildAssetId));assert.equal(offers.length,ids.length);
 assert.ok(catalog.data.some(item=>item.source==='native-map'&&item.worldId===FUNHOUSE_ID&&item.components.length>=ids.length));
 const buyers=[];let buyer;
 async function login(){const result=await request('/api/access/free-play',{body:{username:'FunMarket'+buyers.length,password:'funhouse-market-test-password'}});assert.equal(result.response.status,200,result.message);const cookie=result.response.headers.get('set-cookie').split(';')[0],headers={Cookie:cookie,'X-CSRF-Token':result.data.csrfToken},state=(await request('/api/economy',{headers})).data;const record={headers,balance:state.balance,spent:0,purchases:[]};buyers.push(record);return record;}
 for(const item of offers){
  if(!buyer||buyer.balance-buyer.spent<item.priceMzk)buyer=await login();
  const body={sku:item.sku,requestId:'funhouse-buy-'+item.buildAssetId};
  assert.equal((await request('/api/economy/buy',{body})).response.status,401);
  assert.equal((await request('/api/economy/buy',{headers:{Cookie:buyer.headers.Cookie},body})).code,'CSRF_INVALID');
  const purchase=await request('/api/economy/buy',{headers:buyer.headers,body}),replay=await request('/api/economy/buy',{headers:buyer.headers,body});
  assert.equal(purchase.response.status,200,purchase.message);assert.equal(replay.response.status,200,replay.message);assert.equal(replay.data.id,purchase.data.id);
  buyer.spent+=item.priceMzk;buyer.purchases.push(item);
 }
 for(const buyer of buyers){
  const state=(await request('/api/economy',{headers:buyer.headers})).data,backpack=(await request('/api/wallet/state',{headers:buyer.headers})).data;
  assert.equal(state.balance,buyer.balance-buyer.spent);
  for(const item of buyer.purchases){const owned=state.ownedAssets.filter(asset=>asset.economySku===item.sku);assert.equal(owned.length,1);assert.equal(owned[0].buildAssetId,item.buildAssetId);assert.deepEqual(owned[0].function_data,item.function_data);assert.equal(backpack.items.filter(asset=>asset.economySku===item.sku).length,1);}
 }
 const owner=buyers.find(buyer=>buyer.purchases.some(item=>item.buildAssetId==='funhouse-maze-bell')),item=owner.purchases.find(item=>item.buildAssetId==='funhouse-maze-bell'),visitor=await login();
 const path='/api/rooms/'+FUNHOUSE_ID+'/gameplay',command=(headers,action,extra={})=>request(path,{headers,body:{action,requestId:'funhouse-room-'+Math.random().toString(36).slice(2),...extra}});
 assert.equal((await command(visitor.headers,'join')).response.status,200);
 assert.equal((await command(visitor.headers,'spawn',{sku:item.sku,itemId:'economy:'+item.sku})).response.status,403,'another visitor cannot spawn a catalog or purchased item by guessing its ID');
 assert.equal((await command(owner.headers,'join')).response.status,200);
 const placed=await command(owner.headers,'spawn',{sku:item.sku,itemId:'economy:'+item.sku,placement:{position:[3,.02,47],rotation:[0,0,0],scale:[1,1,1]}});
 assert.equal(placed.response.status,200,placed.message);const actor=placed.data.actors[placed.data.result.spawnedId];assert.equal(actor.asset.buildAssetId,item.buildAssetId);assert.equal(actor.definition.gameplay.funhouseItem,item.buildAssetId);
 for(const modelId of ['funhouse-propeller-hat','funhouse-clown-shoes','funhouse-water-gun']){
  const buyer=buyers.find(buyer=>buyer.purchases.some(item=>item.buildAssetId===modelId)),owned=buyer.purchases.find(item=>item.buildAssetId===modelId),fields={itemId:'economy:'+owned.sku,sku:owned.sku,enabled:true};
  assert.equal((await command(visitor.headers,'funhouse-equip',fields)).response.status,403,'a catalog ID is not proof of owning '+modelId);
  assert.equal((await command(buyer.headers,'join')).response.status,200);
  const equipped=await command(buyer.headers,'funhouse-equip',fields);assert.equal(equipped.response.status,200,equipped.message);
  const player=equipped.data.players[equipped.data.selfId];
  if(modelId==='funhouse-water-gun'){
   assert.equal(player.funhouse.tool,'water');assert.equal(player.funhouse.equipment.water.sku,owned.sku);
   const beforeHealth=Object.fromEntries(Object.entries(equipped.data.players).map(([id,player])=>[id,player.health]));
   const splash=await command(buyer.headers,'funhouse-water',{direction:[0,0,-1]});assert.equal(splash.response.status,200,splash.message);assert.equal(splash.data.result.funhouseEffect.kind,'water-spray');
   assert.deepEqual(Object.fromEntries(Object.entries(splash.data.players).map(([id,player])=>[id,player.health])),beforeHealth,'the portable water blaster never damages players');
  }else assert.equal(player.funhouse.costume[modelId==='funhouse-propeller-hat'?'hat':'shoes'],true);
  assert.equal((await request('/api/economy',{headers:buyer.headers})).data.balance,buyer.balance-buyer.spent,'owned carnival equipment does not add a per-use charge');
 }
 assert.equal((await command(visitor.headers,'funhouse-water',{direction:[0,0,-1]})).response.status,403,'unowned water cannot be fired');
 const galleryOwner=buyers.find(buyer=>buyer.purchases.some(item=>item.buildAssetId==='funhouse-water-gallery')),gallery=galleryOwner.purchases.find(item=>item.buildAssetId==='funhouse-water-gallery');
 assert.equal((await command(galleryOwner.headers,'join')).response.status,200);
 const deployed=await command(galleryOwner.headers,'spawn',{sku:gallery.sku,itemId:'economy:'+gallery.sku,placement:{position:[10,.02,44],rotation:[0,0,0],scale:[1,1,1]}});
 assert.equal(deployed.response.status,200,deployed.message);const objectId=deployed.data.result.spawnedId,station=funhouseStations(world,{actors:deployed.data.actors}).find(station=>station.objectId===objectId);
 assert.ok(station?.id.startsWith('funhouse-instance:'));
 const arrival=await command(galleryOwner.headers,'map-access',{position:station.position});assert.equal(arrival.response.status,200,arrival.message);
 const started=await command(galleryOwner.headers,'funhouse-start',{stationId:station.id});assert.equal(started.response.status,200,started.message);const round=started.data.players[started.data.selfId].funhouse.round;
 const hit=await command(galleryOwner.headers,'funhouse-squirt',{roundId:round.id,targetId:round.targetId});assert.equal(hit.response.status,200,hit.message);assert.equal(hit.data.result.funhouseEffect.objectId,objectId);assert.equal(hit.data.players[hit.data.selfId].funhouse.round.score,10,'a purchased gallery copy runs its real target game');
 assert.equal((await command(galleryOwner.headers,'funhouse-stop',{roundId:round.id})).response.status,200);
});
