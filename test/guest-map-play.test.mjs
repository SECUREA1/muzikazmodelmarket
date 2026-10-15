import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
test('guest passes publish solo and multiplayer maps and join shared gameplay without bypassing ownership or CSRF',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'guest-map-')),previous={...process.env};
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json')});
 try{
 const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
 const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server};');
 const modulePath=join(dir,'handler.mjs');await writeFile(modulePath,source);const {server}=await import(pathToFileURL(modulePath).href),handler=server.listeners('request')[0];
 async function call(url,headers={},body){const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url,method:body?'POST':'GET',headers:{host:'localhost','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});const result={headers:{}};const res={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,headers){result.status=status;for(const [key,value]of Object.entries(headers))this.setHeader(key,value);this.headersSent=true;},end(data){result.body=JSON.parse(data);}};await handler(req,res);return result;}
 assert.equal((await call('/api/custom-maps',{}, {scene:{id:'anonymous'}})).status,401);
 assert.equal((await call('/api/access/guest',{origin:'https://other.test'},{})).status,403);
 const guest=await call('/api/access/guest',{origin:'https://www.muzikaz.com'},{});assert.equal(guest.status,201);assert.equal(guest.body.data.guest,true);
 const cookie=guest.headers['set-cookie'].split(';')[0],session=await call('/api/market/session',{cookie});const headers={cookie,'x-csrf-token':session.body.data.csrfToken};
 const retained=await call('/api/access/guest',{cookie},{});assert.equal(retained.status,200);assert.equal(retained.headers['set-cookie'],undefined,'active accounts are not replaced');
 const scene={id:'guest-map',name:'Guest test',layout:'grand-floor',objects:[{id:'enemy',modelId:'rogue-bot',objectType:'enemy',position:{x:3,y:0,z:-4},functionalSettings:{behavior:'hostile',health:100}}],placedModels:[{id:'rogue-bot',modelUrl:'public/models/avatars/ROBOCOP.glb'}],gameplay:{multiplayer:true}};
 assert.equal((await call('/api/custom-maps',{cookie},{scene})).status,401,'CSRF remains enforced');
 const published=await call('/api/custom-maps',headers,{scene});assert.equal(published.status,201);assert.match(published.body.data.playUrl,/mode=multiplayer/);assert.equal(published.body.data.builderScene.placedModels.length,1);
 const joined=await call('/api/rooms/guest-map/gameplay',headers,{action:'join',requestId:'guest-join'});assert.equal(joined.status,200);assert.ok(joined.body.data.actors.enemy);
 const second=await call('/api/access/guest',{},{}),cookie2=second.headers['set-cookie'].split(';')[0],session2=await call('/api/market/session',{cookie:cookie2}),headers2={cookie:cookie2,'x-csrf-token':session2.body.data.csrfToken};
 const joined2=await call('/api/rooms/guest-map/gameplay',headers2,{action:'join',requestId:'second-join'});assert.equal(joined2.status,200);assert.equal(Object.keys(joined2.body.data.players).length,2);
 assert.equal((await call('/api/custom-maps',headers2,{scene})).status,409,'guest cannot overwrite another creator');
 const solo=await call('/api/custom-maps',headers,{scene:{...scene,id:'guest-solo',gameplay:{multiplayer:false}}});assert.equal(solo.status,201);assert.equal(solo.body.data.multiplayer,false);assert.match(solo.body.data.playUrl,/mode=solo/);
 }finally{for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);await rm(dir,{recursive:true,force:true});}
});
