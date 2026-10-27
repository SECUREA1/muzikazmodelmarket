import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const sourceURL='https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.int8.onnx';
const sourceSHA='ae315a79b623f244700e4afb9246c46a26066782e049ba174bf3ba433970ee9c';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=resolve(process.env.MUZIKAZ_SPEECH_MODEL_DIR||resolve(root,'.speech-models'));
const output=resolve(process.env.MUZIKAZ_SPEECH_MODEL_PATH||resolve(directory,'kokoro-v1.0.uint8.onnx'));
const manifest=output+'.json',sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// Read protobuf wire boundaries without materializing the 109 MB ONNX graph.
function varint(bytes,offset){let value=0,scale=1;for(let i=0;i<9;i++){const n=bytes[offset++];if(n===undefined)throw Error('Truncated model field');value+=(n&127)*scale;if(!(n&128))return {value,next:offset};scale*=128;}throw Error('Unsupported model integer');}
function fields(bytes,start=0,end=bytes.length){const result=[];for(let offset=start;offset<end;){const key=varint(bytes,offset),tag=key.value>>>3,wire=key.value&7,field={tag,wire,key:offset};offset=key.next;field.value=offset;
 if(wire===0){const v=varint(bytes,offset);field.number=v.value;offset=v.next;}
 else if(wire===2){const size=varint(bytes,offset);field.start=size.next;offset=size.next+size.value;field.end=offset;}
 else if(wire===1)offset+=8;else if(wire===5)offset+=4;else throw Error('Unsupported model wire type');
 if(offset>end)throw Error('Invalid model boundary');result.push(field);}return result;}
const fieldText=(bytes,field)=>bytes.toString('utf8',field.start,field.end);
export function prepareCPUModel(bytes){
 const graph=fields(bytes).find(field=>field.tag===7&&field.wire===2);if(!graph)throw Error('Missing ONNX graph');
 const members=fields(bytes,graph.start,graph.end),initializers=new Map(),nodes=[];
 for(const field of members){if(field.wire!==2)continue;
  if(field.tag===5){const parts=fields(bytes,field.start,field.end),name=parts.find(part=>part.tag===8);if(name)initializers.set(fieldText(bytes,name),parts);}
  if(field.tag===1){const parts=fields(bytes,field.start,field.end),op=parts.find(part=>part.tag===4);nodes.push({op:op?fieldText(bytes,op):'',inputs:parts.filter(part=>part.tag===1).map(part=>fieldText(bytes,part))});}
 }
 const targets=new Set();let convolutions=0;
 for(const node of nodes)if(node.op==='ConvInteger'){convolutions++;targets.add(node.inputs[1]);if(!node.inputs[3])throw Error('Missing convolution zero point');targets.add(node.inputs[3]);}
 if(convolutions!==90)throw Error('Unexpected neural model architecture');
 for(const name of targets){if(nodes.some(node=>node.op!=='ConvInteger'&&node.inputs.includes(name)))throw Error('Shared signed tensor cannot be patched');
  const tensor=initializers.get(name),type=tensor?.find(field=>field.tag===2);if(type?.number!==3)throw Error('Expected signed quantized tensor');
  bytes[type.value]=2; // INT8 -> UINT8, same field width.
  const raw=tensor.find(field=>field.tag===9&&field.wire===2),packed=tensor.find(field=>field.tag===5&&field.wire===2);
  if(raw){for(let i=raw.start;i<raw.end;i++)bytes[i]^=128;}
  else if(packed&&packed.end-packed.start===1&&bytes[packed.start]===0){bytes[packed.key]=74;bytes[packed.start]=128;} // packed int32 zero -> raw uint8 128.
  else throw Error('Unexpected convolution zero-point encoding');
 }
 return bytes;
}

export async function prepareNeuralVoices(){
 try{const saved=JSON.parse(await readFile(manifest,'utf8'));if(saved.sourceSHA256===sourceSHA&&sha(await readFile(output))===saved.sha256){console.log('Neural male/female voice model is ready.');return output;}}catch{}
 await mkdir(dirname(output),{recursive:true});const download=output+'.download',temporary=output+'.tmp';
 try{
  console.log('Preparing local neural voices (one-time 109 MB model download)…');
  await promisify(execFile)('curl',['--fail','--location','--retry','3','--connect-timeout','20','--max-time','300','--silent','--show-error','--output',download,sourceURL],{maxBuffer:1024*1024});
  const bytes=await readFile(download);if(sha(bytes)!==sourceSHA)throw Error('Neural model checksum mismatch');
  const model=prepareCPUModel(bytes);await writeFile(temporary,model);await rename(temporary,output);
  await writeFile(manifest,JSON.stringify({sourceURL,sourceSHA256:sourceSHA,sha256:sha(model),conversion:'ConvInteger U8/U8, equivalent zero-point shift',license:'Apache-2.0'},null,2)+'\n');
  console.log('Neural male/female voices prepared for CPU playback.');return output;
 }finally{await rm(download,{force:true});await rm(temporary,{force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareNeuralVoices();
