import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuestConversationVoice} from '../public/js/quest-conversation-voice.js';

function fixture(){
 let time=1000,cancels=0;
 const spoken=[],timers=new Map();let sequence=0;
 const voice=createQuestConversationVoice({
  speech:{speak:call=>spoken.push(call),cancel:()=>cancels++,resume(){},getVoices:()=>[]},
  Utterance:class{constructor(text){this.text=text;}},now:()=>time,
  setTimer:call=>{timers.set(++sequence,call);return sequence;},clearTimer:id=>timers.delete(id)
 });
 return {voice,spoken,timers,advance:ms=>time+=ms,get cancels(){return cancels;}};
}
const announce=(voice,text,category='announcements',extra={})=>voice.announce(text,{worldId:'map',key:text,category,...extra});

test('saved category mute immediately stops its active voice and discards its queued calls',()=>{
 const {voice,spoken}=fixture();voice.unlock();
 announce(voice,'First welcome','introduction');announce(voice,'Queued welcome','introduction');announce(voice,'A new job');
 voice.setPreferences({introductionMuted:true});
 assert.equal(spoken.length,2);assert.equal(spoken[1].text,'A new job');assert.equal(voice.state.pending,0);
 spoken[0].onend();assert.equal(spoken.length,2,'cancelled callback cannot start a discarded call');
 voice.setPreferences({introductionMuted:false});spoken[1].onend();assert.equal(spoken.length,2,'unmuting cannot replay old introductions');
});

test('replay cannot bypass master or category preferences, and other categories still work',()=>{
 const {voice,spoken}=fixture();voice.unlock();voice.setPreferences({announcementsMuted:true});
 announce(voice,'A muted job');assert.equal(voice.replay(),false);assert.equal(spoken.length,0);
 announce(voice,'Welcome','introduction');assert.equal(spoken.length,1);
 voice.setPreferences({masterMuted:true});assert.equal(voice.state.speaking,false);assert.equal(voice.replay(),false);
 announce(voice,'A muted welcome','introduction');voice.setPreferences({masterMuted:false});assert.equal(spoken.length,1);
 announce(voice,'A fresh job');assert.equal(spoken.at(-1).text,'A fresh job');
});

test('NPC speech attenuates with distance and stops outside its audible range',()=>{
 const {voice,spoken}=fixture();voice.unlock();
 voice.setScene({listener:{x:0,y:0,z:0},actors:{guide:{position:{x:16,y:0,z:0}}}});
 announce(voice,'A nearby reply','dialogue',{entityId:'guide'});assert.equal(spoken[0].volume,.225);
 voice.setScene({listener:{x:16,y:0,z:0},actors:{guide:{position:{x:16,y:0,z:0}}}});assert.equal(spoken[0].volume,.9);
 voice.setScene({listener:{x:60,y:0,z:0},actors:{guide:{position:{x:16,y:0,z:0}}}});assert.equal(voice.state.speaking,false);
 assert.equal(voice.replay(),true);assert.equal(spoken.length,1,'out-of-range replay remains inaudible');
 voice.setPreferences({spatialAudio:false});announce(voice,'A distant reply','dialogue',{entityId:'guide'});assert.equal(spoken.at(-1).volume,.9);
});

test('expired queued announcements are discarded after gesture delay and while waiting for speech',()=>{
 const {voice,spoken,advance}=fixture();
 announce(voice,'Expired welcome','introduction');advance(30001);voice.unlock();assert.equal(spoken.length,0);
 announce(voice,'Current job');announce(voice,'Stale next job');advance(30001);spoken[0].onend();assert.equal(spoken.length,1);
});

test('duplicate updates cannot repeat a line, including updates observed while muted',()=>{
 const {voice,spoken}=fixture();voice.unlock();
 const call={id:'reply-1',at:1000,conversation:true,interaction:true,recipients:['self'],text:'A reply',role:'guide'};
 const options={worldId:'map',actorId:'self',serverTime:1000};
 voice.ingest([call],options);voice.ingest([call],options);assert.equal(spoken.length,1);assert.equal(voice.state.pending,0);
 spoken[0].onend();voice.setPreferences({dialogueMuted:true});voice.ingest([{...call,id:'reply-2'}],options);
 voice.setPreferences({dialogueMuted:false});voice.ingest([{...call,id:'reply-2'}],options);assert.equal(spoken.length,1);
});


test('flat map source positions remain audible and watchdog cancels stalled speech',()=>{
 const {voice,spoken,timers}=fixture();voice.unlock();
 voice.setScene({listener:{x:0,y:0,z:0}});
 announce(voice,'Flat-map reply','dialogue',{source:{x:16,z:0}});assert.equal(spoken[0].volume,.225);
 announce(voice,'Next response');const watchdog=[...timers.values()][0];watchdog();
 assert.equal(spoken.at(-1).text,'Next response');
 spoken[0].onend();assert.equal(voice.state.speaking,true,'late callback cannot end the next response');
});
