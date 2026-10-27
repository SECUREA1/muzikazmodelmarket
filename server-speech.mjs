import {createHash} from 'node:crypto';

const error=(code,message,statusCode=400,retryAfter)=>Object.assign(new Error(message),{code,statusCode,...(retryAfter?{retryAfter}:{})});
const unavailable=()=>error('SPEECH_UNAVAILABLE','Generated voices are not available on this server yet.',503,30);
const definitions=Object.freeze([
 Object.freeze({id:'muzikaz:neural-female',name:'MUZIKAZ Natural Female',gender:'female',lang:'en-US',natural:true,generated:true}),
 Object.freeze({id:'muzikaz:neural-male',name:'MUZIKAZ Natural Male',gender:'male',lang:'en-US',natural:true,generated:true})
]);
let enginePromise;
async function engine(){
 if(!enginePromise)enginePromise=import('./server-neural-voice-engine.mjs').catch(()=>{enginePromise=null;throw unavailable();});
 return enginePromise;
}
async function defaultGenerate(input){return (await engine()).generateNeuralVoice(input);}
async function defaultStatus(){try{return (await engine()).neuralVoiceStatus();}catch{return {available:false,modelReady:false,status:'unavailable'};}}

export function normalizeSpeechRequest(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw error('INVALID_SPEECH_INPUT','Send a speech request object.');
 if(typeof input.text!=='string'||input.text.length>1000)throw error('INVALID_SPEECH_TEXT','Speech text must contain between 1 and 1000 characters.');
 const text=input.text.trim();
 if(!text||text.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text))throw error('INVALID_SPEECH_TEXT','Speech text must contain between 1 and 1000 characters.');
 const voice=definitions.find(item=>item.id===input.voice)?.gender||input.voice;
 if(!['female','male'].includes(voice))throw error('INVALID_SPEECH_VOICE','Choose the female or male generated voice.');
 const speed=input.speed===undefined?1:input.speed;
 if(typeof speed!=='number'||!Number.isFinite(speed)||speed<.9||speed>1.1)throw error('INVALID_SPEECH_SPEED','Speech speed must be between 0.9 and 1.1.');
 return {text,voice,speed};
}

// Validate the binary contract, not perceived voice quality. Never serve a failed
// model's JSON, HTML or incomplete audio as a successful WAV response.
export function validSpeechWav(bytes,maxBytes=12*1024*1024){
 if(!Buffer.isBuffer(bytes)||bytes.length<46||bytes.length>maxBytes||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.readUInt32LE(4)!==bytes.length-8)return false;
 let format=null,dataLength=0,offset=12;
 while(offset+8<=bytes.length){
  const kind=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4),start=offset+8;
  if(start+length>bytes.length)return false;
  if(kind==='fmt '){
   if(length<16)return false;
   format={encoding:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),rate:bytes.readUInt32LE(start+4),byteRate:bytes.readUInt32LE(start+8),alignment:bytes.readUInt16LE(start+12),bits:bytes.readUInt16LE(start+14)};
  }else if(kind==='data')dataLength+=length;
  offset=start+length+(length%2);
 }
 return !!format&&offset===bytes.length&&[1,3].includes(format.encoding)&&[1,2].includes(format.channels)&&format.rate>=8000&&format.rate<=192000&&[8,16,24,32].includes(format.bits)&&(format.encoding!==3||format.bits===32)&&format.alignment===format.channels*format.bits/8&&format.byteRate===format.rate*format.alignment&&dataLength>0&&dataLength%format.alignment===0;
}

export function createSpeechService({generate=defaultGenerate,getStatus=generate===defaultGenerate?defaultStatus:()=>({available:true,modelReady:true,status:'ready'}),now=()=>Date.now(),timeoutMs=60000,maxQueued=3,requestsPerMinute=30,maxCacheEntries=32,maxCacheBytes=12*1024*1024,cacheTtlMs=300000}={}){
 const pending=[],cache=new Map(),rates=new Map();let active=null,cacheBytes=0;
 function checkRateLimit(clientId='unknown'){
  const at=now(),key=String(clientId).slice(0,160);let entry=rates.get(key);
  if(!entry||entry.expires<=at){entry={count:0,expires:at+60000};rates.delete(key);if(rates.size>=2048){for(const[id,value]of rates)if(value.expires<=at)rates.delete(id);if(rates.size>=2048)rates.delete(rates.keys().next().value);}rates.set(key,entry);}
  if(entry.count>=requestsPerMinute)throw error('SPEECH_RATE_LIMIT','Too many speech requests. Try again shortly.',429,Math.max(1,Math.ceil((entry.expires-at)/1000)));
  entry.count++;
 }
 function evict(key){const entry=cache.get(key);if(entry){cacheBytes-=entry.bytes.length;cache.delete(key);}}
 function cached(key){const entry=cache.get(key);if(!entry)return null;if(entry.expires<=now()){evict(key);return null;}cache.delete(key);cache.set(key,entry);return Buffer.from(entry.bytes);}
 function remember(key,bytes){
  if(!maxCacheEntries||bytes.length>maxCacheBytes)return;
  evict(key);cache.set(key,{bytes:Buffer.from(bytes),expires:now()+cacheTtlMs});cacheBytes+=bytes.length;
  while(cache.size>maxCacheEntries||cacheBytes>maxCacheBytes)evict(cache.keys().next().value);
 }
 function finish(task,err,bytes){
  if(task.settled)return;task.settled=true;clearTimeout(task.timer);task.signal?.removeEventListener('abort',task.onAbort);task.input=null;
  if(err)task.reject(err);else task.resolve(Buffer.from(bytes));
 }
 function cancel(task,reason){
  if(task.settled)return;const index=pending.indexOf(task);if(index>=0)pending.splice(index,1);task.controller.abort();finish(task,reason);
 }
 function pump(){
  if(active)return;
  const task=pending.shift();if(!task)return;
  const hit=cached(task.key);if(hit){finish(task,null,hit);pump();return;}
  active=task;
  Promise.resolve().then(()=>task.settled?null:generate({...task.input,signal:task.controller.signal})).then(bytes=>{
   if(task.settled)return;
   if(!validSpeechWav(bytes))throw error('SPEECH_INVALID_AUDIO','Speech generation did not produce valid audio.',503,5);
   remember(task.key,bytes);finish(task,null,bytes);
  }).catch(err=>{
   if(task.settled)return;
   finish(task,err?.code==='SPEECH_UNAVAILABLE'?unavailable():err?.code==='SPEECH_INVALID_AUDIO'?err:error('SPEECH_GENERATION_FAILED','Speech generation is temporarily unavailable.',503,5));
  }).finally(()=>{active=null;pump();});
 }
 return {
  checkRateLimit,
  async voices(){
   let state;try{state=await getStatus();}catch{state={available:false,modelReady:false,status:'unavailable'};}
   const available=state?.available===true,modelReady=state?.modelReady===true;
   return {available,modelReady,status:available&&modelReady?'ready':state?.status==='loading'?'loading':'unavailable',voices:definitions.map(item=>({...item,available,modelReady}))};
  },
  async generate(value,{clientId='unknown',rateChecked=false,signal}={}){
   if(!rateChecked)checkRateLimit(clientId);
   const input=normalizeSpeechRequest(value),key=createHash('sha256').update(JSON.stringify(input)).digest('hex');
   if(signal?.aborted)throw error('SPEECH_ABORTED','Speech request was canceled.',499);
   const hit=cached(key);if(hit)return hit;
   if(active&&pending.length>=maxQueued)throw error('SPEECH_BUSY','Speech is busy. Try again shortly.',503,2);
   return new Promise((resolve,reject)=>{
    const task={input,key,resolve,reject,signal,controller:new AbortController(),settled:false,timer:null,onAbort:null};
    task.onAbort=()=>cancel(task,error('SPEECH_ABORTED','Speech request was canceled.',499));
    signal?.addEventListener('abort',task.onAbort,{once:true});
    task.timer=setTimeout(()=>cancel(task,error('SPEECH_TIMEOUT','Speech generation took too long. Try again shortly.',504,5)),timeoutMs);
    pending.push(task);pump();
   });
  },
  get state(){return {active:active?1:0,queued:pending.length,cached:cache.size,cacheBytes};}
 };
}
