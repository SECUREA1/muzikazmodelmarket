import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {FUNHOUSE_CLOWN_LINES,FUNHOUSE_LINES_BY_EVENT,funhouseClownLine,funhouseClownLineById} from '../public/js/funhouse-audio-dialogue.js';

function pcmWave(bytes){
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
 let format=null,data=null;
 for(let offset=12;offset+8<=bytes.length;){const type=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;
  assert.ok(start+size<=bytes.length,'WAV chunks remain inside the downloaded clip');
  if(type==='fmt ')format={encoding:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),sampleRate:bytes.readUInt32LE(start+4),byteRate:bytes.readUInt32LE(start+8),bits:bytes.readUInt16LE(start+14)};
  if(type==='data')data=bytes.subarray(start,start+size);offset=start+size+(size%2);
 }
 assert.ok(format&&data,'every clip contains a playable format and sample chunk');return {format,data};
}

test('the clown cast has original captioned lines for every attraction and all six trail discoveries',()=>{
 assert.equal(FUNHOUSE_CLOWN_LINES.length,24);assert.equal(new Set(FUNHOUSE_CLOWN_LINES.map(line=>line.id)).size,24);
 for(const event of ['welcome','car-start','car-honk','car-complete','spinner-start','spinner-hit','water-hit','water-miss','jack-wind','jack-catch','jack-miss','maze-start','maze-complete','dressup','adventure-complete','ambient',...['ticket-trick','wardrobe-whisper','drowned-mask','spinner-shadow','playroom-secret','last-laugh'].map(id=>'adventure:'+id)]){
  assert.ok(FUNHOUSE_LINES_BY_EVENT[event]?.length,event+' has a playable captioned response');
 }
 for(const line of FUNHOUSE_CLOWN_LINES){
  assert.equal(line.caption,line.text);assert.ok(line.speaker&&line.style);assert.ok(['male','female'].includes(line.voice));
  assert.ok(line.speed>=.9&&line.speed<=1.1);assert.match(line.url,/^\/public\/audio\/funhouse\/voices\/[a-z0-9-]+\.wav$/);
  assert.throws(()=>{line.text='A stale caption';},TypeError);assert.equal(funhouseClownLineById(line.id),line);
 }
 assert.notEqual(funhouseClownLine('welcome',0),funhouseClownLine('welcome',1));
 assert.equal(funhouseClownLine('welcome',2),funhouseClownLine('welcome',0));
 assert.equal(funhouseClownLine('welcome',-1),funhouseClownLine('welcome',1));
 assert.equal(funhouseClownLine('unknown-attraction'),null);assert.equal(funhouseClownLine('constructor'),null);assert.equal(funhouseClownLineById('unknown-clown'),null);
});

test('all static clown voices decode as real, non-clipping speech and match their published captions and durations',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/audio/funhouse/voices/manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.clips.length,FUNHOUSE_CLOWN_LINES.length);assert.match(manifest.generator,/Kokoro/);
 for(const line of FUNHOUSE_CLOWN_LINES){
  const clip=manifest.clips.find(value=>value.id===line.id);assert.ok(clip,line.id+' is present in the generated asset manifest');
  const bytes=await readFile(new URL('../'+line.url.slice(1),import.meta.url)),{format,data}=pcmWave(bytes);
  assert.deepEqual(format,{encoding:1,channels:1,sampleRate:24000,byteRate:48000,bits:16});
  assert.equal(createHash('sha256').update(bytes).digest('hex'),clip.sha256,line.id+' contains the reviewed audio');
  assert.equal(clip.text,line.text);assert.equal(clip.caption,line.caption);assert.equal(clip.voice,line.voice);
  const durationMs=Math.round(data.length/format.byteRate*1000);assert.equal(durationMs,line.durationMs);assert.equal(durationMs,clip.durationMs);assert.ok(durationMs>500);
  let energy=0,peak=0;for(let offset=0;offset<data.length;offset+=2){const sample=data.readInt16LE(offset)/32768;energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
  assert.ok(Math.sqrt(energy/(data.length/2))>.004,line.id+' contains audible speech rather than a silent placeholder');
  assert.ok(peak<.99,line.id+' retains headroom without clipped samples');
 }
});
