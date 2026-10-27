import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {ensureWorldSupply,supplyItem} from '../world-supply.mjs';

const drawingPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTQAAAABJRU5ErkJggg==';

test('listed builder and saved custom assets reach the live factory at their exact MZK price and consume their own delivered stock',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'factory-marketplace-api-')),previous={...process.env};let stopFixture;
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json')});
 try{
  await writeFile(join(dir,'published-models.json'),JSON.stringify([{id:'factory-published-avatar',name:'Published factory avatar',modelUrl:'/uploads/factory-published-avatar.glb',category:'Avatar',status:'published',visibility:'public'}]));
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server,userDatabase,consumeSupplyAsset};export async function stopFixture(){masterMaintenance=true;await drainServerState();}');
  const modulePath=join(dir,'handler.mjs');await writeFile(modulePath,source);
  const fixture=await import(pathToFileURL(modulePath).href),{server,userDatabase,consumeSupplyAsset}=fixture;stopFixture=fixture.stopFixture;const handler=server.listeners('request')[0];
  async function call(url,headers={},body){
   const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url,method:body?'POST':'GET',headers:{host:'localhost','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});
   const result={headers:{}};const res={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,headers){result.status=status;for(const [key,value]of Object.entries(headers))this.setHeader(key,value);this.headersSent=true;},end(data){result.body=JSON.parse(data);}};
   await handler(req,res);return result;
  }
  const login=await call('/api/access/free-play',{}, {username:'FactoryMarketReviewer',password:'factory-marketplace-api-password'});assert.equal(login.status,200,login.body.message);
  const headers={authorization:'Bearer '+login.body.data.sessionToken},wallet=(await call('/api/wallet/state',headers)).body.data.walletId;
  const initial=(await call('/api/world-supply')).body.data,base=initial.catalog.find(item=>item.modelUrl&&/\.glb(?:[?#]|$)/i.test(item.modelUrl));assert.ok(base);
  const published=initial.catalog.find(item=>item.modelUrl==='/uploads/factory-published-avatar.glb');assert.ok(published,'unpriced published uploads enter the factory through shared catalog pricing');assert.equal(published.factoryUnitPriceMzk,300);
  await userDatabase.transaction(data=>{data.users[wallet].tokens.MZK=1000000;data.users[wallet].items.push({id:'owned-customizable-base',name:base.name,modelUrl:base.modelUrl,type:'prop',source:'mzk-store'});return {};});
  const native=await userDatabase.createBuilderAsset(wallet,{name:'Factory API native chair',asset_type:'props',builder_category:'UTILITIES',price_mzk:125,function_data:{buildAssetId:'armchair',behavior:'seat',prompt:'Use the custom red chair'}});
  const model=await userDatabase.createBuilderAsset(wallet,{name:'Factory API configured GLB',asset_type:'props',builder_category:'UTILITIES',glb_url:base.modelUrl,price_mzk:1250,function_data:{behavior:'decor',prompt:'Configured model blueprint'}});
  const nativeListing=await userDatabase.listBuilderAsset(wallet,{asset_id:native.asset.id,price_mzk:150}),modelListing=await userDatabase.listBuilderAsset(wallet,{asset_id:model.asset.id,price_mzk:1600});
  const custom=await userDatabase.saveCustomItem(wallet,{name:'Factory API custom GLB',format:'glb',modelUrl:base.modelUrl,requestId:'save-market-glb-001',configuration:{color:'#ff3355',material:'metal',behavior:'decor'}});
  const drawing=await userDatabase.saveCustomItem(wallet,{name:'Factory API custom drawing',thumbnailUrl:drawingPng,requestId:'save-market-png-001',configuration:{color:'#22ffaa',extruded:true,depth:12,behavior:'decor'}});
  await userDatabase.listItem(wallet,custom.id,480);await userDatabase.listItem(wallet,drawing.id,225);
  const marketResponse=await call('/api/market/catalog');assert.equal(marketResponse.status,200);
  const market=marketResponse.body.data,lineup=(await call('/api/world-supply')).body.data;
  const cases=[['builder:'+nativeListing.listing_id,125],['builder:'+modelListing.listing_id,1250],['player:'+wallet+':'+custom.id,480],['player:'+wallet+':'+drawing.id,225]];
  const factoryIds=new Set();let totalMzk=0;
  for(const [marketId,unitPrice]of cases){
   const row=market.find(row=>row.id===marketId);assert.ok(row,marketId+' remains visible in the marketplace');assert.equal(row.factoryProducible,true,marketId+' exposes its factory blueprint');
   assert.equal(row.factoryUnitPriceMzk,unitPrice);const item=lineup.catalog.find(item=>item.id===row.factoryItemId);assert.ok(item,marketId+' is in the production lineup');
   assert.equal(item.factoryUnitPriceMzk,unitPrice);assert.equal(factoryIds.has(item.id),false,'configured variants retain distinct stock identities');factoryIds.add(item.id);assert.notEqual(item.id,base.id);
   const input={itemId:row.factoryItemId,quantity:10},quote=await call('/api/world-supply/quote',headers,input);assert.equal(quote.status,200);assert.equal(quote.body.data.unitPriceMzk,unitPrice);assert.equal(quote.body.data.priceMzk,unitPrice*8);
   assert.equal((await call('/api/world-supply/produce',headers,{...input,expectedPriceMzk:quote.body.data.priceMzk+1,requestId:'stale-'+factoryIds.size})).status,409);
   const order={...input,expectedPriceMzk:quote.body.data.priceMzk,requestId:'produce-market-'+factoryIds.size},produced=await call('/api/world-supply/produce',headers,order);assert.equal(produced.status,200);assert.equal(produced.body.data.itemId,item.id);
   assert.equal(produced.body.data.blueprint.itemId,item.id);assert.equal(produced.body.data.stages.length,4);assert.equal(produced.body.data.stages.flatMap(stage=>stage.operations).length,12);
   assert.equal((await call('/api/world-supply/produce',headers,order)).body.data.id,produced.body.data.id);totalMzk+=quote.body.data.priceMzk;
  }
  assert.equal((await userDatabase.get(wallet)).tokens.MZK,1000000-totalMzk,'every production order is charged once at the matching market quote');
  const mapId='factory-marketplace-deploy';assert.equal((await call('/api/custom-maps',headers,{scene:{id:mapId,name:'Factory marketplace deployment',layout:'grand-floor',mapSize:100,objects:[]}})).status,201);
  const customId=market.find(row=>row.id==='player:'+wallet+':'+custom.id).factoryItemId,drawingId=market.find(row=>row.id==='player:'+wallet+':'+drawing.id).factoryItemId;
  await userDatabase.transaction(data=>{const ledger=ensureWorldSupply(data,{maps:[mapId]});ledger.maps[mapId].stock[drawingId]=1;ledger.maps[mapId].stock[customId]=1;ledger.maps[mapId].stock[base.id]=7;return {};});
  const gameplay=body=>call('/api/rooms/'+mapId+'/gameplay',headers,body);
  assert.equal((await gameplay({action:'join',requestId:'join-factory-market',radToxEnabled:false})).status,200);
  const spawn={action:'spawn',itemId:drawing.id,requestId:'deploy-market-drawing'},placed=await gameplay(spawn);assert.equal(placed.status,200,placed.body.message);
  const replay=await gameplay(spawn);assert.equal(replay.status,200);assert.equal(replay.body.data.result.spawnedId,placed.body.data.result.spawnedId);
  const actor=placed.body.data.actors[placed.body.data.result.spawnedId];assert.equal(actor.asset.renderKind,'image');assert.equal(actor.asset.id,drawing.id);
  let stock=(await userDatabase.read()).worldSupply.maps[mapId].stock;assert.equal(stock[drawingId],0);assert.equal(stock[customId],1);assert.equal(stock[base.id],7);
  const empty=await gameplay({...spawn,requestId:'deploy-depleted-drawing'});assert.equal(empty.status,409);assert.match(empty.body.message,/out of stock/);
  await consumeSupplyAsset({walletId:wallet},custom,'deploy-custom-variant',{id:mapId});await consumeSupplyAsset({walletId:wallet},custom,'deploy-custom-variant',{id:mapId});
  stock=(await userDatabase.read()).worldSupply.maps[mapId].stock;assert.equal(stock[customId],0);assert.equal(stock[base.id],7,'custom GLB deployments debit the variant instead of the base model');
  await assert.rejects(consumeSupplyAsset({walletId:wallet},custom,'deploy-another-custom-variant',{id:mapId}),/out of stock/);
  assert.equal(supplyItem(await userDatabase.read(),drawing).supplyId,drawingId);
 }finally{
  if(stopFixture)await stopFixture();
  for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);await rm(dir,{recursive:true,force:true});
 }
});
