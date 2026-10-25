import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';

test('audio settings persist independently for the signed-in member',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'player-audio-settings-')),oldEnv={...process.env};
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json'),MUZIKAZ_AVATAR_UPLOAD_DIR:join(dir,'avatar-uploads'),MUZIKAZ_ASSET_UPLOAD_DIR:join(dir,'asset-uploads'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(dir,'environment-uploads')});
 try{
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export { server };');
  const modulePath=join(dir,'handler.mjs');await writeFile(modulePath,source);const {server}=await import(pathToFileURL(modulePath).href),handler=server.listeners('request')[0];
  async function call(url,headers={},body,method=body?'POST':'GET'){
   const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url,method,headers:{host:'localhost','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});
   const result={headers:{}};const res={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,headers){result.status=status;for(const[key,value]of Object.entries(headers))this.setHeader(key,value);this.headersSent=true;},end(data){result.body=JSON.parse(data);}};
   await handler(req,res);return result;
  }
  const login=await call('/api/access/free-play',{}, {username:'AudioSettingsPlayer',password:'audio-settings-test'});assert.equal(login.status,200);
  const cookie={cookie:login.headers['set-cookie'].split(';')[0]},session=await call('/api/market/session',cookie),headers={...cookie,'x-csrf-token':session.body.data.csrfToken};
  const audio={masterMuted:false,introductionMuted:true,announcementsMuted:true,dialogueMuted:false,effectsMuted:true,mediaMuted:true,spatialAudio:false,effectsVolume:63};
  assert.equal((await call('/api/player/settings',headers,{settings:audio},'PUT')).status,200);
  const restored=(await call('/api/player/settings',cookie)).body.data.settings;
  for(const [key,value]of Object.entries(audio))assert.equal(restored[key],value,key);
  assert.equal((await call('/api/player/settings',cookie,{settings:{masterMuted:true}},'PUT')).body.code,'CSRF_INVALID');
  assert.equal((await call('/api/player/settings',cookie)).body.data.settings.masterMuted,false);
  const second=await call('/api/access/free-play',{}, {username:'OtherAudioPlayer',password:'other-audio-settings-test'});assert.equal(second.status,200);
  const defaults=(await call('/api/player/settings',{authorization:'Bearer '+second.body.data.sessionToken})).body.data.settings;
  for(const key of ['masterMuted','introductionMuted','announcementsMuted','dialogueMuted','effectsMuted','mediaMuted'])assert.equal(defaults[key],false);
  assert.equal(defaults.spatialAudio,true);assert.equal(defaults.effectsVolume,100);
 }finally{process.env=oldEnv;await rm(dir,{recursive:true,force:true});}
});
