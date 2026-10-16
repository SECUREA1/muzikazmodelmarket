import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';

test('room members can text chat without a browser avatar or microphone, with account and room checks',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'chat-api-')),previous={...process.env};
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json')});
 try{
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server,authoritativeRooms};');
  const modulePath=join(dir,'handler.mjs');await writeFile(modulePath,source);const {server,authoritativeRooms}=await import(pathToFileURL(modulePath).href),handler=server.listeners('request')[0];
  async function call(url,headers={},body){
   const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url,method:body?'POST':'GET',headers:{host:'localhost','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});
   const result={headers:{}};const res={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,headers){result.status=status;for(const [key,value]of Object.entries(headers))this.setHeader(key,value);this.headersSent=true;},end(data){result.body=JSON.parse(data);}};
   await handler(req,res);return result;
  }
  async function player(name,id){const login=await call('/api/access/free-play',{}, {username:name,password:'multiplayer-chat-test-password'});assert.equal(login.status,200);const cookie=login.headers['set-cookie'].split(';')[0],session=await call('/api/game/room-session',{cookie});return {accountId:login.body.data.account.accountId,headers:{cookie,'x-csrf-token':session.body.data.csrfToken,'x-muzikaz-session':id}};}
  const alice=await player('ChatAlice','chat-alice'),bob=await player('ChatBob','chat-bob'),presence='/api/houses/ioncore-house/presence',chat='/api/houses/ioncore-house/chat';
  assert.equal((await call(presence,alice.headers,{roomId:'muzikaz-main',voiceEnabled:false})).status,409,'presence before room join can recover');
  for(const [index,person]of [alice,bob].entries()){
   assert.equal((await call('/api/rooms/muzikaz-main/gameplay',person.headers,{action:'join',requestId:'join-'+index})).status,200);
   assert.equal((await call(presence,person.headers,{roomId:'muzikaz-main',voiceEnabled:false})).status,200,'no client avatar required for text chat');
  }
  const voice='/api/houses/ioncore-house/voice/signal';
  assert.equal((await call(voice,alice.headers,{to:'chat-bob',kind:'offer',payload:{type:'offer'}})).status,400,'silent room members cannot initiate audio');
  await call(presence,alice.headers,{roomId:'muzikaz-main',voiceEnabled:true,voiceCaption:'Hello from my mic',voiceCaptionAt:Date.now()});
  const ready=await call(presence,bob.headers,{roomId:'muzikaz-main',voiceEnabled:false,voiceCaption:'must not publish while muted'});
  assert.equal(ready.body.users.find(user=>user.sessionId==='chat-alice').voiceCaption,'Hello from my mic');
  assert.equal(ready.body.users.find(user=>user.sessionId==='chat-bob').voiceCaption,'');
  assert.equal((await call(voice,alice.headers,{to:'chat-bob',kind:'offer',payload:{type:'offer'}})).status,202,'mic-off listeners receive room audio');
  assert.equal((await call(voice,bob.headers)).body.signals[0].from,'chat-alice');
  assert.equal((await call(voice,bob.headers,{to:'chat-alice',kind:'answer',payload:{type:'answer'}})).status,202,'listeners can negotiate without granting mic access');
  assert.equal((await call(voice,alice.headers,{to:'not-in-room',kind:'offer'})).status,400,'voice cannot escape room membership');
  const muted=await call(presence,alice.headers,{roomId:'muzikaz-main',voiceEnabled:false});
  assert.equal(muted.body.users.find(user=>user.sessionId==='chat-alice').voiceCaption,'','muting clears speech text');
  const sent=await call(chat,alice.headers,{message:'Hello from Alice'});assert.equal(sent.status,201);assert.equal(sent.body.roomId,'muzikaz-main');
  assert.ok((await call(chat+'?roomId=muzikaz-main',bob.headers)).body.messages.some(message=>message.id===sent.body.id));
  assert.equal((await call(chat+'?roomId=another-room',bob.headers)).body.messages.length,0);
  assert.equal((await call(chat,{...bob.headers,'x-muzikaz-session':'chat-alice'},{message:'Not Alice'})).status,403,'cannot use another account presence');
  await authoritativeRooms.store.update('muzikaz-main',room=>{room.simulation.players['account:'+alice.accountId].lastSeen=0;});
  assert.equal((await call(chat,alice.headers,{message:'Stale room'})).status,409);
 }finally{for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);await rm(dir,{recursive:true,force:true});}
});
