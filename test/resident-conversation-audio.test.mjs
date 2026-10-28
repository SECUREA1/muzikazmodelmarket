import test from 'node:test';
import assert from 'node:assert/strict';
import {createResidentConversationAudio} from '../public/js/resident-conversation-audio.js';
import {createQuestConversationVoice} from '../public/js/quest-conversation-voice.js';
import {GENERATED_VOICES} from '../public/js/neural-character-speech.js';

function fixture(){
 const calls=[],voice={state:{unlocked:true,audioReady:true},announce:(text,options)=>calls.push({text,...options})};
 const audio=createResidentConversationAudio({voice}),world={id:'commons'},snapshot={serverTime:100000,players:{self:{position:{x:0,y:0,z:0}}},actors:{
  a:{position:{x:2,y:0,z:0},resident:{name:'Maya',role:'Guide',isAI:true}},b:{position:{x:4,y:0,z:0},resident:{name:'Rowan',isAI:true}}
 },residentLife:{conversations:[]}};
 const update=()=>audio.update(snapshot,'self',world);
 function say(id,spoken='How is your day going?',at=snapshot.serverTime){
  const actor=snapshot.actors[id];Object.assign(actor.resident,{speech:spoken,speechUntil:at+3200,speaking:true,interaction:{kind:'conversation',phase:'speaking',partnerId:id==='a'?'b':'a'}});
  snapshot.residentLife.conversations.push({id:'talk:'+at,participants:['a','b'],lines:[{speakerId:id,text:spoken,at}]});
 }
 return {audio,voice,calls,snapshot,world,update,say};
}

test('new nearby resident exchanges speak once with their identity and position',()=>{
 const f=fixture();f.update();f.say('a');f.update();f.update();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].text,'How is your day going?');assert.equal(f.calls[0].category,'dialogue');assert.equal(f.calls[0].entityId,'a');assert.equal(f.calls[0].voice,'Maya');assert.deepEqual(f.calls[0].source,{x:2,y:0,z:0});
 f.snapshot.serverTime+=4000;f.say('b','Good, thank you.');f.update();assert.equal(f.calls.length,2);assert.equal(f.calls[1].voice,'Rowan');
});

test('arrival baseline and periodic idle task captions stay silent',()=>{
 const f=fixture();f.say('a');f.update();assert.equal(f.calls.length,0);
 f.snapshot.serverTime+=5000;Object.assign(f.snapshot.actors.a.resident,{speech:'Checking the activity board.',speechUntil:f.snapshot.serverTime+3200,interaction:null});f.update();
 assert.equal(f.calls.length,0);
});

test('expired, distant, other-floor and private replies are consumed without later playback',()=>{
 for(const condition of ['expired','distant','floor','private','inactive','dead','future']){
  const f=fixture();f.update();f.say('a');
  if(condition==='expired')f.snapshot.serverTime+=6000;
  if(condition==='distant')f.snapshot.actors.a.position.x=30;
  if(condition==='floor')f.snapshot.actors.a.position.y=3;
  if(condition==='private')f.snapshot.players.other={npcConversation:{conversation:[{speakerId:'a',text:'How is your day going?',at:f.snapshot.serverTime}]}};
  if(condition==='inactive')f.snapshot.actors.a.active=false;
  if(condition==='dead')f.snapshot.actors.a.health=0;
  if(condition==='future')f.snapshot.residentLife.conversations[0].lines[0].at+=100;
  f.update();assert.equal(f.calls.length,0,condition);
  f.snapshot.actors.a.position={x:2,y:0,z:0};f.snapshot.actors.a.active=true;f.snapshot.actors.a.health=100;delete f.snapshot.players.other;f.update();
  assert.equal(f.calls.length,0,condition+' must not replay');
 }
});

test('muting, a locked output, a guide, loading and queued replies never create ambient backlog',()=>{
 for(const state of [{muted:true},{unlocked:false},{audioReady:false},{speaking:true},{pending:1},{loading:true},{supported:false}]){
  const f=fixture();f.update();Object.assign(f.voice.state,state);f.say('a');f.update();assert.equal(f.calls.length,0,JSON.stringify(state));
  f.voice.state={unlocked:true,audioReady:true};f.update();assert.equal(f.calls.length,0,'Consumed exchange replayed after '+JSON.stringify(state));
 }
});

test('only the nearest fresh exchange plays in a crowd, and map re-entry establishes a new baseline',()=>{
 const f=fixture();f.update();f.say('b','A distant exchange.');f.say('a','A close exchange.');f.update();assert.equal(f.calls.length,1);assert.equal(f.calls[0].text,'A close exchange.');f.update();assert.equal(f.calls.length,1);
 f.audio.reset();f.update();assert.equal(f.calls.length,1);f.snapshot.serverTime+=4000;f.say('a','Welcome back.');f.update();assert.equal(f.calls.length,2);
 f.world.id='island';f.update();assert.equal(f.calls.length,2);
});

test('fitness conversation records work without the generic interaction fields',()=>{
 const f=fixture();f.update();f.say('a','Keep your rhythm controlled.');delete f.snapshot.actors.a.resident.interaction;f.update();assert.equal(f.calls.length,1);
});

test('a paired conversation can use live speech when its transcript is omitted',()=>{
 const f=fixture();f.update();f.say('a');f.snapshot.residentLife=null;f.update();assert.equal(f.calls.length,1);
});

test('real quest voice integration preserves an introduction and speaks a later spatial resident reply',()=>{
 const spoken=[],speech={getVoices:()=>GENERATED_VOICES,speak:utterance=>spoken.push(utterance),cancel(){},resume(){}},voice=createQuestConversationVoice({speech,Utterance:class{constructor(text){this.text=text;}},setTimer:()=>1,clearTimer(){}});
 const f=fixture();f.audio=createResidentConversationAudio({voice});const update=()=>f.audio.update(f.snapshot,'self',f.world);
 voice.setScene({listener:f.snapshot.players.self.position,actors:f.snapshot.actors});voice.unlock();voice.announce('Welcome to the world.',{worldId:'commons',category:'introduction'});update();f.say('a');update();assert.equal(spoken.length,1);assert.equal(voice.state.pending,0);
 spoken[0].onend();f.snapshot.serverTime+=4000;f.say('b','Good, thank you.');update();assert.equal(spoken.length,2);assert.equal(spoken[1].text,'Good, thank you.');assert.ok(spoken[1].volume>0&&spoken[1].volume<.9);assert.ok(spoken[1].voice.generated);voice.dispose();
});
