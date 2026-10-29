import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {quarryMarketCatalog,quarryMarketStockLabel,quarryMarketUrl} from '../public/js/quarry-market.js';
import {QUARRY_MATERIALS,QUARRY_MODEL_INFO} from '../public/js/quarry-config.js';
import {marketFacets} from '../public/js/market-facets.js';
import {initialMarketSource,mainMarketEntries,filterMainMarket} from '../public/js/main-market-filters.js';
import {GAME_ECONOMY} from '../game-economy.mjs';import {nativeMarketCatalog} from '../native-market-catalog.mjs';
import {quarryWorld} from '../quarry-world.mjs';import {shippingWorld} from '../shipping-world.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';import {UserJsonDatabase} from '../user-json-database.mjs';

const owner='account:quarry-market',deed={id:'quarry-market-deed',worldId:'quarry-market-home',name:'Material receiving deed',ownerId:owner,status:'active'};
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'quarry-market-'));t.after(()=>rm(dir,{recursive:true,force:true}));const db=new UserJsonDatabase(join(dir,'users.json'));await db.put(owner,{tokens:{MZK:1000},items:[{id:deed.id,type:'land-deed',worldId:deed.worldId}]});await db.transaction(data=>{data.landDeeds[deed.worldId]=deed;});const mine=quarryWorld(),maps=[mine,shippingWorld(),{id:'plot-'+deed.id,name:deed.name,memberPlot:true,deedId:deed.id,builderScene:{layout:'grand-floor',mapSize:80,objects:[]},proceduralLand:true,spawn:{x:0,y:0,z:0}}],service=new WorldSupplyService(db,{maps:async()=>maps});return {db,mine,maps,service};}

test('all processed quarry outputs have canonical finite market offers, excluding raw feed and private inventories',()=>{
 const mine=quarryWorld(),privateMine={...mine,id:'private-mine',visibility:'private'},personalMine={...mine,id:'owned-mine',memberPlot:true},ledger={maps:{[mine.id]:{stock:{'quarry:sand':7,'quarry:stone':0}},'private-mine':{stock:{'quarry:sand':100}},'owned-mine':{stock:{'quarry:sand':100}},'plot-owned':{stock:{'quarry:sand':100}}}},before=JSON.stringify(ledger),offers=quarryMarketCatalog(ledger,[mine,privateMine,personalMine,{...privateMine,id:'unlisted-mine',visibility:'unlisted'},{...mine,id:'internal-mine',internal:true}]);
 assert.deepEqual(offers.map(item=>item.id),Object.keys(QUARRY_MATERIALS).map(key=>'quarry:'+key));assert.equal(offers.length,6);assert.equal(offers.find(item=>item.quarryMaterial==='sand').availableStock,7);assert.equal(offers.find(item=>item.quarryMaterial==='stone').availableStock,0);assert.equal(JSON.stringify(ledger),before);
 for(const item of offers){assert.equal(item.sku,item.id);assert.equal(item.supplyId,item.id);assert.equal(item.unit,'m³');assert.equal(item.factoryProducible,false);assert.equal(item.purchaseOperation,'order-quarry');assert.equal(item.warehouses.length,1);assert.equal(item.warehouses[0].mapId,mine.id);assert.equal(new URL(item.orderUrl,'https://market.test').searchParams.get('quarryMaterial'),item.quarryMaterial);assert.equal(marketFacets(item).category,'materials');assert.ok(marketFacets(item).uses.includes('trade'));assert.ok(marketFacets(item).uses.includes('shipping'));}
 assert.equal(filterMainMarket(mainMarketEntries(offers),{source:'quarry',query:'screened garden sand'}).length,1);assert.match(quarryMarketStockLabel(offers[0]),/7 m³ available.*4 MZK \/ m³/);assert.ok(!offers.some(item=>['quarry:soil','quarry:gravel'].includes(item.id)));
});

test('market stock tracks booked material, paid freight reservations and cancellation, without creating production',async t=>{
 const {db,mine,service}=await fixture(t),before=JSON.stringify((await db.read()).worldSupply);let offers=await service.quarryMarketCatalog();assert.ok(offers.every(item=>item.availableStock===0));assert.equal(JSON.stringify((await db.read()).worldSupply),before,'browsing must not initialize or mint stock');
 await service.quarryInventory({walletId:owner},{operation:'export',sourceMapId:mine.id,material:'sand',quantity:3,id:'processed-batch-1'});offers=await service.quarryMarketCatalog();assert.equal(offers.find(item=>item.id==='quarry:sand').availableStock,3);
 const order=await service.action(owner,'order-quarry',{itemId:'quarry:sand',quantity:2,sourceMapId:mine.id,deedId:deed.id,requestId:'market-freight-1'});assert.equal((await service.quarryMarketCatalog()).find(item=>item.id==='quarry:sand').availableStock,1);assert.equal((await db.get(owner)).tokens.MZK,992);
 await assert.rejects(service.action(owner,'produce',{itemId:'quarry:sand',quantity:1,requestId:'market-free-production'}),/listed|blueprint/);
 await assert.rejects(service.action(owner,'dispatch',{sourceMapId:mine.id,destinationMapId:'plot-'+deed.id,itemId:'quarry:sand',quantity:1,requestId:'market-buy-bypass'}),/quarry material order/);
 await service.action(owner,'cancel',{orderId:order.id,requestId:'cancel-market-freight'});assert.equal((await service.quarryMarketCatalog()).find(item=>item.id==='quarry:sand').availableStock,3);assert.equal((await db.get(owner)).tokens.MZK,1000);
});

test('each quarry machine and reusable asset resolves to a market SKU and the public quarry bill of materials',()=>{
 const mine=quarryWorld(),catalog=nativeMarketCatalog(GAME_ECONOMY,[mine]),map=catalog.maps.find(map=>map.worldId===mine.id);
 for(const id of [...Object.keys(QUARRY_MODEL_INFO),'site-excavator','site-dumptruck','site-bulldozer']){const item=catalog.items.find(item=>item.buildAssetId===id);assert.ok(item,id+' has a native market SKU');assert.ok(item.sku);if(mine.builderScene.objects.some(object=>object.modelId===id))assert.ok(map.components.some(component=>component.sku===item.sku),id+' map components resolve to that same SKU');}
 assert.equal(map.components.some(component=>component.sku===null),false);
});

test('quarry market links preserve warehouse identity and the selected product',()=>{
 const second={...quarryWorld(),id:'mine:second',name:'Second quarry'},offers=quarryMarketCatalog({maps:{[second.id]:{stock:{'quarry:crushed':2}}}},[quarryWorld(),second]),crushed=offers.find(item=>item.quarryMaterial==='crushed'),url=new URL(crushed.orderUrl,'https://market.test');assert.equal(crushed.sourceMapId,second.id);assert.equal(url.searchParams.get('environment'),second.id);assert.equal(url.searchParams.get('quarryMaterial'),'crushed');assert.equal(url.searchParams.get('autoplay'),'1');assert.match(quarryMarketUrl('sand'),/quarryMaterial=sand/);
});

test('public quarry market links initialize only a known market source',()=>{
 assert.equal(initialMarketSource('?source=quarry'),'quarry');assert.equal(initialMarketSource('?source=native'),'native');assert.equal(initialMarketSource('?source=unrecognized'),'');assert.equal(initialMarketSource(''),'');
});
