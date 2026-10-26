import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseCharacterVoice,characterSpeechStyle,prepareSpeechText,speechTimeout} from '../public/js/character-voice-profile.js';

const voice=(name,lang='en-US',extra={})=>({name,lang,voiceURI:name,default:false,localService:true,...extra});
const standard=voice('eSpeak English'),naturalA=voice('Avery Natural'),naturalB=voice('Jordan Neural');
const character={id:'trail-guide',name:'Maya',role:'Trail guide',personality:'Patient, calm and thoughtful'};

test('NPCs prefer natural voices without changing voice when browser order changes',()=>{
 const installed=[standard,naturalA,naturalB,voice('French Natural','fr-FR')];
 const selected=chooseCharacterVoice(installed,character);
 assert.ok([naturalA,naturalB].includes(selected),'a natural English voice takes priority over the synthetic fallback');
 assert.equal(chooseCharacterVoice([...installed].reverse(),character),selected);
 assert.equal(chooseCharacterVoice([naturalB,standard,naturalA],character),selected);
});

test('characters receive stable distinct voices from the same quality tier',()=>{
 const choices=new Set();
 for(let i=0;i<40;i++){
  const npc={id:'resident-'+i,name:'Resident '+i,role:'Resident'};
  const selected=chooseCharacterVoice([naturalA,standard,naturalB],npc);
  assert.ok([naturalA,naturalB].includes(selected));
  assert.equal(chooseCharacterVoice([naturalB,naturalA,standard],npc),selected);
  choices.add(selected);
 }
 assert.equal(choices.size,2,'multiple natural voices are distributed between characters');
});

test('language selection respects a preferred voice and falls back safely',()=>{
 const french=voice('French Neural','fr-FR'),british=voice('English UK Natural','en-GB');
 assert.equal(chooseCharacterVoice([naturalA,naturalB],character,{preferredVoiceURI:naturalB.voiceURI}),naturalB);
 assert.equal(chooseCharacterVoice([french,naturalA],character,{preferredVoiceURI:french.voiceURI}),naturalA,'another language cannot override an available requested language');
 assert.equal(chooseCharacterVoice([french,british],character,{language:'en-US'}),british);
 assert.equal(chooseCharacterVoice([french],character,{language:'en-US'}),french,'a browser fallback remains usable when the requested language is absent');
 assert.equal(chooseCharacterVoice([],character),null);
});

test('voice quality does not override a matching spoken language',()=>{
 const spanish=voice('Spanish Neural','es-ES');
 assert.equal(chooseCharacterVoice([spanish,standard],character,{language:'en-US'}),standard);
 assert.equal(chooseCharacterVoice([spanish,naturalA],character,{language:'es-MX'}),spanish);
});

test('character delivery stays natural, consistent and responsive to personality',()=>{
 const calm=characterSpeechStyle(character),lively=characterSpeechStyle({...character,personality:'Outgoing, enthusiastic and lively'});
 assert.deepEqual(characterSpeechStyle(character),calm);
 for(const style of [calm,lively,characterSpeechStyle({...character,mood:'urgent'},{text:'Watch out! Please move back.'})]){
  assert.ok(style.rate>=.96&&style.rate<=1.04,JSON.stringify(style));
  assert.equal(style.pitch,1,'native voice timbre stays unprocessed');
  assert.match(style.lang,/^en/i);
 }
 assert.ok(lively.rate>calm.rate,'lively delivery has a little more energy than patient delivery');
});

test('speech text expands game shorthand without changing ordinary conversation',()=>{
 const spoken=prepareSpeechText('Mission → Collect supplies • Reward: 25 MZK & 10 XP.');
 assert.match(spoken,/Collect supplies/);assert.match(spoken,/25/);assert.match(spoken,/10/);
 assert.match(spoken,/(?:M\s+Z\s+K|Muzikaz)/i);
 assert.match(spoken,/and/i);assert.doesNotMatch(spoken,/[→•&]/);
 assert.equal(prepareSpeechText("Don't rush. Are you ready?"),"Don't rush. Are you ready?");
 assert.equal(prepareSpeechText(null),'');
});

test('speech watchdog scales with words and rate so long replies can finish',()=>{
 const short='Welcome back. Ready for the next job?',long=Array.from({length:130},()=> 'conversation').join(' ');
 const brief=speechTimeout(short),full=speechTimeout(long);
 assert.ok(Number.isFinite(brief)&&brief>0);assert.ok(full>22000,'long dialogue is not clipped by the old fixed watchdog');
 assert.ok(full>brief);assert.ok(speechTimeout(long,.9)>speechTimeout(long,1.1));
 assert.ok(Number.isFinite(speechTimeout('',0)),'invalid rate cannot create an infinite watchdog');
});


test('all character voices retain native pitch and authored pace stays restrained',()=>{
 for(const pitch of [.5,.9,1.1,2,Infinity,'high']){
  const style=characterSpeechStyle({...character,mood:'urgent',voiceProfile:{pitch}},{text:'Warning! Watch out!'});
  assert.equal(style.pitch,1);
 }
 assert.equal(characterSpeechStyle({...character,voiceProfile:{rate:.2,pitch:.5}}).rate,.9);
 assert.equal(characterSpeechStyle({...character,voiceProfile:{rate:3,pitch:2}}).rate,1.1);
 assert.equal(characterSpeechStyle({...character,voiceProfile:{rate:1.03}}).rate,1.03);
 assert.equal(characterSpeechStyle({voiceProfile:{rate:'fast'}}).rate,1);
});

test('introduction narrator is neutral even with character traits or authored effects',()=>{
 const intro={...character,role:'narrator',mood:'urgent',personality:'Energetic and outgoing',voiceProfile:{rate:1.8,pitch:.5,language:'en-GB'}};
 assert.deepEqual(characterSpeechStyle(intro,{text:'Warning! Incoming!'}),{rate:1,pitch:1,lang:'en-GB'});
 assert.deepEqual(characterSpeechStyle({role:'guide',voiceProfile:{style:'narrator',rate:.5,pitch:2,language:'invalid language'}}),{rate:1,pitch:1,lang:'en-US'});
});

test('introduction narrator selects a consistent exact-locale voice with a default tie',()=>{
 const us=voice('US Natural'),preferredUS=voice('US Default Natural','en-US',{default:true}),uk=voice('UK Neural','en-GB',{default:true});
 for(let i=0;i<12;i++){
  const intro={id:'intro-'+i,role:'narrator'};
  assert.equal(chooseCharacterVoice([uk,us,preferredUS],intro),preferredUS);
  assert.equal(chooseCharacterVoice([preferredUS,us,uk],intro,{preferredVoiceURI:uk.voiceURI}),preferredUS,'a cached accent cannot override the matching narrator locale');
 }
 assert.equal(chooseCharacterVoice([standard,uk],{role:'narrator'}),uk,'a natural regional voice still takes priority over a basic engine');
 assert.equal(chooseCharacterVoice([us,uk],{voiceProfile:{style:'narrator',language:'en-GB'}}),uk);
});
