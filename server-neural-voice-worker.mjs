import {readFile} from 'node:fs/promises';
import * as ort from 'onnxruntime-node';
import {phonemize} from './voice-engine/phonemize.mjs';

const SAMPLE_RATE=24000,MAX_TOKENS=72;
const vocab=JSON.parse(await readFile(new URL('./voice-engine/vocab.json',import.meta.url),'utf8'));
const punctuation=new Set(['.','!','?',',',';',':'].map(value=>vocab[value]));
const embeddings=new Map();
let sessionPromise=null,busy=false;
function session(){
 return sessionPromise||=ort.InferenceSession.create(process.argv[2],{
  executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1,
  enableCpuMemArena:false,enableMemPattern:false,logSeverityLevel:3
 });
}
async function speaker(voice){
 if(!embeddings.has(voice)){
  const data=await readFile(new URL(`./voice-engine/${voice}.bin`,import.meta.url));
  embeddings.set(voice,new Float32Array(Uint8Array.from(data).buffer));
 }
 return embeddings.get(voice);
}
function chunks(tokens){
 const result=[];
 for(let start=0;start<tokens.length;){
  let end=Math.min(start+MAX_TOKENS,tokens.length);
  if(end<tokens.length){
   let boundary=-1;
   for(let at=end-1;at>=start+20;at--)if(punctuation.has(tokens[at])){boundary=at+1;break;}
   if(boundary<0)for(let at=end-1;at>=start+20;at--)if(tokens[at]===vocab[' ']){boundary=at;break;}
   if(boundary>start)end=boundary;
  }
  result.push(tokens.slice(start,end));start=end;
  while(tokens[start]===vocab[' '])start++;
 }
 return result;
}
function wav(parts){
 const length=parts.reduce((total,part)=>total+part.length,0);
 if(!length||length>SAMPLE_RATE*180)throw new Error('The generated speech exceeded its duration limit.');
 let peak=0;for(const part of parts)for(const sample of part)peak=Math.max(peak,Math.abs(sample));
 if(!Number.isFinite(peak)||peak<.00001)throw new Error('The speech engine returned empty audio.');
 const gain=Math.min(2,.85/peak),output=Buffer.alloc(44+length*2);
 output.write('RIFF',0);output.writeUInt32LE(output.length-8,4);output.write('WAVEfmt ',8);
 output.writeUInt32LE(16,16);output.writeUInt16LE(1,20);output.writeUInt16LE(1,22);
 output.writeUInt32LE(SAMPLE_RATE,24);output.writeUInt32LE(SAMPLE_RATE*2,28);
 output.writeUInt16LE(2,32);output.writeUInt16LE(16,34);output.write('data',36);output.writeUInt32LE(length*2,40);
 let index=44;for(const part of parts)for(const sample of part){output.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample*gain))*32767),index);index+=2;}
 return output;
}
async function generate({text,voice,speed}){
 const started=performance.now(),phones=await phonemize(text,'a');
 const tokens=Array.from(phones).map(value=>vocab[value]).filter(value=>Number.isInteger(value));
 if(!tokens.length)throw new Error('No spoken text was provided.');
 const model=await session(),styles=await speaker(voice),parts=[];
 for(const chunk of chunks(tokens)){
  const ids=[0,...chunk,0],offset=256*Math.min(chunk.length,509),style=styles.slice(offset,offset+256);
  const feeds={input_ids:new ort.Tensor('int64',BigInt64Array.from(ids,BigInt),[1,ids.length]),style:new ort.Tensor('float32',style,[1,256]),speed:new ort.Tensor('float32',Float32Array.of(speed),[1])};
  if(!model.inputNames.includes('input_ids')){feeds.tokens=feeds.input_ids;delete feeds.input_ids;}
  const result=await model.run(feeds),wave=result.waveform||result.audio||Object.values(result)[0];
  parts.push(Float32Array.from(wave.data));
 }
 return {audio:wav(parts),inferenceMs:Math.round(performance.now()-started),rssBytes:process.memoryUsage().rss};
}
process.on('message',async request=>{
 if(busy){process.send?.({id:request.id,error:'The neural speech worker is busy.'});return;}
 busy=true;let peakRssBytes=process.memoryUsage().rss;
 const meter=setInterval(()=>peakRssBytes=Math.max(peakRssBytes,process.memoryUsage().rss),25);
 try{const result=await generate(request);process.send?.({id:request.id,...result,peakRssBytes:Math.max(peakRssBytes,process.memoryUsage().rss)});}
 catch(error){process.send?.({id:request.id,error:error?.message||'Neural speech generation failed.'});}
 finally{clearInterval(meter);busy=false;}
});
process.on('disconnect',()=>process.exit(0));
