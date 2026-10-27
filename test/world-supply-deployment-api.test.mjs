import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {ensureWorldSupply,supplyItem} from '../world-supply.mjs';

test('real map deployment replays stay map/item scoped and room construction cannot bypass depleted local stock',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'supply-deployment-api-')),previous={...process.env};let stopFixture;
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json')});
 try{
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server,userDatabase,consumeSupplyAsset,sharedRooms};export async function stopFixture(){masterMaintenance=true;await drainServerState();}');
  const modulePath=join(dir,'handler.mjs');await writeFile(modulePath,source);
  const fixture=await import(pathToFileURL(modulePath).href),{server,userDatabase,consumeSupplyAsset,sharedRooms}=fixture;stopFixture=fixture.stopFixture;const handler=server.listeners('request')[0];
  async function call(url,headers={},body){
   const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url,method:body?'POST':'GET',headers:{host:'localhost','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});
   const result={headers:{}};const res={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,headers){result.status=status;for(const [key,value]of Object.entries(headers))this.setHeader(key,value);this.headersSent=true;},end(data){result.body=JSON.parse(data);}};
   await handler(req,res);return result;
  }
  const login=await call('/api/access/free-play',{}, {username:'SupplyDeploymentReviewer',password:'supply-deployment-api-password'});assert.equal(login.status,200);
  const headers={authorization:'Bearer '+login.body.data.sessionToken},wallet=(await call('/api/wallet/state',headers)).body.data.walletId;
  const directory=(await call('/api/world-supply')).body.data,models=directory.catalog.filter(item=>item.modelUrl).slice(0,2);assert.equal(models.length,2);
  for(const id of ['supply-deploy-a','supply-deploy-b'])assert.equal((await call('/api/custom-maps',headers,{scene:{id,name:id,layout:'grand-floor',mapSize:100,objects:[]}})).status,201);
  const owned=models.map((item,index)=>({...item,id:'owned-supply-'+index,sku:undefined,economySku:undefined,source:'mzk-store'}));
  let woodId;
  await userDatabase.transaction(data=>{
   const ledger=ensureWorldSupply(data,{maps:['supply-deploy-a','supply-deploy-b']});woodId=supplyItem(data,'material:wood').supplyId;
   data.users[wallet].items.push(...owned);
   for(const id of ['supply-deploy-a','supply-deploy-b'])for(const item of models)ledger.maps[id].stock[item.id]=2;
   ledger.maps['supply-deploy-a'].stock[woodId]=0;return {};
  });
  const gameplay=(map,body)=>call('/api/rooms/'+map+'/gameplay',headers,body),placement={position:[1,0,1],rotation:[0,0,0],scale:[1,1,1]},spawn={action:'spawn',requestId:'same-supply-deployment',itemId:owned[0].id,placement};
  assert.equal((await gameplay('supply-deploy-a',{action:'join',requestId:'join-a',radToxEnabled:false})).status,200);
  const first=await gameplay('supply-deploy-a',spawn);assert.equal(first.status,200);assert.equal((await gameplay('supply-deploy-a',spawn)).body.data.result.spawnedId,first.body.data.result.spawnedId);
  assert.equal((await gameplay('supply-deploy-a',{...spawn,itemId:owned[1].id})).status,409,'a request cannot be reused for another owned item');
  let ledger=(await userDatabase.read()).worldSupply;assert.equal(ledger.maps['supply-deploy-a'].stock[models[0].id],1);assert.equal(ledger.maps['supply-deploy-a'].stock[models[1].id],2);
  assert.equal((await gameplay('supply-deploy-b',{action:'join',requestId:'join-b',radToxEnabled:false})).status,200);
  assert.equal((await gameplay('supply-deploy-b',spawn)).status,200,'room-scoped request IDs may repeat in another map');
  ledger=(await userDatabase.read()).worldSupply;assert.equal(ledger.maps['supply-deploy-b'].stock[models[0].id],1,'the second map still consumes its own stock');
  await assert.rejects(consumeSupplyAsset({walletId:wallet},owned[1],spawn.requestId,{id:'supply-deploy-b'}),/another item/);
  assert.equal((await gameplay('supply-deploy-a',{action:'join',requestId:'rejoin-a',radToxEnabled:false})).status,200);
  const object={materialId:'wood',position:[1,0,1],rotation:[0,0,0],scale:[1,1,1],paint:[],open:false},build={id:'supply-wood-piece',revision:0,object};
  const empty=await call('/api/rooms/supply-deploy-a/objects',headers,build);assert.equal(empty.status,409);assert.match(empty.body.message,/out of stock/);
  assert.equal((await userDatabase.read()).worldSupply.worldStock[woodId],1000,'construction may not debit the central stock in place of an empty local warehouse');
  await userDatabase.transaction(data=>{data.worldSupply.maps['supply-deploy-a'].stock[woodId]=1;return {};});
  assert.equal((await call('/api/rooms/supply-deploy-a/objects',headers,build)).status,200);
  const stock=(await userDatabase.read()).worldSupply;assert.equal(stock.maps['supply-deploy-a'].stock[woodId],0);assert.equal(stock.worldStock[woodId],1000);
  const aliasMap=(await call('/api/environments')).body.data.find(map=>map.id==='tropical-island'),alias=aliasMap.aliases[0];assert.ok(alias);
  await userDatabase.transaction(data=>{const ledger=ensureWorldSupply(data,{maps:[aliasMap]});ledger.maps[aliasMap.id].stock[models[0].id]=2;return {};});
  assert.equal((await gameplay(aliasMap.id,{action:'join',requestId:'join-alias-map',radToxEnabled:false})).status,200);
  const aliasedSpawn={action:'spawn',requestId:'same-alias-deployment',itemId:owned[0].id},canonicalSpawn=await gameplay(aliasMap.id,aliasedSpawn);assert.equal(canonicalSpawn.status,200);
  const aliasReplay=await gameplay(alias,aliasedSpawn);assert.equal(aliasReplay.status,200);assert.equal(aliasReplay.body.data.result.spawnedId,canonicalSpawn.body.data.result.spawnedId);
  assert.ok((await call('/api/rooms/'+alias+'/gameplay')).body.data.actors[canonicalSpawn.body.data.result.spawnedId]);
  assert.equal((await userDatabase.read()).worldSupply.maps[aliasMap.id].stock[models[0].id],1,'alias replay keeps the same actor and does not debit a second unit');
  const savedRooms=await sharedRooms.read();assert.ok(savedRooms[aliasMap.roomId||aliasMap.id]);assert.equal(savedRooms[alias],undefined,'alias URLs cannot open a duplicate runtime room');
  assert.equal((await call('/api/rooms/'+alias+'/building',headers,{enabled:false})).status,200);
  assert.equal((await call('/api/rooms/'+aliasMap.id+'/objects')).body.data.building.enabled,false);
  assert.equal((await call('/api/rooms/'+alias+'/building',headers,{enabled:true})).status,200);

 }finally{
  if(stopFixture)await stopFixture();
  for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);await rm(dir,{recursive:true,force:true});
 }
});
