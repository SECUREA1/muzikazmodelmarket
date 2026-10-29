import test from 'node:test';
import assert from 'node:assert/strict';
import {createForestSnakeSpeech} from '../public/js/forest-snake-speech.js';
import {createQuestConversationVoice} from '../public/js/quest-conversation-voice.js';
import {GENERATED_VOICES} from '../public/js/neural-character-speech.js';

function fixture(){
 const calls=[],renders=[],voice={state:{unlocked:true,audioReady:true},announce:(text,options)=>{calls.push({text,...options});return true;}},world={id:'forest-harvest'};
 const snapshot={serverTime:100000,players:{self:{position:{x:0,y:0,z:0},health:100}},actors:{'forest-mossback':{active:true,position:{x:7,y:0,z:0}}},forestHarvest:{snake:{id:'forest-mossback',name:'Mossback',position:{x:7,y:0,z:0},speech:null}}};
 const controller=createForestSnakeSpeech({voice,render:view=>renders.push(view)});
 const update=()=>controller.update(snapshot,'self',world);
 const say=(id='one',text='The moon left its shoes in that oak tree.')=>{snapshot.forestHarvest.snake.speech={id,text,startedAt:snapshot.serverTime,endsAt:snapshot.serverTime+9000};};
 return {calls,renders,voice,world,snapshot,controller,update,say};
}

test('arrival captions stay visible while the baseline does not replay old snake audio',()=>{
 const f=fixture();f.say();f.update();assert.equal(f.calls.length,0);assert.equal(f.controller.snapshot().visible,true);assert.match(f.controller.snapshot().text,/moon/);
 f.update();assert.equal(f.calls.length,0);assert.equal(f.renders.length,1);
});

test('a fresh nearby passing remark speaks once in the existing spatial dialogue channel',()=>{
 const f=fixture();f.update();f.say();f.update();f.update();assert.equal(f.calls.length,1);
 const call=f.calls[0];assert.equal(call.voice,'Mossback');assert.equal(call.entityId,'forest-mossback');assert.equal(call.category,'dialogue');assert.equal(call.range,52);assert.deepEqual(call.source,{x:7,y:0,z:0});
 f.snapshot.forestHarvest.snake.position={x:10,y:0,z:3};f.update();assert.deepEqual(call.source,{x:10,y:0,z:3},'spoken source follows the moving snake');
});

test('distance, unavailable audio and conversation priority never create an ambient backlog',()=>{
 for(const condition of ['distant','locked','muted','speaking','pending','loading','busy','unsupported','reply']){
  const f=fixture();f.update();f.say();
  if(condition==='distant')f.snapshot.forestHarvest.snake.position.x=40;
  if(condition==='locked')f.voice.state.unlocked=false;
  if(condition==='muted')f.voice.state.muted=true;
  if(condition==='speaking')f.voice.state.speaking=true;
  if(condition==='pending')f.voice.state.pending=1;
  if(condition==='loading')f.voice.state.loading=true;
  if(condition==='busy')f.voice.state.outputBusy=true;
  if(condition==='unsupported')f.voice.state.supported=false;
  if(condition==='reply')f.snapshot.players.self.npcConversation={status:'active',conversation:[{conversation:true,role:'player',at:f.snapshot.serverTime,text:'Tell me about the mill.'}]};
  f.update();assert.equal(f.calls.length,0,condition);
  f.voice.state={unlocked:true,audioReady:true};f.snapshot.forestHarvest.snake.position.x=7;delete f.snapshot.players.self.npcConversation;f.update();assert.equal(f.calls.length,0,condition+' remains consumed');
  assert.equal(f.controller.snapshot().visible,true,'captions remain available for '+condition);
 }
});

test('departing, expired and invalid speech immediately clear captions without causing playback',()=>{
 const f=fixture();f.update();f.say();f.update();assert.equal(f.calls.length,1);
 f.snapshot.forestHarvest.snake.position.x=40;f.update();assert.equal(f.controller.snapshot().visible,false);
 f.snapshot.forestHarvest.snake.position.x=7;f.snapshot.serverTime+=10000;f.update();assert.equal(f.controller.snapshot().visible,false);
 f.say('future');f.snapshot.forestHarvest.snake.speech.startedAt+=1000;f.update();assert.equal(f.calls.length,1);assert.equal(f.controller.snapshot().visible,false);
 f.say('long');f.snapshot.forestHarvest.snake.speech.endsAt+=60000;f.update();assert.equal(f.calls.length,1);assert.equal(f.controller.snapshot().visible,false);
 f.say('bad-position');f.snapshot.forestHarvest.snake.position.x=NaN;f.update();assert.equal(f.calls.length,1);assert.equal(f.controller.snapshot().visible,false);
});

test('world changes, reconnect resets and disposal preserve one-time event behavior',()=>{
 const f=fixture();f.update();f.say();f.update();assert.equal(f.calls.length,1);
 f.world.id='public-commons';f.update();assert.equal(f.controller.snapshot().visible,false);
 f.world.id='forest-harvest';f.update();assert.equal(f.calls.length,1);f.update();assert.equal(f.calls.length,1);
 f.controller.reset();assert.equal(f.controller.snapshot().visible,false);f.update();assert.equal(f.calls.length,1);
 f.snapshot.serverTime+=1000;f.say('two');f.update();assert.equal(f.calls.length,2);
 f.controller.dispose();assert.equal(f.controller.snapshot().visible,false);f.say('three');f.update();assert.equal(f.calls.length,2);
});

test('open conversation menus keep ambient speech silent without hiding accessible captions',()=>{
 const f=fixture(),controller=createForestSnakeSpeech({voice:f.voice,isConversationOpen:()=>true});
 controller.update(f.snapshot,'self',f.world);f.say();controller.update(f.snapshot,'self',f.world);assert.equal(f.calls.length,0);assert.equal(controller.snapshot().visible,true);
});

test('the real shared voice retains requested speech and respects dialogue mute preferences',()=>{
 const spoken=[],speech={getVoices:()=>GENERATED_VOICES,speak:utterance=>spoken.push(utterance),cancel(){throw Error('Snake ambient audio must not interrupt current speech');},resume(){}},voice=createQuestConversationVoice({speech,Utterance:class{constructor(text){this.text=text;}},setTimer:()=>1,clearTimer(){}});
 const f=fixture(),controller=createForestSnakeSpeech({voice});voice.setScene({listener:f.snapshot.players.self.position,actors:f.snapshot.actors});voice.unlock();
 const update=()=>controller.update(f.snapshot,'self',f.world);update();voice.announce('A requested mill explanation.',{worldId:f.world.id,category:'dialogue'});assert.equal(spoken.length,1);
 f.say();update();assert.equal(spoken.length,1);assert.equal(voice.state.pending,0);spoken[0].onend();update();assert.equal(spoken.length,1);
 voice.setPreferences({dialogueMuted:true});f.say('muted');update();assert.equal(spoken.length,1);assert.equal(controller.snapshot().visible,true);
 voice.setPreferences({dialogueMuted:false});f.say('fresh');update();assert.equal(spoken.length,2);assert.ok(spoken[1].volume<.9);spoken[1].onend();voice.dispose();
});

test('an explicit chat can request an already-captioned remark without replaying ambient snapshots',()=>{
 const f=fixture();let requests=0;f.voice.requestReply=()=>requests++;
 f.update();f.say('already-near');f.update();assert.equal(f.calls.length,1);
 f.controller.requestReply();f.update();assert.equal(requests,1);assert.equal(f.calls.length,1);
 f.snapshot.result={snakeSpeech:{...f.snapshot.forestHarvest.snake.speech}};
 f.controller.reply(f.snapshot,'self',f.world);assert.equal(f.calls.length,2);f.update();assert.equal(f.calls.length,2);
});

test('a delayed chat receipt cannot voice an older remark over the current caption',()=>{
 const f=fixture();f.update();f.say('old');const receipt={...f.snapshot.forestHarvest.snake.speech};
 f.snapshot.serverTime+=10000;f.say('current');f.controller.requestReply();
 f.snapshot.result={snakeSpeech:receipt};assert.equal(f.controller.reply(f.snapshot,'self',f.world),false);
 assert.equal(f.calls.length,0);assert.equal(f.controller.snapshot().id,'current');
});
