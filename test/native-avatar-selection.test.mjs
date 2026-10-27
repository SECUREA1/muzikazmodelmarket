import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('owned native clown avatars equip from Backpack, persist and project the server choice without accepting another item or client model', {timeout:45000}, async t=>{
 const directory=await mkdtemp(join(tmpdir(),'native-avatar-'));
 const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const base='http://127.0.0.1:'+port;let child,errors='';
 const start=async()=>{
  child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),MUZIKAZ_DATA_DIR:directory,MUZIKAZ_USER_DATABASE_FILE:join(directory,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(directory,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(directory,'orders.json')},stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',chunk=>errors=(errors+chunk).slice(-4000));
  for(let attempt=0;attempt<100;attempt++){if(child.exitCode!==null)throw Error(errors);try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}
  throw Error('Avatar server failed to start: '+errors);
 };
 const stop=async()=>{if(child&&child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}};
 t.after(async()=>{await stop();await rm(directory,{recursive:true,force:true});});await start();
 const request=async(path,{method='GET',headers={},body}={})=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return {response,...await response.json()};};
 const login=await request('/api/access/free-play',{method:'POST',body:{username:'ClownAvatarBuyer',password:'native-clown-avatar-test'}});
 assert.equal(login.response.status,200,login.message);
 const headers={Cookie:login.response.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrfToken};
 const post=(path,body)=>request(path,{method:'POST',headers,body}),put=(path,body)=>request(path,{method:'PUT',headers,body});
 const avatarId='economy:native:funhouse-ringmaster-avatar';
 assert.equal((await put('/api/avatar-selection',{avatarId})).response.status,409,'a displayed catalog character is not owned');
 assert.equal((await put('/api/profile/avatar',{assetId:avatarId})).response.status,403,'profile selection checks ownership');
 for(const id of ['funhouse-ringmaster-avatar','funhouse-water-gun']){
  const buy=await post('/api/economy/buy',{sku:'native:'+id,requestId:'native-avatar-buy-'+id});assert.equal(buy.response.status,200,buy.message);
 }
 const prop=await put('/api/avatar-selection',{avatarId:'economy:native:funhouse-water-gun'});assert.equal(prop.response.status,409,'a native tool is not an avatar');
 const use=await post('/api/backpack/use',{itemId:avatarId});assert.equal(use.response.status,200,use.message);assert.equal(use.data.action,'avatar');
 let profile=await request('/api/profile/avatar',{headers});assert.equal(profile.data.valid,true);assert.equal(profile.data.profile.buildAssetId,'funhouse-ringmaster-avatar');assert.equal(profile.data.profile.modelUrl,null);
 const options=(await request('/api/avatar-options',{headers})).data;
 assert.ok(options.some(item=>item.id===avatarId&&item.buildAssetId==='funhouse-ringmaster-avatar'));
 assert.ok(!options.some(item=>item.buildAssetId==='funhouse-scare-clown-avatar'),'unowned native avatars are absent from selection');
 const joined=await post('/api/rooms/public-commons/gameplay',{action:'join',requestId:'native-avatar-join'});assert.equal(joined.response.status,200,joined.message);
 const self=joined.data.players[joined.data.selfId];assert.equal(self.avatarBuildAssetId,'funhouse-ringmaster-avatar');assert.equal(self.modelUrl,null);
 const forged=await post('/api/rooms/public-commons/gameplay',{action:'input',requestId:'native-avatar-input',input:{avatarBuildAssetId:'funhouse-scare-clown-avatar',modelUrl:'/unapproved.glb'}});
 assert.equal(forged.data.players[forged.data.selfId].avatarBuildAssetId,'funhouse-ringmaster-avatar');
 // A prior legacy profile cannot override a later Backpack avatar selection.
 assert.equal((await put('/api/profile/avatar',{assetId:'starter-avatar'})).response.status,200);
 assert.equal((await post('/api/backpack/use',{itemId:avatarId})).data.action,'avatar');
 assert.equal((await request('/api/profile/avatar',{headers})).data.profile.buildAssetId,'funhouse-ringmaster-avatar');
 const selected=await put('/api/avatar-selection',{avatarId});assert.equal(selected.response.status,200,selected.message);
 await stop();await start();
 profile=await request('/api/profile/avatar',{headers});assert.equal(profile.data.valid,true);assert.equal(profile.data.profile.buildAssetId,'funhouse-ringmaster-avatar','native choice survives service restart');
 assert.equal((await request('/api/account',{headers})).data.selectedAvatarId,avatarId);
 assert.equal((await put('/api/account/avatar',{avatarId:'starter-avatar'})).response.status,200);
 const legacy=await post('/api/rooms/public-commons/gameplay',{action:'join',requestId:'legacy-avatar-join'});assert.equal(legacy.response.status,200,legacy.message);assert.equal(legacy.data.players[legacy.data.selfId].avatarBuildAssetId,null);assert.match(legacy.data.players[legacy.data.selfId].modelUrl,/\.glb$/i);
});
