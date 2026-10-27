import {fork} from 'node:child_process';
import {statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';

const require=createRequire(import.meta.url),ROOT=fileURLToPath(new URL('.',import.meta.url));
const IDLE_MS=120000,MAX_PENDING=8,MAX_TEXT=1200,MAX_WORKER_JOBS=2;
let worker=null,active=null,terminating=false,idleTimer=null,sequence=0,workerJobs=0,lastMetrics=null;
const queue=[];
function modelPath(){return process.env.MUZIKAZ_SPEECH_MODEL_PATH||join(process.env.MUZIKAZ_SPEECH_MODEL_DIR||join(ROOT,'.speech-models'),'kokoro-v1.0.uint8.onnx');}
function error(code,message){return Object.assign(new Error(message),{code});}
function aborted(){return Object.assign(error('ABORT_ERR','Speech generation was cancelled.'),{name:'AbortError'});}
export function neuralVoiceStatus(){
 let modelReady=false,dependenciesReady=false;
 try{modelReady=statSync(modelPath()).size>10000000;}catch{}
 try{require.resolve('onnxruntime-node');require.resolve('phonemizer');dependenciesReady=true;}catch{}
 const available=modelReady&&dependenciesReady;
 return {available,modelReady,dependenciesReady,status:available?'Local neural voices are ready.':!modelReady?'The local neural voice model is not installed.':'The local neural voice engine dependencies are not installed.'};
}
function clearIdle(){clearTimeout(idleTimer);idleTimer=null;}
async function terminateWorker(){
 clearIdle();const previous=worker;worker=null;
 if(!previous)return;
 previous.ref();previous.channel?.ref();
 terminating=true;
 try{await new Promise(resolve=>{
  if(previous.exitCode!==null||previous.signalCode!==null){resolve();return;}
  const killTimer=setTimeout(()=>previous.kill('SIGKILL'),2000);killTimer.unref();
  previous.once('exit',()=>{clearTimeout(killTimer);resolve();});previous.kill('SIGTERM');
 });}catch{}
 finally{terminating=false;pump();}
}
function settle(job,failure,audio){
 clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.onAbort);
 if(failure)job.reject(failure);else job.resolve(audio);
}
function failure(previous,cause){
 if(worker!==previous)return;
 const job=active;active=null;
 if(job)settle(job,error('SPEECH_GENERATION_FAILED',cause?.message||'The local voice engine stopped.'));
 terminateWorker();
}
function ensureWorker(){
 if(worker)return worker;
 // Native ONNX bindings cannot be safely reloaded after worker_thread teardown.
 // A fork isolates the allocator and gives cancellation a reliable OS boundary.
 const next=fork(fileURLToPath(new URL('./server-neural-voice-worker.mjs',import.meta.url)),[resolve(modelPath())],{execArgv:[],serialization:'advanced',stdio:['ignore','ignore','inherit','ipc']});
 worker=next;workerJobs=0;
 next.on('message',response=>{
  if(worker!==next||!active||response.id!==active.id)return;
  const job=active;active=null;
  if(response.error){settle(job,error('SPEECH_GENERATION_FAILED',response.error));terminateWorker();return;}
  lastMetrics={inferenceMs:response.inferenceMs,rssBytes:response.rssBytes,peakRssBytes:response.peakRssBytes};
  settle(job,null,Buffer.from(response.audio));
  // Native inference allocators can retain shape-specific buffers. A short
  // worker lifetime bounds that memory while keeping HTTP/gameplay responsive.
  if(++workerJobs>=MAX_WORKER_JOBS){terminateWorker();return;}
  if(queue.length)pump();else{next.unref();next.channel?.unref();idleTimer=setTimeout(()=>terminateWorker(),IDLE_MS);idleTimer.unref();}
 });
 next.on('error',cause=>failure(next,cause));
 next.on('exit',code=>{if(worker===next)failure(next,new Error(`The local voice engine exited (${code}).`));});
 return next;
}
function pump(){
 if(active||terminating||!queue.length)return;
 clearIdle();const job=queue.shift();active=job;
 try{const next=ensureWorker();next.ref();next.channel?.ref();next.send({id:job.id,text:job.text,voice:job.voice,speed:job.speed});}
 catch(cause){active=null;settle(job,cause);terminateWorker().finally(pump);}
}
export function generateNeuralVoice({text,voice='female',speed=1,signal}={}){
 if(signal?.aborted)return Promise.reject(aborted());
 if(typeof text!=='string'||!text.trim()||text.length>MAX_TEXT)return Promise.reject(error('SPEECH_TEXT_INVALID',`Speech text must contain 1–${MAX_TEXT} characters.`));
 if(!['female','male'].includes(voice))return Promise.reject(error('SPEECH_VOICE_INVALID','Choose a female or male voice.'));
 if(typeof speed!=='number'||!Number.isFinite(speed)||speed<.9||speed>1.1)return Promise.reject(error('SPEECH_SPEED_INVALID','Speech speed must be between 0.9 and 1.1.'));
 const status=neuralVoiceStatus();if(!status.available)return Promise.reject(error('SPEECH_UNAVAILABLE',status.status));
 if(queue.length>=MAX_PENDING)return Promise.reject(error('SPEECH_QUEUE_FULL','The local voice engine is busy. Try again shortly.'));
 return new Promise((resolve,reject)=>{
  const job={id:++sequence,text:text.trim(),voice,speed,signal,resolve,reject};
  job.onAbort=()=>{
   if(active===job){active=null;settle(job,aborted());terminateWorker();}
   else{const index=queue.indexOf(job);if(index>=0){queue.splice(index,1);settle(job,aborted());}}
  };
  job.timer=setTimeout(()=>{
   if(active===job){active=null;settle(job,error('SPEECH_TIMEOUT','The local voice engine took too long to respond.'));terminateWorker();}
   else{const index=queue.indexOf(job);if(index>=0){queue.splice(index,1);settle(job,error('SPEECH_TIMEOUT','The local voice engine queue took too long.'));}}
  },120000);
  signal?.addEventListener('abort',job.onAbort,{once:true});queue.push(job);pump();
 });
}
export async function shutdownNeuralVoiceEngine(){
 const jobs=[...(active?[active]:[]),...queue];active=null;queue.length=0;
 for(const job of jobs)settle(job,aborted());
 await terminateWorker();
}

export function neuralVoiceMetrics(){return lastMetrics?{...lastMetrics}:null;}
