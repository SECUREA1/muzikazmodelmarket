import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseCharacterVoice,characterSpeechStyle,prepareSpeechText,speechTimeout,speechVoiceOptions} from '../public/js/character-voice-profile.js';

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

test('language selection respects a preferred voice without using foreign language fallback',()=>{
 const french=voice('French Neural','fr-FR'),british=voice('English UK Natural','en-GB');
 assert.equal(chooseCharacterVoice([naturalA,naturalB],character,{preferredVoiceURI:naturalB.voiceURI}),naturalB);
 assert.equal(chooseCharacterVoice([french,naturalA],character,{preferredVoiceURI:french.voiceURI}),naturalA,'another language cannot override an available requested language');
 assert.equal(chooseCharacterVoice([french,british],character,{language:'en-US'}),british);
 assert.equal(chooseCharacterVoice([french],character,{language:'en-US'}),null,'missing English voices leave speech unavailable instead of switching languages');
 assert.equal(chooseCharacterVoice([],character),null);
});

test('voice quality does not override a matching spoken language',()=>{
 const spanish=voice('Spanish Neural','es-ES');
 const english=voice('English Voice');
 assert.equal(chooseCharacterVoice([spanish,english],character,{language:'en-US'}),english);
 assert.equal(chooseCharacterVoice([spanish,standard],character,{language:'en-US'}),null,'robotic English is not a usable fallback');
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
  assert.equal(chooseCharacterVoice([preferredUS,us,uk],intro,{selectedVoiceURI:uk.voiceURI}),uk,'an explicitly selected acceptable narrator voice is honored');
  assert.equal(chooseCharacterVoice([preferredUS,us,uk],intro,{preferredVoiceURI:uk.voiceURI}),preferredUS,'a cached accent cannot displace a better narrator match');
 }
 assert.equal(chooseCharacterVoice([standard,uk],{role:'narrator'}),uk,'a natural regional voice still takes priority over a basic engine');
 assert.equal(chooseCharacterVoice([us,uk],{voiceProfile:{style:'narrator',language:'en-GB'}}),uk);
});


test('known robotic engines are rejected even when selected or cached explicitly',()=>{
 for(const name of ['eSpeak English','Festival English','MBROLA en-us','Formant English','Robot Voice']){
  const robotic=voice(name);
  assert.equal(chooseCharacterVoice([robotic],character),null,name);
  assert.equal(chooseCharacterVoice([robotic,naturalA],character,{preferredVoiceURI:robotic.voiceURI}),naturalA,name);
  assert.equal(chooseCharacterVoice([robotic,naturalA],{...character,voiceProfile:{voiceURI:robotic.voiceURI}}),naturalA,name);
 }
 const hidden=voice('Microsoft Jenny Online (Natural)','en-US',{voiceURI:'espeak://en-us'});
 assert.equal(chooseCharacterVoice([hidden],character),null,'engine identity in voiceURI cannot be hidden by a pleasant label');
});

test('male and female choices use real installed voice identities and never pitch conversion',()=>{
 const female=voice('Microsoft Jenny Online (Natural)'),male=voice('Microsoft Guy Online (Natural)');
 assert.equal(chooseCharacterVoice([female,male,naturalA],character,{gender:'female'}),female);
 assert.equal(chooseCharacterVoice([female,male,naturalA],character,{gender:'male'}),male);
 assert.equal(chooseCharacterVoice([female,male],{...character,voiceProfile:{gender:'female'}}),female);
 assert.equal(chooseCharacterVoice([female,male],{...character,voiceProfile:{gender:'female'}},{gender:'male'}),male);
 assert.equal(chooseCharacterVoice([female,male],character,{gender:'male',preferredVoiceURI:female.voiceURI}),male,'cached voices cannot override selected gender');
 assert.equal(chooseCharacterVoice([naturalA],{...character,name:'Microsoft Jenny'},{gender:'female'}),null,'NPC names do not classify an unknown system voice');
 assert.equal(chooseCharacterVoice([naturalA],{...character,name:'Microsoft Guy'},{gender:'male'}),null);
 assert.equal(chooseCharacterVoice([female],character,{gender:'male'}),null,'a missing male voice does not silently use a female voice');
 assert.equal(chooseCharacterVoice([male,voice('French Natural','fr-FR',{gender:'female'})],character,{gender:'female'}),null,'gender preference never changes the spoken language');
 for(const gender of ['female','male'])assert.equal(characterSpeechStyle({...character,voiceProfile:{gender,pitch:gender==='female'?1.5:.5}}).pitch,1);
});

test('voice options expose usable sorted language and real gender metadata',()=>{
 const entries=[
  [voice('Microsoft David Desktop'),'male'],[voice('Microsoft Guy Online (Natural)'),'male'],
  [voice('Microsoft Zira Desktop'),'female'],[voice('Microsoft Jenny Online (Natural)','en-US',{localService:false}),'female'],
  [voice('Samantha','en-US'),'female'],[voice('Daniel (Enhanced)','en-GB'),'male'],
  [voice('Google UK English Female','en-GB'),'female'],[voice('Google UK English Male','en-GB'),'male'],
  [voice('Custom Local Voice','en-US',{gender:'female'}),'female'],[voice('English Voice'),'unknown']
 ];
 const raw=[...entries.map(([v])=>v),standard,voice('French Natural','fr-FR')];
 const list=speechVoiceOptions(raw),reordered=speechVoiceOptions([...raw].reverse());
 assert.deepEqual(list.map(item=>item.voiceURI),reordered.map(item=>item.voiceURI),'menu order remains stable when browser enumeration changes');
 assert.equal(list.length,entries.length,'only usable English voices are offered');
 for(const [v,gender]of entries){
  const item=list.find(item=>item.voice===v);assert.ok(item,v.name);
  assert.equal(item.voiceURI,v.voiceURI);assert.equal(item.name,v.name);assert.equal(item.lang,v.lang);assert.equal(item.gender,gender,v.name);
  assert.equal(typeof item.natural,'boolean');assert.equal(item.generated,false);assert.equal(item.localService,v.localService);
 }
 assert.equal(list.find(item=>item.name.includes('Jenny')).natural,true);
 assert.equal(list.find(item=>item.name==='Daniel (Enhanced)').natural,true);
 assert.equal(list.find(item=>item.name==='English Voice').natural,false);
 assert.deepEqual(speechVoiceOptions(raw,{language:'ja-JP'}),[]);
 assert.deepEqual(speechVoiceOptions([]),[]);
});


test('generated voices are the natural default even when a native voice was cached',()=>{
 const generated=voice('Kokoro Heart','en-US',{generated:true,gender:'female',localService:false});
 for(const role of ['guide','narrator']){
  const npc={...character,role};
  assert.equal(chooseCharacterVoice([naturalA,generated],npc),generated);
  assert.equal(chooseCharacterVoice([naturalA,generated],npc,{preferredVoiceURI:naturalA.voiceURI}),generated,'cached native voices cannot block the generated default');
  assert.equal(chooseCharacterVoice([generated,naturalA],{...npc,voiceProfile:{voiceURI:naturalA.voiceURI}}),generated,'authored cached URI remains within the best quality tier');
  assert.equal(chooseCharacterVoice([generated,naturalA],npc,{selectedVoiceURI:naturalA.voiceURI}),naturalA,'the user may explicitly choose an acceptable native voice');
 }
 const item=speechVoiceOptions([naturalA,generated]).find(entry=>entry.voice===generated);
 assert.equal(item.generated,true);assert.equal(item.natural,true);assert.equal(item.gender,'female');assert.equal(item.localService,false);
 assert.equal(speechVoiceOptions([naturalA,generated])[0].voice,generated,'voice menus list the generated default first');
});

test('explicit voice selection never silently falls back when it is unavailable or invalid',()=>{
 const generated=voice('Kokoro Heart','en-US',{generated:true,gender:'female'}),male=voice('Microsoft Guy Online (Natural)'),foreign=voice('French Natural','fr-FR',{gender:'female'});
 const all=[generated,male,foreign,standard];
 for(const selectedVoiceURI of ['uninstalled-voice',standard.voiceURI,foreign.voiceURI,false,0,{},[]]){
  for(const role of ['guide','narrator'])assert.equal(chooseCharacterVoice(all,{...character,role},{selectedVoiceURI}),null,selectedVoiceURI);
 }
 assert.equal(chooseCharacterVoice(all,character,{gender:'female',selectedVoiceURI:male.voiceURI}),null,'a selected voice with the wrong gender is unavailable rather than replaced');
 assert.equal(chooseCharacterVoice(all,character,{selectedVoiceURI:''}),generated,'empty selection restores automatic generated voice choice');
 assert.equal(chooseCharacterVoice(all,character,{gender:'male',selectedVoiceURI:male.voiceURI}),male,'valid explicit gender and voice selections work together');
});
