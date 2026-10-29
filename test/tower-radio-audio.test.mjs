import test from 'node:test';
import assert from 'node:assert/strict';
import {createTowerRadioAudio} from '../public/js/tower-radio-audio.js';
import {createAircraftCannonTrigger} from '../public/js/aircraft-cannon-trigger.js';
import {speechTimeout} from '../public/js/character-voice-profile.js';
import {GENERATED_VOICES} from '../public/js/neural-character-speech.js';
const fixtureVoice={name:'Natural English Test Voice',voiceURI:'test:english',lang:'en-US',localService:true};
function clock(){let time=0,id=0;const timers=new Map();return {now:()=>time,setTimer:(run,delay)=>{timers.set(++id,{run,at:time+delay});return id;},clearTimer:key=>timers.delete(key),advance(delta){const target=time+delta;for(let count=0;count<1000;count++){const next=[...timers].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].run();}time=target;}};}
function radioFixture({resume=()=>{},audioFactory=()=>null,voices=[fixtureVoice]}={}){const time=clock(),spoken=[],captions=[],states=[],tones=[];const speech={getVoices:()=>voices,speak:utterance=>spoken.push(utterance),cancel(){},resume};class Utterance{constructor(text){this.text=text;}}const radio=createTowerRadioAudio({...time,speech,Utterance,onCaption:text=>captions.push(text),onState:state=>states.push(state),tone:()=>tones.push(time.now()),audioFactory});return {time,spoken,captions,states,tones,radio};}
test('tower audio waits for a gesture, then prioritizes audible stall calls and replaces stale queued speech',()=>{
 const f=radioFixture();f.radio.call('Tower. Request your clearance.',{key:'ready'});assert.equal(f.spoken.length,0);assert.equal(f.captions.length,1);f.radio.unlock();assert.equal(f.spoken[0].text,'Tower. Request your clearance.');
 f.radio.call('Stall warning. Lower the nose.',{key:'stall',priority:'warning',repeatAfter:12000});assert.equal(f.spoken.length,2);assert.equal(f.tones.length,1);f.time.advance(1000);f.radio.call('Stall warning. Lower the nose.',{key:'stall',priority:'warning',repeatAfter:12000});assert.equal(f.spoken.length,2);assert.equal(f.tones.length,1);
 f.radio.call('Tower. Continue climb.',{key:'climb'});f.radio.call('Tower. Approach runway.',{key:'approach'});assert.equal(f.spoken.length,2);f.spoken.at(-1).onend();assert.equal(f.spoken.at(-1).text,'Tower. Approach runway.');assert.equal(f.spoken.length,3,'only latest queued call follows the warning');f.radio.dispose();
});
test('mute cancels calls, replay repeats the latest response, and speech failure preserves captions and warning tones',()=>{
 const f=radioFixture();f.radio.unlock();f.radio.setMuted(true);const count=f.spoken.length;f.radio.call('Tower. Runway occupied.',{key:'traffic'});assert.equal(f.spoken.length,count);assert.equal(f.radio.replay(),false);f.radio.setMuted(false);f.radio.replay();assert.equal(f.spoken.at(-1).text,'Tower. Runway occupied.');f.spoken.at(-1).onerror({error:'synthesis-failed'});assert.equal(f.radio.state.speechAvailable,false);f.radio.call('Stall warning.',{priority:'warning'});assert.equal(f.captions.at(-1),'Stall warning.');assert.equal(f.tones.length,1);assert.equal(f.spoken.length,count+1);f.radio.dispose();
});
test('saved audio mutes stop tower calls and cannot be bypassed by replay or local enable',()=>{
 const f=radioFixture();f.radio.unlock();f.radio.call('New assignment.',{key:'job'});f.radio.setPreferences({masterMuted:true});assert.equal(f.radio.state.speaking,false);assert.equal(f.radio.state.settingsMuted,true);
 const count=f.spoken.length;f.radio.call('Stall warning.',{priority:'warning'});f.radio.setMuted(false);assert.equal(f.radio.replay(),false);assert.equal(f.spoken.length,count);assert.equal(f.tones.length,0);assert.equal(f.captions.at(-1),'Stall warning.');
 f.radio.setPreferences({announcementsMuted:true});assert.equal(f.radio.replay(),false);f.radio.setPreferences({});assert.equal(f.spoken.length,count,'unmuting does not replay missed calls');f.radio.call('Clearance granted.',{key:'clearance'});assert.equal(f.spoken.at(-1).text,'Clearance granted.');f.radio.dispose();
});
test('introduction mute leaves live tower responses available and resets never loop the introduction',()=>{
 const f=radioFixture();f.radio.setPreferences({introductionMuted:true});f.radio.unlock();assert.equal(f.spoken.length,0);f.radio.call('Tower. Ready for takeoff.',{key:'takeoff'});assert.equal(f.spoken.length,1);f.spoken[0].onend();
 f.radio.reset();f.radio.setPreferences({});f.radio.unlock();f.time.advance(60000);assert.equal(f.spoken.length,1);f.radio.call('Cockpit tutorial.',{category:'introduction'});assert.equal(f.spoken.at(-1).text,'Cockpit tutorial.');f.radio.setPreferences({introductionMuted:true});assert.equal(f.radio.state.speaking,false);assert.equal(f.radio.replay(),false);f.radio.dispose();
});
test('cannon visual cadence starts immediately and continues while three network requests remain delayed',async()=>{
 const time=clock(),visuals=[],requests=[];const trigger=createAircraftCannonTrigger({...time,fire:()=>new Promise(resolve=>requests.push({resolve,at:time.now()})),onVisual:shot=>visuals.push(shot.at)});assert.equal(trigger.start(),true);assert.deepEqual(visuals,[0]);assert.equal(requests.length,1);time.advance(800);assert.deepEqual(visuals,[0,200,400,600,800]);assert.equal(requests.length,3);assert.equal(trigger.inFlight,3);
 time.advance(100);requests[0].resolve(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.length,4);assert.equal(requests.at(-1).at,900);trigger.stop();requests[1].resolve(true);requests[2].resolve(true);requests[3].resolve(true);await new Promise(resolve=>setImmediate(resolve));time.advance(1000);assert.equal(requests.length,4);assert.equal(visuals.length,5,'release cancels timers and pending shots');trigger.dispose();
});
test('external reticle inputs share cannon cooldown without requiring expanded manual controls',()=>{
 const time=clock(),shots=[],trigger=createAircraftCannonTrigger({...time,canFire:options=>options.external===true,fire:()=>true,onVisual:shot=>shots.push(shot.at)});assert.equal(trigger.fireOnce(),false);assert.equal(trigger.fireOnce({external:true}),true);assert.equal(trigger.fireOnce({external:true}),false);time.advance(200);trigger.start({external:true});time.advance(400);assert.deepEqual(shots,[0,200,400,600]);trigger.dispose();
});


test('tower chooses a stable natural voice while captions retain original game shorthand',()=>{
 const spoken=[],captions=[],timers=[];
 const natural={name:'English Natural',voiceURI:'natural',lang:'en-US'},basic={name:'eSpeak',voiceURI:'basic',lang:'en-US'};
 let voices=[basic,natural];
 const radio=createTowerRadioAudio({speech:{getVoices:()=>voices,speak:u=>spoken.push(u),cancel(){},resume(){}},Utterance:class{constructor(text){this.text=text;}},setTimer:(run,delay)=>{timers.push({run,delay});return timers.length;},clearTimer(){},audioFactory:()=>null,onCaption:value=>captions.push(value)});
 const original='Tower. Earn +50 MZK → return to base.';
 radio.call(original);radio.unlock();
 assert.equal(captions[0],original);assert.equal(spoken[0].voice,natural);assert.equal(spoken[0].lang,'en-US');assert.ok(spoken[0].text.includes('M Z K'));assert.equal(spoken[0].text.includes('→'),false);
 assert.ok(spoken[0].rate>=.88&&spoken[0].rate<=1.12);assert.ok(spoken[0].pitch>=.9&&spoken[0].pitch<=1.1);
 spoken[0].onend();voices.reverse();radio.call('Tower. Continue approach.',{key:'next'});assert.equal(spoken[1].voice,natural);
 spoken[1].onend();radio.call('Continue along the marked route. '.repeat(20),{key:'long'});
 assert.equal(timers.at(-1).delay,65000,'generation gets its own bounded startup watchdog');
 const long=spoken.at(-1);long.onstart();
 assert.equal(timers.at(-1).delay,speechTimeout(long.text,long.rate),'actual playback watchdog starts only when audio becomes audible');
 assert.ok(timers.at(-1).delay>22000,'long calls have enough time to finish naturally');radio.dispose();
});


test('tower retries an unavailable natural voice once before speech starts without repeating warning tones',()=>{
 const spoken=[],tones=[],time=clock(),natural={name:'English Natural',voiceURI:'online',lang:'en-US',localService:false},local={name:'English installed',voiceURI:'local',lang:'en-US',localService:true};
 const radio=createTowerRadioAudio({...time,speech:{getVoices:()=>[local,natural],speak:u=>spoken.push(u),cancel(){},resume(){}},Utterance:class{constructor(text){this.text=text;}},audioFactory:()=>null,tone:()=>tones.push('warning')});
 radio.call('Stall warning. Lower the nose.',{key:'stall',priority:'warning'});radio.unlock();assert.equal(spoken[0].voice,natural);assert.equal(tones.length,1);
 spoken[0].onerror({error:'network'});assert.equal(spoken.length,2);assert.equal(spoken[1].voice,local);assert.equal(tones.length,1,'fallback does not replay the warning beep');assert.equal(radio.state.speechAvailable,true);
 spoken[0].onend();spoken[0].onerror({error:'synthesis-failed'});assert.equal(spoken.length,2);assert.equal(radio.state.speaking,true,'late callbacks from the failed attempt cannot end its fallback');
 spoken[1].onstart();spoken[1].onerror({error:'network'});assert.equal(spoken.length,2,'never repeat a sentence after speech began');assert.equal(radio.state.speechAvailable,false);radio.dispose();
});

test('tower keeps captions instead of using a hidden default when no real fallback voice is installed',()=>{
 const spoken=[],captions=[],natural={name:'English Natural',voiceURI:'online',lang:'en-US',localService:false};
 const radio=createTowerRadioAudio({speech:{getVoices:()=>[natural],speak:u=>spoken.push(u),cancel(){},resume(){}},Utterance:class{constructor(text){this.text=text;}},audioFactory:()=>null,setTimer:()=>1,clearTimer(){},onCaption:text=>captions.push(text)});
 radio.call('Tower. Continue approach.');radio.unlock();spoken[0].onerror({error:'voice-unavailable'});
 assert.equal(spoken.length,1,'a missing fallback must never select an unlisted browser voice');
 assert.equal(captions.at(-1),'Tower. Continue approach.');assert.equal(radio.state.speechAvailable,false);assert.equal(radio.state.speaking,false);radio.dispose();
});

test('an intentionally empty voice inventory stays caption-only without synthesizing a hidden default',()=>{
 const spoken=[],captions=[],radio=createTowerRadioAudio({speech:{getVoices:()=>[],speak:u=>spoken.push(u),cancel(){},resume(){}},Utterance:class{constructor(text){this.text=text;}},audioFactory:()=>null,setTimer:()=>1,clearTimer(){},onCaption:text=>captions.push(text)});
 radio.call('Tower. Hold short of the runway.');radio.unlock();
 assert.equal(spoken.length,0);assert.equal(captions.at(-1),'Tower. Hold short of the runway.');assert.equal(radio.state.speaking,false);radio.dispose();
});

test('tower never retries a natural voice after the call becomes audible',()=>{
 const spoken=[],natural={name:'English Natural',voiceURI:'online',lang:'en-US',localService:false},local={name:'English installed',voiceURI:'local',lang:'en-US',localService:true};
 const radio=createTowerRadioAudio({speech:{getVoices:()=>[natural,local],speak:u=>spoken.push(u),cancel(){},resume(){}},Utterance:class{constructor(text){this.text=text;}},audioFactory:()=>null,setTimer:()=>1,clearTimer(){}});
 radio.call('Tower. Cleared to land.');radio.unlock();spoken[0].onstart();spoken[0].onerror({error:'network'});
 assert.equal(spoken.length,1,'partially heard calls are not restarted with another voice');assert.equal(radio.state.speaking,false);radio.dispose();
});

test('passive audio unlock stays quiet until a radio introduction is explicitly requested',()=>{
 const f=radioFixture();f.radio.unlock({introduce:false});assert.equal(f.spoken.length,0);
 f.radio.unlock();assert.equal(f.spoken.length,1);assert.match(f.spoken[0].text,/Radio connected/);
 f.spoken[0].onend();f.radio.unlock();assert.equal(f.spoken.length,1,'opening again does not loop the introduction');f.radio.dispose();
});

test('replay on a locked tower speaks one introduction rather than starting and cancelling two copies',()=>{
 const f=radioFixture();f.radio.replay();assert.equal(f.spoken.length,1);assert.match(f.spoken[0].text,/Radio connected/);f.spoken[0].onend();f.radio.unlock();assert.equal(f.spoken.length,1,'replay has already introduced this radio');f.radio.dispose();
});

test('each tower gesture resumes actual output without restarting an active call or looping an introduction',async()=>{
 let resumes=0,contextResumes=0,factories=0;
 const context={state:'suspended',resume(){contextResumes++;this.state='running';return Promise.resolve();},close(){return Promise.resolve();}};
 const f=radioFixture({resume(){resumes++;return resumes===3?Promise.reject(new Error('Activation required')):Promise.resolve(true);},audioFactory:()=>{factories++;return context;}});
 f.radio.unlock({introduce:false});f.radio.unlock({introduce:false});
 assert.equal(resumes,2);assert.equal(contextResumes,2);assert.equal(factories,1);assert.equal(f.spoken.length,0);
 f.radio.call('Tower. Continue approach.',{key:'approach'});context.state='suspended';f.radio.unlock({introduce:false});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(context.state,'running');assert.equal(resumes,3);assert.equal(f.spoken.length,1,'a recovery gesture cannot restart the current call');
 f.spoken[0].onend();f.radio.replay();assert.equal(resumes,4);assert.equal(f.spoken.length,2,'replay resumes and speaks exactly one copy');f.radio.dispose();
});

test('an unheard tower warning waits for another gesture and preserves only the fresh follow-up without a second tone',()=>{
 let resumes=0;const f=radioFixture({resume:()=>{resumes++;},voices:GENERATED_VOICES});
 f.radio.unlock({introduce:false});f.radio.call('Stall warning. Lower the nose.',{key:'stall',priority:'warning'});
 const failed=f.spoken[0];failed.onerror({error:'not-allowed'});
 assert.equal(f.radio.state.unlocked,false);assert.equal(f.radio.state.speaking,false);assert.equal(f.spoken.length,1);assert.equal(f.tones.length,1);
 f.time.advance(30000);assert.equal(f.spoken.length,1,'blocked output never retries itself');
 f.radio.call('Old queued call.',{key:'old'});f.radio.call('Tower. Follow the new approach.',{key:'new'});
 f.radio.unlock({introduce:false});assert.equal(resumes,2);assert.equal(f.spoken.length,2);assert.equal(f.spoken[1].text,failed.text);assert.equal(f.tones.length,1,'the warning tone already sounded before the voice was blocked');
 failed.onend();failed.onerror({error:'not-allowed'});assert.equal(f.radio.state.speaking,true,'failed-attempt callbacks cannot affect the retry');
 f.spoken[1].onstart();f.spoken[1].onend();assert.equal(f.spoken.length,3);assert.equal(f.spoken[2].text,'Tower. Follow the new approach.');
 f.spoken[2].onend();f.radio.unlock({introduce:false});assert.equal(f.spoken.length,3);f.radio.dispose();
});

test('saved mutes and map reset discard blocked tower calls before later resume gestures',()=>{
 for(const drop of [radio=>{radio.setPreferences({announcementsMuted:true});radio.setPreferences({});},radio=>radio.reset()]){
  const f=radioFixture();f.radio.unlock({introduce:false});f.radio.call('A blocked assignment.',{key:'blocked'});f.spoken[0].onerror({error:'not-allowed'});
  drop(f.radio);f.radio.unlock({introduce:false});assert.equal(f.spoken.length,1,'cleared calls must not return after output resumes');f.radio.dispose();
 }
 const f=radioFixture();f.radio.unlock();f.spoken[0].onerror({error:'not-allowed'});
 f.radio.setPreferences({introductionMuted:true});f.radio.setPreferences({});f.radio.unlock();
 assert.equal(f.spoken.length,1,'discarding a blocked introduction does not create another automatic introduction');f.radio.dispose();
});

test('a new control gesture recovers transient speech failures without repeating partly heard calls',()=>{
 const f=radioFixture();f.radio.unlock({introduce:false});f.radio.call('A partly heard clearance.',{key:'clearance'});
 f.spoken[0].onstart();f.spoken[0].onerror({error:'not-allowed'});assert.equal(f.radio.state.speechAvailable,false);
 f.radio.unlock({introduce:false});assert.equal(f.radio.state.speechAvailable,true);assert.equal(f.spoken.length,1,'a partly heard sentence must not restart');
 f.radio.call('A new clearance.',{key:'new'});assert.equal(f.spoken.length,2);f.spoken[1].onerror({error:'synthesis-unavailable'});
 assert.equal(f.radio.state.speechAvailable,false);f.radio.replay();assert.equal(f.radio.state.speechAvailable,true);assert.equal(f.spoken.length,3);assert.equal(f.spoken[2].text,'A new clearance.');f.radio.dispose();
});

test('generated tower segments retain their generation budget before the final playback deadline',()=>{
 const f=radioFixture({voices:GENERATED_VOICES});f.radio.unlock({introduce:false});f.radio.call('A guide with several sentences.',{key:'guide'});
 const line=f.spoken[0];line.onstart();line.onboundary({audioDuration:8,remainingSegments:2});f.time.advance(70000);assert.equal(f.radio.state.speaking,true);
 line.onboundary({audioDuration:4,remainingSegments:0});f.time.advance(8999);assert.equal(f.radio.state.speaking,true);line.onend();f.time.advance(10000);assert.equal(f.radio.state.speaking,false);f.radio.dispose();
});
