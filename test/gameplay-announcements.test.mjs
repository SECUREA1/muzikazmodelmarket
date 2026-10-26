import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplayAnnouncements,interactionHasDialogue} from '../public/js/gameplay-announcements.js';
import {createQuestConversationVoice} from '../public/js/quest-conversation-voice.js';

function fixture(){const calls=[],voice={announce:(text,options)=>calls.push({text,...options})},announcer=createGameplayAnnouncements({voice}),world={id:'world',name:'Public world'};return {calls,announcer,world};}
function snapshot(){return {serverTime:100000,players:{p:{position:{x:0,y:0,z:0},quests:{}}},actors:{},construction:{crew:{jobs:[]}}};}

test('introduction happens once per map, while initial jobs and nearby residents stay quiet',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();
 state.players.p.vehicleMission={instanceId:'job',title:'Supply flight',status:'active',index:0,checkpoints:[{name:'Load supplies'},{name:'Fly to camp'}]};
 state.actors.ranger={id:'ranger',active:true,position:{x:2,y:0,z:0},resident:{name:'Rowan',role:'Ranger',task:'Preparing trail supplies.'}};
 state.construction.crew.jobs.push({id:'build',label:'Repair the bridge',status:'active'});
 state.transportRadio=[{id:1,at:100000,speaker:'Pilot',text:'Patrolling airspace.'}];
 announcer.update(state,'p',world);assert.equal(calls.length,1);assert.equal(calls[0].category,'introduction');assert.equal(calls[0].role,'narrator');assert.equal(calls[0].voice,'World narrator');assert.match(calls[0].text,/Welcome to Public world/);
 announcer.update(state,'p',world);assert.equal(calls.length,1);
 announcer.update(state,'p',{id:'camp',name:'Camp'});assert.equal(calls.length,2);
 announcer.update(state,'p',world);assert.equal(calls.length,2);
 state.players.p.vehicleMission.index=1;announcer.update(state,'p',world);assert.match(calls.at(-1).text,/Fly to camp/);
 assert.equal(calls.at(-1).category,'announcements');
});

test('new jobs, objectives and completion speak once while unchanged snapshots do not',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();announcer.update(state,'p',world);
 state.players.p.vehicleMission={instanceId:'job',title:'Supply flight',status:'active',index:0,checkpoints:[{name:'Load supplies'},{name:'Fly to camp'}]};
 state.construction.crew.jobs.push({id:'build',label:'Repair the bridge',status:'active',workerId:'worker'});
 state.construction.crew.workers=[{id:'worker',position:{x:8,y:0,z:3}}];
 announcer.update(state,'p',world);assert.ok(calls.some(call=>call.text.includes('Load supplies')));assert.ok(calls.some(call=>call.text.includes('Repair the bridge')));
 assert.deepEqual(calls.at(-1).source,{x:8,y:0,z:3});
 const count=calls.length;announcer.update(state,'p',world);assert.equal(calls.length,count);
 state.players.p.vehicleMission.index=1;announcer.update(state,'p',world);assert.match(calls.at(-1).text,/Fly to camp/);
 state.players.p.vehicleMission.status='completed';announcer.update(state,'p',world);assert.match(calls.at(-1).text,/completed/);
 state.construction.crew.jobs[0].status='completed';announcer.update(state,'p',world);assert.match(calls.at(-1).text,/Repair the bridge/);
});

test('only fresh direct radio calls, live dispatch offers and new walking quests are spoken',()=>{
 const {calls,announcer}=fixture(),world={id:'camp',name:'Camp',builderScene:{objects:[{name:'Trail explorer',position:{x:2,y:0,z:1},functionalSettings:{quest:{id:'trail'}},dialogueSettings:{text:'Find the compass badge.'}}]}},state=snapshot();
 state.liveDispatch={id:'old-dispatch',title:'Existing operation',expires:190000};
 announcer.update(state,'p',world);assert.equal(calls.length,1);
 state.players.p.quests.trail='active';
 state.transportRadio=[{id:1,at:100000,recipients:['other'],text:'Private secret'},{id:2,at:1,recipients:['p'],text:'Old call'},{id:3,at:100000,speaker:'Pilot',text:'Patrolling airspace.'},{id:4,at:100000,speaker:'Crew',recipients:['p'],interaction:true,text:'Your rescue is ready.'},{id:5,at:100000,conversation:true,interaction:true,recipients:['p'],text:'Dialogue is handled separately.'}];
 state.liveDispatch={id:'new-dispatch',title:'Rescue the hikers',expires:190000};
 announcer.update(state,'p',world);
 assert.ok(calls.some(call=>call.text.includes('compass badge')));assert.ok(calls.some(call=>call.text.includes('rescue is ready')));assert.ok(calls.some(call=>call.text.includes('Rescue the hikers')));
 assert.ok(calls.every(call=>!/Private secret|Old call|Patrolling|Dialogue is handled/.test(call.text)));
 const count=calls.length;announcer.update(state,'p',world);assert.equal(calls.length,count);
 state.liveDispatch={id:'expired-dispatch',title:'Expired operation',expires:99999};announcer.update(state,'p',world);assert.equal(calls.length,count);
});

test('a missing player does not consume the one-time introduction or baseline',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();announcer.update({...state,players:{}},'p',world);assert.equal(calls.length,0);
 announcer.update(state,'p',world);assert.equal(calls.length,1);
});

test('audio starts at a gesture, defaults to enabled, respects mute and shares deduplicated calls',()=>{
 const spoken=[],speech={speak:utterance=>spoken.push(utterance),cancel(){},resume(){}},voice=createQuestConversationVoice({speech,Utterance:class{constructor(text){this.text=text;}},setTimer:()=>1,clearTimer(){}});
 voice.announce('Boarding ready.',{worldId:'airport',key:'board'});assert.equal(spoken.length,0);voice.unlock();assert.equal(spoken[0].text,'Boarding ready.');
 voice.announce('Boarding ready.',{worldId:'airport',key:'board'});assert.equal(voice.state.pending,0);spoken[0].onend();
 voice.setMuted(true);voice.announce('Muted objective.',{worldId:'airport',key:'muted'});assert.equal(spoken.length,1);
 voice.setMuted(false);voice.announce('Next objective.',{worldId:'airport',key:'next'});assert.equal(spoken.at(-1).text,'Next objective.');voice.dispose();
});


test('a fresh NPC reply suppresses duplicate interaction narration without silencing other actions',()=>{
 const call={conversation:true,role:'guide',speakerId:'rowan',at:100000,recipients:['p']};
 const state={serverTime:100000,players:{p:{npcConversation:{conversation:[call]}}}};
 assert.equal(interactionHasDialogue(state,'p','rowan'),true);
 assert.equal(interactionHasDialogue(state,'p','van'),false);
 assert.equal(interactionHasDialogue(state,'other','rowan'),false);
 call.role='player';assert.equal(interactionHasDialogue(state,'p','rowan'),false);
 call.role='guide';call.at=90000;assert.equal(interactionHasDialogue(state,'p','rowan'),false);
 call.at=100000;call.recipients=['private'];assert.equal(interactionHasDialogue(state,'p','rowan'),false);
});
