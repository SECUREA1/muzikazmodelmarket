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
  assert.ok(style.rate>=.85&&style.rate<=1.15,JSON.stringify(style));
  assert.ok(style.pitch>=.9&&style.pitch<=1.1,JSON.stringify(style));
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
