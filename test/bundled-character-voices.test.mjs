import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {worldGuideIntroduction} from '../public/js/world-guide.js';
import {prepareSpeechText} from '../public/js/character-voice-profile.js';
import {splitBundledSpeech,bundledVoiceURL,bundledVoiceId,BUNDLED_VOICE_TEXTS,BUNDLED_PREVIEW_TEXT} from '../public/js/bundled-character-voices.js';
import {WORLD_DISTRICTS,districtMapId} from '../world-districts.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const environments=JSON.parse(await readFile(join(root,'public/models/environments/environments.json'),'utf8'));
const publicDestinations=[{id:'public-commons',name:'Public Commons'},...WORLD_DISTRICTS.map(region=>({id:districtMapId(region.id),name:region.name,builderScene:{layoutMeta:region.id==='neon-docks'?{harbor:true}:{}}}))];

test('every authored map guide has exact male and female recordings for shared and solo entry',()=>{
 assert.equal(environments.length,38);
 for(const environment of [...environments,...publicDestinations,{}])for(const solo of [false,true]){
  const spoken=prepareSpeechText(worldGuideIntroduction(environment,{solo})),segments=splitBundledSpeech(spoken);
  assert.equal(segments.join(' '),spoken);
  for(const sentence of segments){
   assert.ok(sentence.length<=180);
   for(const voice of ['female','male'])assert.equal(bundledVoiceURL(sentence,voice),'/public/audio/voices/world/'+voice+'-'+bundledVoiceId(sentence)+'.mp3',environment.id+': '+sentence);
  }
 }
});

test('sentence chunking preserves punctuation, readable boundaries and arbitrary dialogue outside the pack',()=>{
 const spoken='Welcome aboard! Follow the marked route. Choose a new job? You are ready.';
 assert.deepEqual(splitBundledSpeech(spoken),['Welcome aboard!','Follow the marked route.','Choose a new job?','You are ready.']);
 const long=('Use the map to find an available assignment ').repeat(12).trim()+'.';
 const chunks=splitBundledSpeech(long);assert.ok(chunks.length>1);assert.ok(chunks.every(value=>value.length<=180));assert.equal(chunks.join(' '),long);
 assert.equal(bundledVoiceURL('A newly authored NPC reply.'),null);
 assert.equal(bundledVoiceURL(BUNDLED_VOICE_TEXTS[0],'../../elsewhere'),null);
 assert.equal(bundledVoiceURL('  '+BUNDLED_VOICE_TEXTS[0]+'  ','male'),bundledVoiceURL(BUNDLED_VOICE_TEXTS[0],'male'));
 assert.deepEqual(splitBundledSpeech(''),[]);
});

test('pack manifest verifies every shipped MP3 against its spoken sentence, duration and checksum',async()=>{
 const manifest=JSON.parse(await readFile(join(root,'public/audio/voices/world/manifest.json'),'utf8'));
 assert.equal(manifest.worlds,environments.length+publicDestinations.length);assert.equal(manifest.catalogWorlds,environments.length);assert.equal(manifest.publicDestinations,publicDestinations.length);assert.equal(manifest.sentences,BUNDLED_VOICE_TEXTS.length);assert.equal(manifest.clips.length,BUNDLED_VOICE_TEXTS.length*2);
 const identities=new Set();let total=0;
 for(const clip of manifest.clips){
  assert.equal(bundledVoiceURL(clip.text,clip.voice),clip.url);
  assert.equal(clip.id,clip.voice+'-'+bundledVoiceId(clip.text));assert.equal(identities.has(clip.id),false);identities.add(clip.id);
  assert.ok(clip.durationMs>200&&clip.durationMs<30000);assert.equal(clip.speed,1);
  const bytes=await readFile(join(root,clip.url));total+=bytes.length;
  assert.equal(bytes.length,clip.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),clip.sha256);assert.ok(bytes.length>1000);
  assert.ok(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255,'Expected a playable MP3 frame or metadata header.');
 }
 assert.ok(total<12*1024*1024,'Bundled narration must remain a small static download.');
});

test('male and female voice previews remain real playable WAVs independent of the speech API',async()=>{
 const manifest=JSON.parse(await readFile(join(root,'public/audio/voices/preview-manifest.json'),'utf8'));
 const samples=[];
 for(const gender of ['female','male']){
  const url=bundledVoiceURL(BUNDLED_PREVIEW_TEXT,gender);assert.equal(url,'/public/audio/voices/'+gender+'-preview.wav');
  const bytes=await readFile(join(root,url));samples.push(bytes);
  const entry=manifest.clips.find(clip=>clip.voice===gender);assert.equal(entry.text,BUNDLED_PREVIEW_TEXT);assert.equal(entry.bytes,bytes.length);assert.equal(entry.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WAVE');assert.equal(bytes.readUInt32LE(24),24000);
  let peak=0;for(let at=44;at<bytes.length;at+=2)peak=Math.max(peak,Math.abs(bytes.readInt16LE(at)));
  assert.ok(peak>1000&&peak<32767);
 }
 assert.equal(samples[0].equals(samples[1]),false);
});
