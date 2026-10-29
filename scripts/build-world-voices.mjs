import {mkdir,readFile,writeFile,rm,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile,fork} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {worldGuideIntroduction} from '../public/js/world-guide.js';
import {prepareSpeechText} from '../public/js/character-voice-profile.js';
import {splitBundledSpeech,bundledVoiceId,BUNDLED_PREVIEW_TEXT} from '../public/js/bundled-character-voices.js';
import {WORLD_DISTRICTS,districtMapId} from '../world-districts.mjs';
import {ensureVoiceRuntime} from '../server-voice-runtime.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),directory=resolve(root,'public/audio/voices/world'),manifestPath=join(directory,'manifest.json'),run=promisify(execFile),sha=value=>createHash('sha256').update(value).digest('hex');
function duration(bytes){return (bytes.length-44)/48000;}
async function replaceText(path,value){
 try{if(await readFile(path,'utf8')===value)return;}catch{}
 await writeFile(path+'.tmp',value);await rename(path+'.tmp',path);
}
async function render(clip){
 const {generateNeuralVoice,neuralVoiceStatus}=await import('../server-neural-voice-engine.mjs');
 await ensureVoiceRuntime();
 const state=neuralVoiceStatus();if(!state.available)throw Error(state.status+' Run npm run build:voices before recording.');
 const bytes=await generateNeuralVoice({text:clip.text,voice:clip.voice,speed:1}),target=join(root,clip.url),raw=target+'.raw.wav',temporary=target+'.tmp.mp3';
 try{
  await writeFile(raw,bytes);
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-ar','24000','-ac','1','-c:a','libmp3lame','-b:a','64k',temporary],{maxBuffer:1024*1024});
  await rename(temporary,target);
 }finally{await rm(raw,{force:true});await rm(temporary,{force:true});}
 const compressed=await readFile(target);
 return {...clip,durationMs:Math.round(duration(bytes)*1000),bytes:compressed.length,sha256:sha(compressed)};
}
async function childMain(){
 const {shutdownNeuralVoiceEngine}=await import('../server-neural-voice-engine.mjs');
 let stopping=false;
 process.on('message',async message=>{if(stopping)return;if(message.stop){stopping=true;await shutdownNeuralVoiceEngine();if(process.connected)process.disconnect();return;}try{process.send({id:message.id,clip:await render(message.clip)});}catch(error){if(process.connected)process.send({id:message.id,error:error.stack||error.message});}});
 process.on('disconnect',()=>{shutdownNeuralVoiceEngine().finally(()=>process.exit());});
}
export async function buildVoicePreviews({force=false}={}){
 const path=join(root,'public/audio/voices/preview-manifest.json');
 let previous={clips:[]};try{previous=JSON.parse(await readFile(path,'utf8'));}catch{}
 const clips=[];
 try{
  for(const voice of ['female','male']){
   const signature=sha(JSON.stringify([BUNDLED_PREVIEW_TEXT,voice,1,'kokoro-native-wav-v1'])),old=previous.clips.find(clip=>clip.voice===voice),url='/public/audio/voices/'+voice+'-preview.wav',target=join(root,url);
   if(!force&&old?.signature===signature){try{if(sha(await readFile(target))===old.sha256){clips.push(old);continue;}}catch{}}
   const {generateNeuralVoice}=await import('../server-neural-voice-engine.mjs'),audio=await generateNeuralVoice({text:BUNDLED_PREVIEW_TEXT,voice,speed:1});
   await writeFile(target+'.tmp',audio);await rename(target+'.tmp',target);
   clips.push({voice,text:BUNDLED_PREVIEW_TEXT,url,speed:1,bytes:audio.length,durationMs:Math.round(duration(audio)*1000),sha256:sha(audio),signature});
  }
  await replaceText(path,JSON.stringify({generator:'Kokoro-82M v1.0 local neural voice engine',format:'PCM16, mono 24 kHz, native pitch and no reverberation',clips},null,2)+'\n');
 }finally{const {shutdownNeuralVoiceEngine}=await import('../server-neural-voice-engine.mjs');await shutdownNeuralVoiceEngine();}
 return clips;
}
export async function buildWorldVoices({force=false,concurrency=3}={}){
 await mkdir(directory,{recursive:true});
 const authored=JSON.parse(await readFile(join(root,'public/models/environments/environments.json'),'utf8'));
 const publicDestinations=[{id:'public-commons',name:'Public Commons'},...WORLD_DISTRICTS.map(region=>({id:districtMapId(region.id),name:region.name,builderScene:{layoutMeta:region.id==='neon-docks'?{harbor:true}:{}}}))];
 const environments=[...authored,...publicDestinations];
 const texts=new Set();
 for(const environment of [...environments,{}])for(const solo of [false,true])for(const text of splitBundledSpeech(prepareSpeechText(worldGuideIntroduction(environment,{solo}))))texts.add(text);
 const sorted=[...texts].sort(),ids=new Map();for(const text of sorted){const id=bundledVoiceId(text);if(ids.has(id)&&ids.get(id)!==text)throw Error('Voice sentence identifier collision');ids.set(id,text);}
 const helper=join(root,'public/js/bundled-character-voices.js'),source=await readFile(helper,'utf8');
 await replaceText(helper,source.replace(/export const BUNDLED_VOICE_TEXTS=Object\.freeze\(\[[\s\S]*?\]\);/,'export const BUNDLED_VOICE_TEXTS=Object.freeze('+JSON.stringify(sorted,null,1)+');'));
 let previous={clips:[]};try{previous=JSON.parse(await readFile(manifestPath,'utf8'));}catch{}
 const saved=new Map((previous.clips||[]).map(clip=>[clip.id,clip])),clips=[],jobs=[];
 for(const voice of ['female','male'])for(const text of sorted){
  const id=voice+'-'+bundledVoiceId(text),clip={id,text,voice,speed:1,url:'/public/audio/voices/world/'+id+'.mp3',signature:sha(JSON.stringify([text,voice,1,'kokoro-native-mp3-64k-v1']))},old=saved.get(id);
  if(!force&&old?.signature===clip.signature){try{if(sha(await readFile(join(root,clip.url)))===old.sha256){clips.push(old);continue;}}catch{}}
  jobs.push(clip);
 }
 const writeManifest=()=>replaceText(manifestPath,JSON.stringify({generator:'Kokoro-82M v1.0 local neural voice engine',format:'MP3, mono 24 kHz, 64 kbit/s; native pitch and no reverberation',license:'Apache-2.0; see voice-engine/NOTICE.md',worlds:environments.length,catalogWorlds:authored.length,publicDestinations:publicDestinations.length,sentences:sorted.length,clips:[...clips].sort((a,b)=>a.id.localeCompare(b.id))},null,2)+'\n');
 await writeManifest();console.log(`${environments.length} worlds, ${sorted.length} distinct sentences, ${jobs.length} recordings to generate (${clips.length} cached).`);
 const children=[];let next=0,sequence=0,writes=Promise.resolve();
 try{
  await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),jobs.length)},()=>new Promise((resolveWorker,rejectWorker)=>{
   const child=fork(fileURLToPath(import.meta.url),['--worker'],{cwd:root,execArgv:[],stdio:['ignore','ignore','inherit','ipc']});children.push(child);let complete=false;
   function send(){if(next>=jobs.length){complete=true;child.send({stop:true});return;}child.send({id:++sequence,clip:jobs[next++]});}
   child.on('message',message=>{if(message.error){rejectWorker(Error(message.error));return;}clips.push(message.clip);writes=writes.then(writeManifest);console.log(`${clips.length}/${sorted.length*2} recorded: ${message.clip.id} (${message.clip.durationMs} ms)`);send();});
   child.on('error',rejectWorker);child.on('exit',code=>{if(complete&&code===0)resolveWorker();else rejectWorker(Error('Voice recorder exited '+code));});send();
  })));
  await writes;await buildVoicePreviews({force});return clips;
 }finally{for(const child of children)if(child.connected)child.kill('SIGTERM');}
}
if(process.argv.includes('--worker'))await childMain();
else if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildWorldVoices({force:process.argv.includes('--force'),concurrency:3});
