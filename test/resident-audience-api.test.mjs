import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

test('public room HTTP snapshots keep direct resident chats private across GET and compact POST responses',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'resident-audience-api-')),previous={...process.env};let server;
  Object.assign(process.env,{MUZIKAZ_DATA_DIR:directory,MUZIKAZ_USER_DATABASE_FILE:join(directory,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(directory,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(directory,'orders.json'),MUZIKAZ_ACCOUNT_SESSIONS_FILE:join(directory,'account-sessions.json'),MUZIKAZ_GAME_SESSIONS_FILE:join(directory,'game-sessions.json'),MUZIKAZ_AVATAR_UPLOAD_DIR:join(directory,'avatars'),MUZIKAZ_ASSET_UPLOAD_DIR:join(directory,'assets'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(directory,'environments')});
  try{
    const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
    const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server};');
    const modulePath=join(directory,'handler.mjs');await writeFile(modulePath,source);({server}=await import(pathToFileURL(modulePath).href));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
    async function call(path,{body,headers={}}={}){
      const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
      const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
      return {headers:response.headers,data:result.data||result};
    }
    async function login(username){
      const opened=await call('/api/access/free-play',{body:{username,password:'resident-audience-api-password'}});
      const cookie=opened.headers.get('set-cookie').split(';')[0],session=await call('/api/game/room-session',{headers:{cookie}});
      return {cookie,'X-CSRF-Token':session.data.csrfToken};
    }
    const alice=await login('AudienceResidentAlice'),bob=await login('AudienceResidentBob'),path='/api/rooms/public-commons/gameplay';
    let sequence=0;
    const command=async(headers,action,fields={})=>(await call(path,{headers,body:{action,requestId:'audience-'+ ++sequence,...fields}})).data;
    const joined=await command(alice,'join'),selfId=joined.selfId;
    await command(bob,'join');
    const npc=Object.values(joined.actors).find(actor=>actor.resident&&!actor.resident.casino);assert.ok(npc);
    await command(alice,'map-access',{position:{x:npc.position.x,z:npc.position.z}});
    const secret='Only Alice asked about PRIVATE_NOTE_84721';
    const reply=await command(alice,'npc-social',{entityId:npc.id,choice:'question',text:secret});
    assert.ok(reply.players[selfId].npcConversation.conversation.some(line=>line.text===secret));
    const own=(await call(path,{headers:alice})).data;
    assert.ok(own.players[selfId].npcConversation.conversation.some(line=>line.text===secret));
    for(const snapshot of [(await call(path)).data,(await call(path,{headers:bob})).data,await command(bob,'input',{snapshotMode:'compact',input:{}})]){
      assert.equal(snapshot.players[selfId].npcConversation,null);
      assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE_NOTE_84721/);
      assert.ok(!snapshot.transportRadio.some(line=>line.recipients?.includes(selfId)));
      assert.equal(snapshot.actors[npc.id].resident.speech,'');
    }
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
    await rm(directory,{recursive:true,force:true});
  }
});
