import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';

test('cookie and bearer member sessions own market and care actions without a browser wallet',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'market-session-'));const oldEnv={...process.env};
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json')});
 try{
  // Exercise the real HTTP handler without binding a TCP port in the sandbox.
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export { server };');
  const modulePath=join(dir,'handler.mjs');await writeFile(modulePath,source);const {server}=await import(pathToFileURL(modulePath).href);const handler=server.listeners('request')[0];
  async function call(url,headers={},body,method=body?'POST':'GET'){
   const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url,method,headers:{host:'localhost','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});
   const result={headers:{}};const res={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,headers){result.status=status;for(const[key,value]of Object.entries(headers))this.setHeader(key,value);this.headersSent=true;},end(data){result.body=JSON.parse(data);}};
   await handler(req,res);return result;
  }
  const login=await call('/api/access/free-play',{}, {username:'SessionCarePlayer',password:'member-session-test'});assert.equal(login.status,200);
  const wrong=await call('/api/access/free-play',{}, {username:'SessionCarePlayer',password:'incorrect-password'});assert.equal(wrong.status,401);
  const restored=await call('/api/access/free-play',{}, {username:'SessionCarePlayer',password:'member-session-test'});assert.equal(restored.status,200);assert.equal(restored.body.data.account.accountId,login.body.data.account.accountId);
  const cookie=login.headers['set-cookie'].split(';')[0],cookieHeaders={cookie};
  const session=await call('/api/market/session',cookieHeaders);assert.equal(session.status,200);const owner=session.body.data.owner_id;assert.match(owner,/^account:/);
  const csrf=session.body.data.csrfToken,headers={cookie,'x-csrf-token':csrf,'x-wallet-address':'someone-else'};
  const savedDesign=await call('/api/designer/drafts',headers,{name:'My design',design:{product:'Sticker sheet',character:'Chaos Ape',fields:{quantity:'2',name:'Crew'},uploads:[],placements:{'preview-name':{left:'30%',top:'50%'}}}});assert.equal(savedDesign.status,200);const draftId=savedDesign.body.data.id;
  assert.equal((await call('/api/designer/drafts/'+draftId,cookieHeaders)).body.data.design.fields.name,'Crew');
  assert.equal((await call('/api/designer/drafts',cookieHeaders,{design:{fields:{quantity:1}}})).body.code,'CSRF_INVALID');
  const settings=await call('/api/player/settings',headers,{settings:{mouseSensitivity:1.5,invertLook:true,effectsVolume:0,health:1000}},'PUT');assert.equal(settings.status,200);assert.equal(settings.body.data.owner_id,owner);assert.equal(settings.body.data.settings.mouseSensitivity,1.5);assert.equal('health'in settings.body.data.settings,false);
  assert.equal((await call('/api/player/settings',cookieHeaders,{settings:{effectsVolume:1}},'PUT')).body.code,'CSRF_INVALID');
  assert.equal((await call('/api/player/settings',cookieHeaders)).body.data.settings.effectsVolume,0);
  const wallet=await call('/api/wallet/state',headers);assert.equal(wallet.body.data.walletId,owner);const balance=wallet.body.data.tokens.MZK;assert.equal(balance,session.body.data.balance);assert.equal(wallet.body.data.items.some(item=>item.id==='health'),false);
  const purchase=await call('/api/rpg/purchases',headers,{itemId:'ion-health-vial',requestId:'buy-care'});assert.equal(purchase.status,200);assert.equal(purchase.body.data.balance,balance-25);
  const item=purchase.body.data.items[0];assert.ok(item);
  const listed=await call('/api/market/listings',headers,{itemId:item.id,priceMzk:10},'PUT');assert.equal(listed.status,200);
  const telemetry=await call('/api/rpg/telemetry',headers,{health:20,world:'session-arena'});assert.equal(telemetry.status,200);
  const use=await call('/api/rpg/use',headers,{itemId:item.id,requestId:'use-care'});assert.equal(use.status,200);assert.equal(use.body.data.stats.health,55);
  const denied=await call('/api/rpg/telemetry',cookieHeaders,{health:100});assert.equal(denied.body.code,'CSRF_INVALID');
  const bearer={authorization:'Bearer '+login.body.data.sessionToken,'x-wallet-address':'someone-else'};
  const state=await call('/api/rpg/state',bearer);assert.equal(state.status,200);assert.equal(state.body.data.owner_id,owner);assert.equal(state.body.data.stats.health,55);
  const history=await call('/api/market/activity',cookieHeaders);assert.equal(history.status,200);
  const second=await call('/api/access/free-play',{}, {username:'OtherCarePlayer',password:'other-session-test'});assert.equal(second.status,200);
  const secondHeaders={cookie:second.headers['set-cookie'].split(';')[0]};const secondSession=await call('/api/market/session',secondHeaders);secondHeaders['x-csrf-token']=secondSession.body.data.csrfToken;
  assert.equal((await call('/api/player/settings',secondHeaders)).body.data.settings.mouseSensitivity,1);
  assert.equal((await call('/api/designer/drafts/'+draftId,secondHeaders)).status,404);
  assert.equal((await call('/api/designer/drafts',secondHeaders)).body.data.length,0);
  const extra=await call('/api/rpg/purchases',headers,{itemId:'ion-health-vial',requestId:'buy-trade'});const tradedItem=extra.body.data.items[0];
  assert.equal((await call('/api/market/listings',headers,{itemId:tradedItem.id,priceMzk:10},'PUT')).status,200);
  const trade=await call('/api/market/trades',secondHeaders,{sellerId:owner,itemId:tradedItem.id,requestId:'trade-care',expectedPriceMzk:10});assert.equal(trade.status,201);assert.equal(trade.body.data.buyerId,secondSession.body.data.owner_id);
  const messages=await call('/api/market/messages',cookieHeaders,{to:secondSession.body.data.owner_id,text:'Care item question'});assert.equal(messages.status,201);
  await call('/api/session',headers,undefined,'DELETE');
  const expired=await call('/api/market/session',bearer);assert.equal(expired.status,401);
 }finally{process.env=oldEnv;await rm(dir,{recursive:true,force:true});}
});
