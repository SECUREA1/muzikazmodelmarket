import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuestConversationVoice} from '../public/js/quest-conversation-voice.js';
import {GENERATED_VOICES} from '../public/js/neural-character-speech.js';

function fixture({voices=GENERATED_VOICES}={}){
 let time=1000,cancels=0;
 const spoken=[],timers=new Map(),delays=[];let sequence=0;
 const voice=createQuestConversationVoice({
  speech:{speak:call=>spoken.push(call),cancel:()=>cancels++,resume(){},getVoices:()=>voices},
  Utterance:class{constructor(text){this.text=text;}},now:()=>time,
  setTimer:(call,delay)=>{delays.push(delay);timers.set(++sequence,call);return sequence;},clearTimer:id=>timers.delete(id)
 });
 return {voice,spoken,timers,delays,advance:ms=>time+=ms,get cancels(){return cancels;}};
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
 announce(voice,'Expired job');advance(30001);voice.unlock();assert.equal(spoken.length,0);
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

test('failed online natural voice retries once locally without allowing old callbacks to finish the retry',()=>{
 const spoken=[],remote={name:'Online Natural',lang:'en-US',voiceURI:'online',localService:false},local={name:'Local enhanced',lang:'en-US',voiceURI:'local',localService:true};
 const voice=createQuestConversationVoice({speech:{getVoices:()=>[remote,local],speak:call=>spoken.push(call),resume(){},cancel(){}},Utterance:class{constructor(text){this.text=text;}},setTimer:()=>1,clearTimer(){}});
 voice.unlock();announce(voice,'Your next objective is ready.','dialogue');assert.equal(spoken[0].voice,remote);
 spoken[0].onerror({error:'network'});assert.equal(spoken.length,2);assert.equal(spoken[1].voice,local);
 spoken[0].onend();assert.equal(voice.state.speaking,true);
 spoken[1].onerror({error:'synthesis-failed'});assert.equal(spoken.length,2);assert.equal(voice.state.speaking,false);
 voice.dispose();
});

test('an error after speech begins never repeats the NPC sentence',()=>{
 const spoken=[],voice=createQuestConversationVoice({speech:{getVoices:()=>GENERATED_VOICES,speak:call=>spoken.push(call),resume(){},cancel(){}},Utterance:class{constructor(text){this.text=text;}},setTimer:()=>1,clearTimer(){}});
 voice.unlock();announce(voice,'Please follow the marked route.','dialogue');spoken[0].onstart();spoken[0].onerror({error:'network'});
 assert.equal(spoken.length,1);assert.equal(voice.state.speaking,false);voice.dispose();
});

test('long fresh dialogue keeps its follow-up while outdated announcements expire',()=>{
 const {voice,spoken,advance,timers}=fixture();voice.unlock();
 const long=Array.from({length:140},()=> 'training').join(' ')+'.';announce(voice,long,'dialogue');
 assert.equal(timers.size,1);announce(voice,'I understand.','dialogue');announce(voice,'A stale job update.');
 advance(65000);spoken[0].onend();assert.equal(spoken[1].text,'I understand.');spoken[1].onend();assert.equal(spoken.length,2);voice.dispose();
});

test('introductions use a clear centered narrator without character pitch or distance effects',()=>{
 const spoken=[],uk={name:'UK Natural',lang:'en-GB',voiceURI:'uk'},us={name:'US Natural',lang:'en-US',voiceURI:'us',default:true};
 const voice=createQuestConversationVoice({speech:{getVoices:()=>[uk,us],speak:call=>spoken.push(call),resume(){},cancel(){}},Utterance:class{constructor(text){this.text=text;}},setTimer:()=>1,clearTimer(){}});
 voice.setScene({listener:{x:100,y:0,z:0},actors:{npc:{position:{x:0,y:0,z:0},resident:{name:'Energetic pilot',personality:'Urgent',voiceProfile:{rate:1.8,pitch:.5}}}}});
 voice.unlock();voice.announce('Welcome to the world.',{worldId:'map',category:'introduction',entityId:'npc',source:{x:0,y:0,z:0},voiceProfile:{pitch:.5,rate:1.8}});
 assert.equal(spoken[0].voice,us);assert.equal(spoken[0].pitch,1);assert.equal(spoken[0].rate,1);assert.equal(spoken[0].volume,.85);
 voice.setScene({listener:{x:500,y:0,z:0}});assert.equal(voice.state.speaking,true);assert.equal(spoken[0].volume,.85);voice.dispose();
});

test('preview selects the real generated gender and URI and reports playback only after onstart',async()=>{
 const {voice,spoken,timers,delays}=fixture(),male=GENERATED_VOICES.find(candidate=>candidate.gender==='male');
 const preview=voice.preview({speechVoiceGender:'male',speechVoiceURI:male.voiceURI});
 assert.equal(spoken.length,1);assert.equal(spoken[0].voice,male);assert.equal(spoken[0].pitch,1);assert.equal(spoken[0].rate,1);
 assert.equal(delays.at(-1),65000,'generation gets its own initial timeout');
 let reported=false;preview.then(()=>reported=true);await Promise.resolve();assert.equal(reported,false,'requesting generation is not proof of audible playback');
 spoken[0].onstart();assert.equal(await preview,'Playing '+male.name+'.');assert.equal(timers.size,1);assert.ok(delays.at(-1)<65000,'actual playback watchdog replaces generation deadline once audio starts');
 spoken[0].onend();assert.equal(voice.state.speaking,false);voice.dispose();
});

test('changing the selected generated voice clears an earlier character cast',async()=>{
 const {voice,spoken}=fixture(),female=GENERATED_VOICES.find(candidate=>candidate.gender==='female'),male=GENERATED_VOICES.find(candidate=>candidate.gender==='male');
 const first=voice.preview({speechVoiceGender:'female',speechVoiceURI:female.voiceURI});assert.equal(spoken[0].voice,female);spoken[0].onstart();await first;spoken[0].onend();
 voice.setPreferences({speechVoiceGender:'male',speechVoiceURI:male.voiceURI});announce(voice,'A new response from the same guide.','dialogue');assert.equal(spoken.at(-1).voice,male);voice.dispose();
});

test('unavailable or rejected voices stay silent rather than using a hidden browser default',async()=>{
 for(const voices of [[],[{name:'eSpeak English',voiceURI:'espeak:en',lang:'en-US',localService:true}]]){
  const {voice,spoken}=fixture({voices});
  const status=await voice.preview();assert.match(status,/unavailable/i);assert.equal(spoken.length,0);assert.equal(voice.state.speaking,false);
  announce(voice,'This visible line remains available.','dialogue');assert.equal(spoken.length,0);voice.dispose();
 }
});

test('preview respects saved master and NPC conversation mutes',async()=>{
 const {voice,spoken}=fixture();
 assert.match(await voice.preview({masterMuted:true}),/Unmute/);assert.equal(spoken.length,0);
 assert.match(await voice.preview({dialogueMuted:true}),/Unmute/);assert.equal(spoken.length,0);voice.dispose();
});

test('a failed selected voice has no anonymous default-voice retry',()=>{
 const spoken=[],remote={name:'Online Natural',lang:'en-US',voiceURI:'online',localService:false};
 const voice=createQuestConversationVoice({speech:{getVoices:()=>[remote],speak:call=>spoken.push(call),resume(){},cancel(){}},Utterance:class{constructor(text){this.text=text;}},setTimer:()=>1,clearTimer(){}});
 voice.unlock();announce(voice,'Your message is still visible.','dialogue');spoken[0].onerror({error:'network'});
 assert.equal(spoken.length,1);assert.equal(voice.state.speaking,false);voice.dispose();
});

test('long speech receives its full playback budget after generation finishes',()=>{
 const {voice,spoken,delays,timers}=fixture();voice.unlock();
 const long='Training guidance and safe navigation. '.repeat(25);announce(voice,long,'dialogue');
 assert.equal(delays.at(-1),65000);spoken[0].onstart();assert.ok(delays.at(-1)>65000,'long playback is measured after audio begins');assert.equal(timers.size,1);voice.dispose();
});


test('a current-map welcome survives a slow login before the first audio gesture',()=>{
 const {voice,spoken,advance}=fixture();
 announce(voice,'Welcome after login.','introduction');announce(voice,'A stale job.');
 advance(300000);voice.unlock();
 assert.equal(spoken.length,1);assert.equal(spoken[0].text,'Welcome after login.');
 spoken[0].onend();assert.equal(spoken.length,1,'old radio announcements still expire');voice.dispose();
});

test('a delayed welcome never crosses into a replacement map',()=>{
 const {voice,spoken,advance}=fixture();
 announce(voice,'Welcome to the old map.','introduction');advance(60000);
 voice.announce('Welcome to the current map.',{worldId:'replacement',category:'introduction'});
 advance(60000);voice.unlock();
 assert.equal(spoken.length,1);assert.equal(spoken[0].text,'Welcome to the current map.');voice.dispose();
});


test('radio traffic while login is pending cannot evict the map guide',()=>{
 const {voice,spoken,advance}=fixture();
 announce(voice,'Welcome and map guidance.','introduction');
 for(let index=0;index<12;index++)announce(voice,'Job update '+index);
 assert.equal(voice.state.pending,8,'the speech backlog stays bounded');
 advance(60000);voice.unlock();
 assert.equal(spoken.length,1);assert.equal(spoken[0].text,'Welcome and map guidance.');
 spoken[0].onend();assert.equal(spoken.length,1);voice.dispose();
});

test('a denied audio unlock preserves the unheard welcome until the next gesture',()=>{
 const {voice,spoken}=fixture();
 announce(voice,'Welcome after audio is enabled.','introduction');voice.unlock();
 spoken[0].onerror({error:'not-allowed',message:'Tap to enable audio.'});
 assert.equal(voice.state.unlocked,false);assert.equal(voice.state.speaking,false);assert.equal(voice.state.pending,1);
 assert.equal(spoken.length,1,'a blocked output never loops its retries');
 voice.unlock();assert.equal(spoken.length,2);assert.equal(spoken[1].text,spoken[0].text);
 spoken[0].onend();assert.equal(voice.state.speaking,true,'the failed attempt cannot finish the retry');
 spoken[1].onstart();spoken[1].onend();voice.unlock();assert.equal(spoken.length,2,'a completed guide is never replayed by movement');voice.dispose();
});

test('a denied NPC line retains its queued follow-up and mute can still discard both',()=>{
 const {voice,spoken}=fixture();voice.unlock();
 announce(voice,'An unheard NPC reply.','dialogue');announce(voice,'The NPC follow-up.','dialogue');
 spoken[0].onerror({error:'not-allowed'});assert.equal(voice.state.pending,2);
 voice.setPreferences({dialogueMuted:true});assert.equal(voice.state.pending,0);
 voice.unlock();assert.equal(spoken.length,1);voice.dispose();
});

test('a new map discards a blocked welcome and replay resumes the actual output',()=>{
 let resumes=0;const spoken=[],voice=createQuestConversationVoice({speech:{getVoices:()=>GENERATED_VOICES,speak:line=>spoken.push(line),resume(){resumes++;},cancel(){}},Utterance:class{constructor(text){this.text=text;}},setTimer:()=>1,clearTimer(){}});
 voice.unlock();announce(voice,'Old welcome.','introduction');spoken[0].onerror({error:'not-allowed'});
 voice.announce('Current welcome.',{worldId:'current-map',category:'introduction'});voice.unlock();
 assert.equal(spoken[1].text,'Current welcome.');spoken[1].onend();
 assert.equal(voice.replay(),true);assert.equal(resumes,3);assert.equal(spoken.at(-1).text,'Current welcome.');voice.dispose();
});

test('resuming audio can reject without an unhandled rejection or discarding a waiting welcome',async()=>{
 const spoken=[],voice=createQuestConversationVoice({speech:{getVoices:()=>GENERATED_VOICES,speak:line=>spoken.push(line),resume:()=>Promise.reject(new Error('Activation required')),cancel(){}},Utterance:class{constructor(text){this.text=text;}},setTimer:()=>1,clearTimer(){}});
 announce(voice,'A waiting welcome.','introduction');const unlocked=voice.unlock();
 spoken[0].onerror({error:'not-allowed'});assert.equal(await unlocked,false);
 assert.equal(voice.state.unlocked,false);assert.equal(voice.state.pending,1);voice.dispose();
});

test('voice state exposes actual generated output readiness and errors',()=>{
 const speech={getVoices:()=>GENERATED_VOICES,speak(){},resume(){},cancel(){},state:{unlocked:false,loading:false,error:{message:'Tap to resume.'},status:'Tap to resume.'}};
 const voice=createQuestConversationVoice({speech,Utterance:class{},setTimer:()=>1,clearTimer(){}});voice.unlock();
 assert.equal(voice.state.audioReady,false);assert.equal(voice.state.error.message,'Tap to resume.');
 speech.state={unlocked:true,loading:true,error:null,status:'Generating voice…'};
 assert.equal(voice.state.audioReady,true);assert.equal(voice.state.loading,true);assert.equal(voice.state.status,'Generating voice…');voice.dispose();
});

test('generated sentence boundaries allow each next sentence its generation budget',()=>{
 const {voice,spoken,delays,timers}=fixture();voice.unlock();announce(voice,'A long guide with several generated sentences.','introduction');
 spoken[0].onstart();spoken[0].onboundary({name:'sentence',audioDuration:8,remainingSegments:2});
 assert.equal(delays.at(-1),73000);assert.equal(timers.size,1);
 spoken[0].onboundary({name:'sentence',audioDuration:4,remainingSegments:0});assert.equal(delays.at(-1),9000);assert.equal(timers.size,1);
 spoken[0].onend();assert.equal(timers.size,0);voice.dispose();
});
