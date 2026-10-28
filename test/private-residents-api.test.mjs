import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

test('solo resident API protects private conversations without joining or rewarding public rooms',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'private-resident-api-')),previous={...process.env};let server;
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:directory,MUZIKAZ_USER_DATABASE_FILE:join(directory,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(directory,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(directory,'orders.json'),MUZIKAZ_ACCOUNT_SESSIONS_FILE:join(directory,'account-sessions.json'),MUZIKAZ_GAME_SESSIONS_FILE:join(directory,'game-sessions.json'),MUZIKAZ_AVATAR_UPLOAD_DIR:join(directory,'avatars'),MUZIKAZ_ASSET_UPLOAD_DIR:join(directory,'assets'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(directory,'environments')});
 try{
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server};');
  const modulePath=join(directory,'handler.mjs');await writeFile(modulePath,source);({server}=await import(pathToFileURL(modulePath).href));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  async function call(path,{body,headers={}}={}){
   const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
   return {status:response.status,headers:response.headers,body:await response.json()};
  }
  async function login(username){
   const opened=await call('/api/access/free-play',{body:{username,password:'private-residents-api-password'}});assert.equal(opened.status,200,opened.body.message);
   const cookie=opened.headers.get('set-cookie').split(';')[0],session=await call('/api/game/room-session',{headers:{cookie}});assert.equal(session.status,200,JSON.stringify(session.body));
   return {cookie,'X-CSRF-Token':session.body.data.csrfToken};
  }
  const path='/api/rooms/tropical-island/residents',joinBody={action:'join',position:{x:0,y:.38,z:24}};
  assert.equal((await call(path,{body:joinBody})).status,401);
  const alice=await login('PrivateResidentAlice'),bob=await login('PrivateResidentBob');
  const noCsrf=await call(path,{headers:{cookie:alice.cookie},body:joinBody});assert.equal(noCsrf.status,401);assert.equal(noCsrf.body.code,'CSRF_INVALID');
  const opened=await call(path,{headers:alice,body:joinBody});assert.equal(opened.status,200,JSON.stringify(opened.body));
  const first=opened.body.data;assert.equal(first.private,true);assert.equal(first.authoritative,false);assert.deepEqual(Object.keys(first.players),[first.selfId]);
  const npc=Object.values(first.actors).find(actor=>actor.resident);assert.ok(npc,'The actual Island catalog map should spawn residents in solo play');
  const walletBefore=(await call('/api/economy',{headers:alice})).body.data.balance;
  const publicBefore=await call('/api/rooms/tropical-island/gameplay');assert.equal(publicBefore.status,200);
  assert.equal(Object.keys(publicBefore.body.data.players).length,0,'A private resident join must not add the player to the public room');
  const reply=await call(path,{headers:alice,body:{action:'npc-social',position:npc.position,entityId:npc.id,choice:'question',text:'Where am I?'}});assert.equal(reply.status,200,JSON.stringify(reply.body));
  const conversation=reply.body.data.players[first.selfId].npcConversation;assert.equal(conversation.type,'resident');
  assert.ok(conversation.conversation.some(line=>line.role!=='player'&&line.text.length>20));
  assert.ok(conversation.conversation.every(line=>line.recipients.includes(first.selfId)));
  const other=await call(path,{headers:bob,body:{...joinBody,accountId:first.selfId.slice(5)}});assert.equal(other.status,200);
  assert.notEqual(other.body.data.selfId,first.selfId);assert.ok(!other.body.data.players[first.selfId]);
  assert.equal(other.body.data.transportRadio.length,0,'Another player must not hear this private reply');
  assert.ok(!other.body.data.players[other.body.data.selfId].npcConversation);
  const invalid=await call(path,{headers:alice,body:{action:'input',position:{x:0,z:0}}});assert.equal(invalid.status,400);
  const unavailable=await call('/api/rooms/nonexistent-private-map/residents',{headers:alice,body:joinBody});assert.equal(unavailable.status,404);
  const publicAfter=await call('/api/rooms/tropical-island/gameplay');assert.equal(Object.keys(publicAfter.body.data.players).length,0);
  assert.equal((await call('/api/economy',{headers:alice})).body.data.balance,walletBefore,'Solo NPC interaction must not grant or spend persistent funds');
  const closed=await call(path,{headers:alice,body:{action:'leave'}});assert.equal(closed.status,200);assert.equal(closed.body.data.closed,true);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
  await rm(directory,{recursive:true,force:true});
 }
});
