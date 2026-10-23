import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplayAnnouncements} from '../public/js/gameplay-announcements.js';
import {createQuestConversationVoice} from '../public/js/quest-conversation-voice.js';

test('jobs, objective changes, nearby NPCs and crew work produce scoped audio calls without heartbeat repeats',()=>{
 const calls=[],voice={announce:(text,options)=>calls.push({text,...options})},announcer=createGameplayAnnouncements({voice}),world={id:'world',name:'Public world'};
 const snapshot={serverTime:100000,players:{p:{position:{x:0,y:0,z:0},vehicleMission:{instanceId:'job',title:'Supply flight',status:'active',index:0,checkpoints:[{name:'Load supplies'},{name:'Fly to camp'}]}}},actors:{ranger:{id:'ranger',active:true,position:{x:2,y:0,z:0},resident:{name:'Rowan',role:'Ranger',task:'Preparing trail supplies.'}}},construction:{crew:{jobs:[{id:'build',label:'Repair the bridge',status:'active'}]}}};
 announcer.update(snapshot,'p',world);assert.ok(calls.some(call=>call.text.includes('Load supplies')));assert.ok(calls.some(call=>call.text.includes('Rowan')));assert.ok(calls.some(call=>call.text.includes('Repair the bridge')));
 const count=calls.length;announcer.update(snapshot,'p',world);assert.equal(calls.length,count);
 snapshot.players.p.vehicleMission.index=1;announcer.update(snapshot,'p',world);assert.ok(calls.at(-1).text.includes('Fly to camp'));
 snapshot.players.p.vehicleMission.status='completed';announcer.update(snapshot,'p',world);assert.ok(calls.at(-1).text.includes('completed'));
 snapshot.construction.crew.jobs[0].status='completed';announcer.update(snapshot,'p',world);assert.ok(calls.at(-1).text.includes('Repair the bridge'));
});
test('announcements exclude private and stale calls and describe new walking quests',()=>{
 const calls=[],announcer=createGameplayAnnouncements({voice:{announce:text=>calls.push(text)}}),world={id:'camp',name:'Camp',builderScene:{objects:[{name:'Trail explorer',functionalSettings:{quest:{id:'trail'}},dialogueSettings:{text:'Find the compass badge.'}}]}};
 const snapshot={serverTime:100000,players:{p:{quests:{trail:'active'}}},actors:{},transportRadio:[{id:1,at:100000,recipients:['other'],text:'Private secret'},{id:2,at:1,text:'Old call'},{id:3,at:100000,speaker:'Dispatch',text:'Your rescue is ready.'}]};
 announcer.update(snapshot,'p',world);assert.ok(calls.some(text=>text.includes('compass badge')));assert.ok(calls.some(text=>text.includes('rescue is ready')));assert.ok(calls.every(text=>!text.includes('Private secret')&&!text.includes('Old call')));
});
test('audio starts at a gesture, defaults to enabled, respects mute and shares deduplicated calls',()=>{
 const spoken=[],speech={speak:utterance=>spoken.push(utterance),cancel(){},resume(){}},voice=createQuestConversationVoice({speech,Utterance:class{constructor(text){this.text=text;}},setTimer:()=>1,clearTimer(){}});
 voice.announce('Boarding ready.',{worldId:'airport',key:'board'});assert.equal(spoken.length,0);voice.unlock();assert.equal(spoken[0].text,'Boarding ready.');
 voice.announce('Boarding ready.',{worldId:'airport',key:'board'});assert.equal(voice.state.pending,0);spoken[0].onend();
 voice.setMuted(true);voice.announce('Muted objective.',{worldId:'airport',key:'muted'});assert.equal(spoken.length,1);
 voice.setMuted(false);voice.announce('Next objective.',{worldId:'airport',key:'next'});assert.equal(spoken.at(-1).text,'Next objective.');voice.dispose();
});
