import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';

test('model checkout, payment quotes and paid fulfillment reject a private model with stale published status',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'store-model-visibility-')),previous={...process.env};let stopFixture;
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:directory,MUZIKAZ_USER_DATABASE_FILE:join(directory,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(directory,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(directory,'orders.json'),MUZIKAZ_CUSTOM_MAPS_FILE:join(directory,'custom-maps.json'),MUZIKAZ_ENVIRONMENT_DATA_FILE:join(directory,'environments.json'),MUZIKAZ_AVATAR_UPLOAD_DIR:join(directory,'avatar-uploads'),MUZIKAZ_ASSET_UPLOAD_DIR:join(directory,'asset-uploads'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(directory,'environment-uploads')});
 const records=[{id:'visibility-public',name:'Public model',status:'published',visibility:'public',modelUrl:'/uploads/models/public-visibility.glb',price:10},{id:'visibility-private',name:'Withdrawn model',status:'published',visibility:'private',modelUrl:'/uploads/models/private-visibility.glb',price:10}];
 try{
  await writeFile(join(directory,'published-models.json'),JSON.stringify(records));
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8'),source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server,trustedPurchaseOrder,deliverVerifiedStoreOrder}; export async function stopFixture(){masterMaintenance=true;await drainServerState();}');
  const modulePath=join(directory,'server-fixture.mjs');await writeFile(modulePath,source);const fixture=await import(pathToFileURL(modulePath).href);stopFixture=fixture.stopFixture;const handler=fixture.server.listeners('request')[0];
  async function call(url,body,headers={}){
   const request=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(request,{url,method:body?'POST':'GET',headers:{host:'localhost','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});
   const result={headers:{}};const response={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,headers){result.status=status;for(const [key,value]of Object.entries(headers))this.setHeader(key,value);this.headersSent=true;},end(value){result.body=JSON.parse(value);}};await handler(request,response);return result;
  }
  const listed=await call('/api/models');assert.equal(listed.status,200);assert.ok(listed.body.data.some(model=>model.id===records[0].id));assert.equal(listed.body.data.some(model=>model.id===records[1].id),false,'the public catalog hides the withdrawn model');
  const cart=id=>[{quantity:1,deliverable:{id}}],notCatalogModel=error=>error.statusCode===400&&/catalog model/.test(error.message);
  await assert.rejects(fixture.trustedPurchaseOrder({purchaseType:'MARKETPLACE',metadata:{items:cart(records[1].id)},paymentAsset:'UNKNOWN'}),notCatalogModel,'a guessed private id cannot enter the trusted payment quote');
  await assert.rejects(fixture.trustedPurchaseOrder({purchaseType:'MARKETPLACE',metadata:{items:cart(records[0].id)},paymentAsset:'UNKNOWN'}),/Unsupported Loadout payment asset/,'a public model still resolves before payment validation, without making a network quote');
  const paid=id=>({orderId:'visibility-paid-'+id,purchaseType:'MARKETPLACE',memberAccountId:'visibility-member',paymentStatus:'PAID',basePrice:0,metadata:{items:cart(id)}});
  await assert.rejects(fixture.deliverVerifiedStoreOrder(paid(records[1].id)),notCatalogModel,'a previously paid order cannot deliver an item after it becomes private');
  assert.equal(await fixture.deliverVerifiedStoreOrder(paid(records[0].id)),null,'the public model reaches the ordinary insufficient-payment check');
  const login=await call('/api/access/free-play',{username:'VisibilityShopper',password:'visibility-shopper-test'});assert.equal(login.status,200);const headers={authorization:'Bearer '+login.body.data.sessionToken};
  const before=await call('/api/wallet/state',undefined,headers),purchase=id=>({items:cart(id),expectedAmountMzk:0,requestId:'visibility-checkout-'+id});
  const privatePurchase=await call('/api/store/purchases',purchase(records[1].id),headers);assert.equal(privatePurchase.status,400);assert.match(privatePurchase.body.message,/catalog model/);assert.equal(JSON.stringify(privatePurchase.body).includes(records[1].modelUrl),false,'checkout errors do not disclose the withdrawn file path');
  const publicPurchase=await call('/api/store/purchases',purchase(records[0].id),headers);assert.equal(publicPurchase.status,409);assert.equal(publicPurchase.body.code,'STORE_PRICE_CHANGED','public checkout still reaches the server price guard');
  const after=await call('/api/wallet/state',undefined,headers);assert.deepEqual(after.body.data.items,before.body.data.items);assert.deepEqual(after.body.data.tokens,before.body.data.tokens,'blocked checkout grants no ownership and changes no balance');
 }finally{await stopFixture?.();process.env=previous;await rm(directory,{recursive:true,force:true});}
});
