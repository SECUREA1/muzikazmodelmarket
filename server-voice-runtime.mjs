import {execFile} from 'node:child_process';
import {statSync} from 'node:fs';
import {access,mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const ROOT=fileURLToPath(new URL('.',import.meta.url)),MODEL='kokoro-v1.0.uint8.onnx';
const runFile=promisify(execFile);
const VALIDATE_DEPENDENCIES=`
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
const require=createRequire(join(process.cwd(),'package.json'));
for(const [name,version] of Object.entries({'onnxruntime-node':'1.23.2',phonemizer:'1.2.1'})){
 let folder=dirname(require.resolve(name)),metadata=null;
 for(;;){try{const candidate=JSON.parse(readFileSync(join(folder,'package.json'),'utf8'));if(candidate.name===name){metadata=candidate;break;}}catch{}const parent=dirname(folder);if(parent===folder)break;folder=parent;}
 if(metadata?.version!==version)throw Error('The installed voice package version does not match the pinned release.');
 await import(name);
}
`;
const failure=(message='The voice engine is not available yet.',retryAfter=30)=>Object.assign(new Error(message),{code:'SPEECH_UNAVAILABLE',retryAfter});
const aborted=()=>Object.assign(new Error('Voice preparation wait was canceled.'),{code:'ABORT_ERR',name:'AbortError'});
const modelExists=path=>{try{return statSync(path).isFile()&&statSync(path).size>10000000;}catch{return false;}};

// Keep the web server available while repairing older cargo-only deployments.
// Preparation is shared: a browser leaving must not cancel another player's
// install, and the next request can retry after a failed host/download attempt.
export function createVoiceRuntime({root=ROOT,env=process.env,now=()=>Date.now(),run=runFile,probe,validate,prepareDirectory,backoffMs=30000,logger=console}={}){
 const require=createRequire(join(root,'package.json'));
 const explicit=!!(env.MUZIKAZ_SPEECH_MODEL_PATH||env.MUZIKAZ_SPEECH_MODEL_DIR);
 const builtModel=join(root,'.speech-models',MODEL);
 const durableModel=env.MUZIKAZ_DATA_DIR?join(resolve(env.MUZIKAZ_DATA_DIR),'voices',MODEL):builtModel;
 let selected=resolve(env.MUZIKAZ_SPEECH_MODEL_PATH|| (env.MUZIKAZ_SPEECH_MODEL_DIR?join(env.MUZIKAZ_SPEECH_MODEL_DIR,MODEL):modelExists(durableModel)?durableModel:modelExists(builtModel)?builtModel:durableModel));
 const enabled=env.MUZIKAZ_VOICE_AUTO_INSTALL==='1'||env.MUZIKAZ_VOICE_AUTO_INSTALL!=='0'&&!env.NODE_TEST_CONTEXT;
 const inspect=probe||((path)=>{
  let dependenciesReady=false;
  try{require.resolve('onnxruntime-node');require.resolve('phonemizer');dependenciesReady=true;}catch{}
  return {modelReady:modelExists(path),dependenciesReady};
 });
 const writable=prepareDirectory|| (async path=>{await mkdir(path,{recursive:true});await access(path,constants.W_OK);});
 // An injected probe is trusted by unit fixtures unless they inject validation
 // too. Production always loads the actual pinned packages in a disposable
 // child: resolving an entry alone cannot prove its native CPU addon works.
 const checkDependencies=validate||(probe?async()=>{}:()=>runFile(process.execPath,['--input-type=module','--eval',VALIDATE_DEPENDENCIES],{cwd:root,env:{...env,ONNXRUNTIME_NODE_INSTALL:'skip'},timeout:15000,killSignal:'SIGKILL',maxBuffer:256*1024}));
 let validated=!!probe&&!validate,running=null,phase='',retryAt=0,failures=0,lastFailure=null,failedStep=null;
 function status(){
  const observed=inspect(selected),available=observed.modelReady===true&&observed.dependenciesReady===true&&validated&&!failedStep&&(!running||phase==='ready');
  return {available,modelReady:observed.modelReady===true,dependenciesReady:observed.dependenciesReady===true,
   status:available?'ready':running?'loading':'unavailable',
   message:available?'Generated voices are ready.':running?phase==='dependencies'?'Installing the voice engine.':phase==='model'?'Preparing generated voices.':phase==='validating'?'Checking the voice engine.':'Starting the voice engine.':lastFailure?'Voice preparation will retry shortly.':!validated&&observed.dependenciesReady?'The installed voice engine is waiting to be checked.':!enabled?'Automatic voice preparation is disabled.':'The voice engine is waiting to be prepared.',
   ...(retryAt>now()?{retryAfter:Math.max(1,Math.ceil((retryAt-now())/1000))}:{})};
 }
 async function provision(){
  if(running)return running;
  if(status().available)return status();
  if(!enabled&&(!inspect(selected).modelReady||!inspect(selected).dependenciesReady))throw failure('Automatic voice preparation is disabled.');
  if(retryAt>now())throw failure('Voice preparation will retry shortly.',Math.max(1,Math.ceil((retryAt-now())/1000)));
  phase='starting';
  running=Promise.resolve().then(async()=>{
   if(inspect(selected).dependenciesReady&&!validated){
    phase='validating';
    try{await checkDependencies();validated=true;}catch{validated=false;failedStep='dependencies';}
   }
   if(!inspect(selected).dependenciesReady||failedStep==='dependencies'){
    if(!enabled)throw failure('Automatic voice preparation is disabled.');
    phase='dependencies';
    await run(process.platform==='win32'?'npm.cmd':'npm',['ci','--omit=dev','--no-audit','--no-fund'],{cwd:root,env:{...env,ONNXRUNTIME_NODE_INSTALL:'skip'},timeout:120000,killSignal:'SIGKILL',maxBuffer:512*1024});
    if(!inspect(selected).dependenciesReady)throw failure('The voice dependencies could not be installed.');
    phase='validating';await checkDependencies();validated=true;
   }
   if(!inspect(selected).modelReady||failedStep==='model'){
    if(!enabled)throw failure('Automatic voice preparation is disabled.');
    phase='model';
    try{await writable(dirname(selected));}catch(error){if(explicit||selected===builtModel)throw error;selected=builtModel;await writable(dirname(selected));}
    await run(process.execPath,[join(root,'scripts','prepare-neural-voices.mjs'),'--optional'],{cwd:root,env:{...env,MUZIKAZ_SPEECH_MODEL_PATH:selected,MUZIKAZ_SPEECH_MODEL_DIR:dirname(selected),ONNXRUNTIME_NODE_INSTALL:'skip'},timeout:75000,killSignal:'SIGKILL',maxBuffer:512*1024});
    if(!inspect(selected).modelReady)throw failure('The generated voice model could not be prepared.');
   }
   failures=0;retryAt=0;lastFailure=null;failedStep=null;phase='ready';return status();
  }).catch(error=>{
   failedStep=phase==='validating'?'dependencies':phase;if(failedStep==='dependencies')validated=false;lastFailure=error?.code||'PREPARATION_FAILED';retryAt=now()+Math.min(300000,backoffMs*2**Math.min(failures++,4));
   logger?.warn?.('[Neural voices] Preparation is unavailable; the next voice request can retry.');
   throw failure('Generated voices are being prepared. Try again shortly.',Math.max(1,Math.ceil((retryAt-now())/1000)));
  }).finally(()=>{running=null;phase='';});
  // Startup and canceled callers may have no remaining waiter. Keep the shared
  // preparation rejection handled without suppressing errors for active callers.
  running.catch(()=>{});return running;
 }
 function wait(promise,signal){
  if(!signal)return promise;
  if(signal.aborted)return Promise.reject(aborted());
  return new Promise((resolveWait,reject)=>{
   const stop=()=>{signal.removeEventListener('abort',stop);reject(aborted());};
   signal.addEventListener('abort',stop,{once:true});
   promise.then(value=>{signal.removeEventListener('abort',stop);resolveWait(value);},error=>{signal.removeEventListener('abort',stop);reject(error);});
  });
 }
 return {status,start:provision,ensure({signal}={}){if(signal?.aborted)return Promise.reject(aborted());return wait(provision(),signal);},get modelPath(){return selected;}};
}

let shared,configuration;
function runtime(){
 const key=JSON.stringify([process.env.MUZIKAZ_SPEECH_MODEL_PATH,process.env.MUZIKAZ_SPEECH_MODEL_DIR,process.env.MUZIKAZ_DATA_DIR,process.env.MUZIKAZ_VOICE_AUTO_INSTALL,process.env.NODE_TEST_CONTEXT]);
 if(!shared||configuration!==key){configuration=key;shared=createVoiceRuntime();}
 return shared;
}
export const voiceRuntimeStatus=()=>runtime().status();
export const voiceRuntimeModelPath=()=>runtime().modelPath;
export const startVoiceRuntime=()=>runtime().start();
export const ensureVoiceRuntime=options=>runtime().ensure(options);
