import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_ECONOMY,CARE_SUPPLIES} from '../game-economy.mjs';
import {ensureWorldSupply,consumeWorldStock,canonicalSupplyId,supplyItem,supplyAvailability,INITIAL_WORLD_STOCK} from '../world-supply.mjs';

test('every physical native, GLB and care catalog item begins with 1,000 global units only',()=>{
 const data={},ledger=ensureWorldSupply(data,{maps:[{id:'neon-docks',name:'Neon Docks'},'custom-map']});
 for(const item of GAME_ECONOMY.filter(item=>!item.earnedOnly&&item.kind!=='stock')){
  const id=canonicalSupplyId(item);
  assert.equal(ledger.worldStock[id],INITIAL_WORLD_STOCK,item.sku);
  assert.equal(supplyItem(data,item).supplyId,id);
 }
 assert.equal(ledger.worldStock['care:'+CARE_SUPPLIES[0].id],1000);
 assert.deepEqual(ledger.maps['neon-docks'].stock,{});
 assert.deepEqual(ledger.maps['custom-map'].stock,{});
 assert.equal(ledger.catalog['stock:shipping-food-stock'],undefined);
});

test('depletion survives serialized reloads, catalog refreshes, and map registration',()=>{
 const data={},item=GAME_ECONOMY.find(item=>item.kind==='material'),id=canonicalSupplyId(item);
 consumeWorldStock(data,item,1000);
 const restarted=JSON.parse(JSON.stringify(data));
 ensureWorldSupply(restarted,{maps:[{id:'map-a',name:'Map A'}]});
 ensureWorldSupply(restarted);
 assert.equal(restarted.worldSupply.worldStock[id],0);
 assert.throws(()=>consumeWorldStock(restarted,item,1),{statusCode:409});
 assert.equal(restarted.worldSupply.worldStock[id],0);
});

test('GLB store aliases use the same finite catalog stock and published models seed once',()=>{
 const data={},item=GAME_ECONOMY.find(item=>item.modelUrl),id=canonicalSupplyId(item);
 const alias={id:'store-model-different-store-id',modelUrl:item.modelUrl.replace(/^\//,'')};
 ensureWorldSupply(data,{items:[alias]});
 assert.equal(supplyItem(data,alias).supplyId,id);
 consumeWorldStock(data,alias,3);
 assert.equal(data.worldSupply.worldStock[id],997);
 const published={id:'published-cargo-42',name:'Creator cargo',modelUrl:'/uploads/published-cargo-42.glb'};
 ensureWorldSupply(data,{items:[published]});
 const publishedId=supplyItem(data,published.id).supplyId;
 consumeWorldStock(data,published,1000);
 ensureWorldSupply(data,{items:[published]});
 assert.equal(data.worldSupply.worldStock[publishedId],0);
 assert.throws(()=>consumeWorldStock(data,{id:'unregistered'},1),{statusCode:404});
});

test('untouched maps use world reserve but delivered and depleted map stock remains local',()=>{
 const data={},item=GAME_ECONOMY.find(item=>item.kind==='asset'),id=canonicalSupplyId(item);
 const ledger=ensureWorldSupply(data,{maps:['map-a','map-b']});
 ledger.worldStock[id]-=25;ledger.maps['map-a'].stock[id]=25;
 consumeWorldStock(data,item,5,{mapId:'map-a'});
 assert.equal(ledger.maps['map-a'].stock[id],20);
 assert.equal(ledger.worldStock[id],975);
 assert.equal(supplyAvailability(data,item,{mapId:'map-b'}),975);
 consumeWorldStock(data,item,1,{mapId:'map-b'});
 assert.equal(ledger.worldStock[id],974);
 ledger.maps['map-b'].stock[id]=0;
 assert.throws(()=>consumeWorldStock(data,item,1,{mapId:'map-b'}),{statusCode:409});
 assert.throws(()=>consumeWorldStock(data,item,1,{mapId:'unknown'}),{statusCode:404});
 const before=JSON.stringify(ledger.worldStock);
 for(const quantity of [0,-1,1.5,NaN,Infinity])assert.throws(()=>consumeWorldStock(data,item,quantity),{statusCode:422});
 assert.equal(JSON.stringify(ledger.worldStock),before);
});
