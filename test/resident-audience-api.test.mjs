import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hydrateRoomSnapshot,snapshotAcknowledgements} from '../public/js/room-snapshot.js';

test('public gameplay and builder HTTP responses keep direct resident chats private across viewers and protocol2 reuse',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'resident-audience-api-')),previous={...process.env};let server;
  Object.assign(process.env,{MUZIKAZ_DATA_DIR:directory,MUZIKAZ_USER_DATABASE_FILE:join(directory,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(directory,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(directory,'orders.json'),MUZIKAZ_ACCOUNT_SESSIONS_FILE:join(directory,'account-sessions.json'),MUZIKAZ_GAME_SESSIONS_FILE:join(directory,'game-sessions.json'),MUZIKAZ_AVATAR_UPLOAD_DIR:join(directory,'avatars'),MUZIKAZ_ASSET_UPLOAD_DIR:join(directory,'assets'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(directory,'environments')});
  try{
    const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
    const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server,authoritativeRooms,sharedRooms};');
    const modulePath=join(directory,'handler.mjs');await writeFile(modulePath,source);const runtime=await import(pathToFileURL(modulePath).href);({server}=runtime);
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
    const fixedTime=Date.now();runtime.authoritativeRooms.now=()=>fixedTime;
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
    const protocol2=previous=>({snapshotMode:'compact',snapshotProtocol:2,snapshotDecorActors:true,
      sceneVersion:joined.sceneVersion,snapshotAcknowledgements:snapshotAcknowledgements(previous),input:{}});
    const alicePacket=await command(alice,'input',protocol2());
    assert.equal(alicePacket.snapshotProtocol,2);
    assert.ok(alicePacket.snapshotRevisions['@actorMetadata']);
    assert.ok(alicePacket.snapshotRevisions.transportRadio,'private dialogue exercises reusable radio components');
    const aliceBaseline=hydrateRoomSnapshot(alicePacket);
    assert.ok(aliceBaseline.players[selfId].npcConversation.conversation.some(line=>line.text===secret));
    const bobPacket=await command(bob,'input',protocol2());
    assert.equal(bobPacket.snapshotProtocol,2);
    assert.notEqual(bobPacket.snapshotRevisions.transportRadio,alicePacket.snapshotRevisions.transportRadio,
      'component revisions must describe each viewer\'s filtered content, not the private canonical radio');
    let bobBaseline=hydrateRoomSnapshot(bobPacket);
    const bobAgain=await command(bob,'input',protocol2(bobBaseline));
    assert.ok(bobAgain.snapshotUnchanged.includes('@actorMetadata'),'exercise acknowledged metadata reuse');
    assert.equal(bobAgain.snapshotActorMetadata,undefined);
    bobBaseline=hydrateRoomSnapshot(bobAgain,bobBaseline);
    for(const snapshot of [bobPacket,bobAgain,bobBaseline]){
      assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE_NOTE_84721/);
      assert.equal(snapshot.players[selfId].npcConversation,null);
      assert.equal(snapshot.actors[npc.id].resident.speech,'');
    }
    const aliceAgain=hydrateRoomSnapshot(await command(alice,'input',protocol2(aliceBaseline)),aliceBaseline);
    assert.ok(aliceAgain.players[selfId].npcConversation.conversation.some(line=>line.text===secret),
      'another viewer\'s cached components must not erase the addressed player\'s conversation');
    const bobId=bobPacket.selfId,objectsPath=path.replace(/gameplay$/,'objects'),buildingPath=path.replace(/gameplay$/,'building');
    const memoryKey='public-commons|'+npc.id;
    await runtime.sharedRooms.update('public-commons',room=>{
      const player=room.simulation.players[selfId],memory={...player.residentSocial?.[memoryKey],lastPlayerMessage:secret};
      player.residentSocial={...player.residentSocial,[memoryKey]:memory};
      player.residentContinuity={...player.residentContinuity,contacts:{...player.residentContinuity?.contacts,[memoryKey]:memory}};
      player.residentPreferences={...player.residentPreferences,interest:secret};
      player.casinoSocial={...player.casinoSocial,[npc.id]:memory};
      room.building={enabled:true,hostId:selfId};
      for(const [id,ownerId]of [['owned-alice',selfId],['owned-bob',bobId]])room.objects[id]={id,ownerId,revision:1,materialId:'studs',position:[0,.5,0],rotation:[0,0,0],scale:[1,1,1]};
    });
    const stored=(await runtime.sharedRooms.get('public-commons')).simulation.players[selfId];
    function assertRoomAudience(room,owner){
      const player=room.simulation.players[selfId];
      assert.ok(room.simulation.actors[npc.id],'privacy filtering keeps the shared actors');
      assert.equal(room.objects['owned-alice'].ownerId,selfId);
      assert.equal(room.objects['owned-bob'].ownerId,bobId);
      if(owner){
        assert.ok(player.npcConversation.conversation.some(line=>line.text===secret));
        for(const field of ['residentContinuity','residentSocial','residentPreferences','casinoSocial'])assert.deepEqual(player[field],stored[field]);
      }else{
        assert.equal(player.npcConversation,null);
        assert.equal(room.simulation.actors[npc.id].resident.speech,'');
        assert.doesNotMatch(JSON.stringify(room),/PRIVATE_NOTE_84721/);
      }
    }
    for(const [headers,owner]of [[{},false],[bob,false],[alice,true]])assertRoomAudience((await call(objectsPath,{headers})).data,owner);
    for(const [headers,id,owner]of [[alice,'owned-alice',true],[bob,'owned-bob',false]]){
      const room=(await call(objectsPath,{headers,body:{action:'delete',id,revision:1}})).data;
      assertRoomAudience(room,owner);assert.equal(room.objects[id].deleted,true);
    }
    const aliceBuilding=(await call(buildingPath,{headers:alice,body:{enabled:true}})).data;
    assertRoomAudience(aliceBuilding,true);assert.equal(aliceBuilding.building.hostId,selfId);
    await runtime.sharedRooms.update('public-commons',room=>{room.building.hostId=bobId;});
    const bobBuilding=(await call(buildingPath,{headers:bob,body:{enabled:false}})).data;
    assertRoomAudience(bobBuilding,false);assert.equal(bobBuilding.building.enabled,false);assert.equal(bobBuilding.building.hostId,bobId);
    const persisted=(await runtime.sharedRooms.get('public-commons')).simulation.players[selfId];
    assert.ok(persisted.npcConversation.conversation.some(line=>line.text===secret));
    for(const field of ['residentContinuity','residentSocial','residentPreferences','casinoSocial'])assert.deepEqual(persisted[field],stored[field],
      'HTTP audience projection must not erase the saved owner\'s personal dialogue');
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
    await rm(directory,{recursive:true,force:true});
  }
});
