import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

function wav(){
 const result=Buffer.alloc(300);result.write('RIFF');result.writeUInt32LE(292,4);result.write('WAVEfmt ',8);result.writeUInt32LE(16,16);result.writeUInt16LE(1,20);result.writeUInt16LE(1,22);result.writeUInt32LE(24000,24);result.writeUInt32LE(48000,28);result.writeUInt16LE(2,32);result.writeUInt16LE(16,34);result.write('data',36);result.writeUInt32LE(256,40);return result;
}

test('public speech API lists generated voices and returns private WAV with bounded JSON and rate limits',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'speech-api-')),oldEnv={...process.env};let server;
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json'),MUZIKAZ_AVATAR_UPLOAD_DIR:join(dir,'avatar-uploads'),MUZIKAZ_ASSET_UPLOAD_DIR:join(dir,'asset-uploads'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(dir,'environment-uploads')});
 try{
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  // Inject only model generation; actual HTTP routing, CORS, limits and WAV
  // validation are production code. PCM transport fixture makes no quality claim.
  const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`)
   .replace('const speechService = createSpeechService();',`const speechService = createSpeechService({generate:async({text})=>text==='Broken output'?Buffer.from('model failure'):Buffer.from('${wav().toString('base64')}','base64')});`)
   .replace(/server\.listen\(port,[^\n]+\);/,'export { server };');
  const modulePath=join(dir,'handler.mjs');await writeFile(modulePath,source);({server}=await import(pathToFileURL(modulePath).href));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  const post=(body,headers={})=>fetch(base+'/api/speech',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  const voicesResponse=await fetch(base+'/api/speech/voices'),voices=(await voicesResponse.json()).data;
  assert.equal(voicesResponse.status,200);assert.equal(voices.available,true);assert.equal(voices.modelReady,true);assert.equal(voices.voices.length,2);assert.equal(voices.voices[1].id,'muzikaz:neural-male');
  for(let index=0;index<40;index++){const state=await fetch(base+'/api/speech/voices');assert.equal(state.status,200);await state.arrayBuffer();}
  const audio=await post({text:'Public welcome',voice:'muzikaz:neural-female'});assert.equal(audio.status,200);assert.equal(audio.headers.get('content-type'),'audio/wav');assert.equal(audio.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await audio.arrayBuffer()),wav());
  const cors=await post({text:'Welcome',voice:'male'},{Origin:'http://localhost:4173'});assert.equal(cors.status,200);assert.equal(cors.headers.get('access-control-allow-origin'),'http://localhost:4173');await cors.arrayBuffer();
  const denied=await post({text:'Welcome',voice:'male'},{Origin:'https://untrusted.example'});assert.equal(denied.status,403);await denied.arrayBuffer();
  const invalid=await post({text:'x'.repeat(1001),voice:'female'});assert.equal(invalid.status,400);assert.equal((await invalid.json()).code,'INVALID_SPEECH_TEXT');
  const type=await post('Hello',{'Content-Type':'text/plain'});assert.equal(type.status,415);await type.arrayBuffer();
  const malformed=await post('{broken');assert.equal(malformed.status,400);await malformed.arrayBuffer();
  const big=await post({text:'a'.repeat(9000),voice:'male'});assert.equal(big.status,413);await big.arrayBuffer();
  const broken=await post({text:'Broken output',voice:'female'});assert.equal(broken.status,503);assert.equal((await broken.json()).code,'SPEECH_INVALID_AUDIO');assert.equal(broken.headers.get('retry-after'),'5');
  let limited;
  for(let index=0;index<31;index++){const response=await post({text:'Public welcome',voice:'female'});await response.arrayBuffer();if(response.status===429){limited=response;break;}}
  assert.ok(limited);assert.ok(Number(limited.headers.get('retry-after'))>0);
  const spoofed=await post({text:'Public welcome',voice:'female'},{'X-User-Id':'another-player','X-Forwarded-For':'192.0.2.10'});assert.equal(spoofed.status,429);await spoofed.arrayBuffer();
  async function player(username){
   const response=await fetch(base+'/api/access/free-play',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'speech-isolation-test-password'})});
   assert.equal(response.status,200);await response.arrayBuffer();return response.headers.get('set-cookie').split(';')[0];
  }
  const firstPlayer=await player('SpeechPlayerOne'),secondPlayer=await player('SpeechPlayerTwo');
  for(let index=0;index<30;index++){const line=await post({text:'Public welcome',voice:'female'},{Cookie:firstPlayer});assert.equal(line.status,200,'A player must not inherit the hosting proxy or another player speech quota');await line.arrayBuffer();}
  const playerLimit=await post({text:'Public welcome',voice:'female'},{Cookie:firstPlayer});assert.equal(playerLimit.status,429);await playerLimit.arrayBuffer();
  const otherPlayer=await post({text:'Public welcome',voice:'female'},{Cookie:secondPlayer});assert.equal(otherPlayer.status,200,'A second account behind the same proxy must still speak');await otherPlayer.arrayBuffer();
 }finally{if(server)await new Promise(resolve=>server.close(resolve));process.env=oldEnv;await rm(dir,{recursive:true,force:true});}
});
