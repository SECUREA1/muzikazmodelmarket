import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {createFactoryBuilderScene} from '../public/js/missile-factory-builder.js';
import {factoryStations} from '../public/js/missile-factory-config.js';
import {localMapLocations} from '../public/js/local-map-locations.js';

test('published edited factory retains live station coordinates and purchased equipment becomes an interactive room station',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'factory-publish-')),probe=createServer();
 await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),MUZIKAZ_DATA_DIR:directory,MUZIKAZ_USER_DATABASE_FILE:join(directory,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(directory,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(directory,'payments.json')},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;
 async function request(path,{headers={},body,status=200}={}){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});const payload=await response.json();assert.equal(response.status,status,JSON.stringify(payload));return {data:payload.data,response};}
 try{
  for(let attempt=0;attempt<100;attempt++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(child.exitCode!==null)throw Error('Factory test server stopped');await pause(50);}
  const login=await request('/api/access/guest',{body:{},status:201}),cookie=login.response.headers.get('set-cookie').split(';')[0],session=await request('/api/market/session',{headers:{cookie}}),headers={cookie,'X-CSRF-Token':session.data.csrfToken};
  const scene=createFactoryBuilderScene({id:'published-custom-factory'}),procurement=scene.objects.find(object=>object.functionalSettings.factoryStation==='procurement');
  procurement.position={x:-12,y:0,z:35};procurement.rotation.y=Math.PI/2;procurement.scale={x:1.25,y:1.25,z:1.25};
  const published=(await request('/api/custom-maps',{headers,body:{scene},status:201})).data;
  assert.equal(published.factory.editableStations,true);assert.equal(published.builderScene.sourceFactory.editableCrew,true);
  const stations=factoryStations(published),orderStation=stations.find(station=>station.kind==='procurement');assert.ok(orderStation.position.x>-12);assert.ok(Math.abs(orderStation.position.z-35)<1e-8);
  assert.deepEqual(localMapLocations(published).find(place=>place.id===orderStation.id).x,orderStation.position.x);
  const endpoint='/api/rooms/'+scene.id+'/gameplay',command=async(action,fields={})=>(await request(endpoint,{headers,body:{action,requestId:crypto.randomUUID(),...fields}})).data;
  const joined=await command('join');assert.ok(joined.factory.stations.some(station=>station.id===orderStation.id));
  await command('map-access',{position:orderStation.position});const order=await command('factory-start',{recipeId:'training-missile',stationId:orderStation.id});
  assert.equal(order.result.factory.job.status,'awaiting');assert.equal(order.result.factory.job.environmentId,scene.id);
  assert.ok(order.result.factory.job.steps.every(step=>step.stationId.startsWith('factory-instance:')));
  const economy=(await request('/api/economy',{headers})).data,equipment=economy.items.find(item=>item.buildAssetId==='factory-procurement-terminal');assert.ok(equipment);
  const body={sku:equipment.sku,requestId:'buy-factory-terminal'};await request('/api/economy/buy',{headers,body});await request('/api/economy/buy',{headers,body});
  const spawned=await command('spawn',{sku:equipment.sku}),actor=spawned.actors[spawned.result.spawnedId];assert.equal(actor.definition.gameplay.factoryStation,'procurement');
  const dynamic=spawned.factory.stations.find(station=>station.objectId===actor.id);assert.ok(dynamic,'purchased terminal creates a live station');
  assert.equal(dynamic.kind,'procurement');assert.ok(dynamic.position.z!==actor.position.z||dynamic.position.x!==actor.position.x,'operator pad follows equipment approach');
  const after=(await request('/api/economy',{headers})).data;assert.equal(after.balance,economy.balance-equipment.priceMzk-equipment.useCostMzk);
 }finally{
  if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;}
  await rm(directory,{recursive:true,force:true});
 }
});
