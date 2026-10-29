import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FUNHOUSE_CLOWN_LINES} from '../public/js/funhouse-audio-dialogue.js';
import {generateNeuralVoice,neuralVoiceStatus,shutdownNeuralVoiceEngine} from '../server-neural-voice-engine.mjs';
import {ensureVoiceRuntime} from '../server-voice-runtime.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),directory=resolve(root,'public/audio/funhouse/voices'),manifestPath=resolve(directory,'manifest.json');
const run=promisify(execFile),sha=value=>createHash('sha256').update(value).digest('hex');
function wavDuration(bytes){
 if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('Expected generated WAV audio.');
 let byteRate=0,dataLength=0;
 for(let offset=12;offset+8<=bytes.length;){const tag=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4);if(tag==='fmt ')byteRate=bytes.readUInt32LE(offset+16);if(tag==='data')dataLength=length;offset+=8+length+(length%2);}
 if(!byteRate||!dataLength)throw Error('Generated clip has no playable audio.');
 return Math.round(dataLength/byteRate*1000);
}
export async function buildFunhouseVoices({force=false}={}){
 let previous={clips:[]};try{previous=JSON.parse(await readFile(manifestPath,'utf8'));}catch{}
 const saved=new Map((previous.clips||[]).map(value=>[value.id,value])),clips=[],durations={};
 await mkdir(directory,{recursive:true});
 try{
  for(const [index,line]of FUNHOUSE_CLOWN_LINES.entries()){
   const signature=sha(JSON.stringify([line.text,line.voice,line.speed,'kokoro-normalized-v1'])),target=resolve(directory,line.id+'.wav'),old=saved.get(line.id);
   if(!force&&old?.signature===signature){try{const audio=await readFile(target);if(sha(audio)===old.sha256&&wavDuration(audio)===old.durationMs){clips.push(old);durations[line.id]=old.durationMs;console.log(`${index+1}/${FUNHOUSE_CLOWN_LINES.length} ready: ${line.id}`);continue;}}catch{}}
   await ensureVoiceRuntime();const status=neuralVoiceStatus();if(!status.available)throw Error(status.status+' Run npm ci and node scripts/prepare-neural-voices.mjs first.');
   const raw=target+'.raw.wav';
   try{
    await writeFile(raw,await generateNeuralVoice({text:line.text,voice:line.voice,speed:line.speed}));
    // Keep the original natural voice. Only loudness and file format change.
    await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-af','loudnorm=I=-20:LRA=7:TP=-2','-ar','24000','-ac','1','-c:a','pcm_s16le',target],{maxBuffer:1024*1024});
   }finally{await rm(raw,{force:true});}
   const audio=await readFile(target),durationMs=wavDuration(audio),clip={id:line.id,url:line.url,text:line.text,caption:line.caption,speaker:line.speaker,voice:line.voice,speed:line.speed,durationMs,bytes:audio.length,sha256:sha(audio),signature};
   clips.push(clip);durations[line.id]=durationMs;
   // Save completed clips as we go so an interrupted build resumes cheaply.
   await writeFile(manifestPath,JSON.stringify({generator:'Kokoro-82M v1.0, local neural voice engine',normalization:'-20 LUFS, peak -2 dBTP, mono PCM16 at 24 kHz',clips},null,2)+'\n');
   console.log(`${index+1}/${FUNHOUSE_CLOWN_LINES.length} rendered: ${line.id} (${durationMs} ms)`);
  }
  const modulePath=resolve(root,'public/js/funhouse-audio-dialogue.js'),source=await readFile(modulePath,'utf8');
  await writeFile(modulePath,source.replace(/const CLIP_DURATIONS=Object\.freeze\(\{[\s\S]*?\}\);/,'const CLIP_DURATIONS=Object.freeze('+JSON.stringify(durations,null,1)+');'));
  return clips;
 }finally{await shutdownNeuralVoiceEngine();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildFunhouseVoices({force:process.argv.includes('--force')});
