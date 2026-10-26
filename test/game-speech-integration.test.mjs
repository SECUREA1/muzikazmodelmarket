import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuestConversationVoice} from '../public/js/quest-conversation-voice.js';
import {createTowerRadioAudio} from '../public/js/tower-radio-audio.js';
function fixture(){
 const spoken=[],timers=new Map();let sequence=0,cancellations=0,active=null;
 const speech={getVoices:()=>[],resume(){},speak(call){active=call;spoken.push(call);call.onstart?.();},cancel(){cancellations++;const old=active;active=null;old?.onerror?.({error:'canceled'});}};
 const options={speech,Utterance:class{constructor(text){this.text=text;}},setTimer:callback=>{timers.set(++sequence,callback);return sequence;},clearTimer:id=>timers.delete(id)};
 return {speech,spoken,timers,voice:createQuestConversationVoice(options),tower:createTowerRadioAudio({...options,audioFactory:()=>null}),get cancellations(){return cancellations;}};
}
function startVoice(f){f.voice.unlock();f.voice.announce('Welcome to the public world.',{worldId:'world',category:'introduction'});}

test('an idle tower cannot cancel an active map welcome when reset, muted or disposed',()=>{
 const f=fixture();startVoice(f);
 f.tower.reset();f.tower.setMuted(true);f.tower.setPreferences({announcementsMuted:true});f.tower.dispose();
 assert.equal(f.cancellations,0);assert.equal(f.voice.state.speaking,true);assert.equal(f.spoken.length,1);f.voice.dispose();
});

test('tower warnings own speech once and stale world callbacks cannot cancel them',()=>{
 const f=fixture();startVoice(f);const oldWelcome=f.spoken[0],oldWatchdog=[...f.timers.values()][0];
 f.voice.announce('An old queued world update.',{worldId:'world'});
 f.tower.call('Stall warning. Lower the nose.',{priority:'warning'});f.tower.unlock({introduce:false});
 assert.equal(f.cancellations,1);assert.equal(f.voice.state.speaking,false);assert.equal(f.voice.state.pending,0);assert.equal(f.tower.state.speaking,true);
 oldWelcome.onend();oldWatchdog();f.voice.reset();
 assert.equal(f.cancellations,1);assert.equal(f.tower.state.speaking,true);assert.equal(f.spoken.length,2);f.tower.dispose();f.voice.dispose();
});

test('an NPC reply interrupts tower speech without allowing its old queue to return',()=>{
 const f=fixture();f.tower.call('Tower. Continue approach.');f.tower.unlock({introduce:false});
 f.tower.call('An old queued tower update.');const oldCall=f.spoken[0],oldWatchdog=[...f.timers.values()][0];
 f.voice.unlock();f.voice.announce('Hello. How can I help?',{worldId:'world',category:'dialogue'});
 assert.equal(f.cancellations,1);assert.equal(f.tower.state.speaking,false);assert.equal(f.voice.state.speaking,true);
 oldCall.onend();oldWatchdog();assert.equal(f.cancellations,1);assert.equal(f.spoken.length,2);
 f.spoken[1].onend();assert.equal(f.spoken.length,2);f.tower.dispose();f.voice.dispose();
});
