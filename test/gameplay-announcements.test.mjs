import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplayAnnouncements,interactionHasDialogue} from '../public/js/gameplay-announcements.js';
import {createQuestConversationVoice} from '../public/js/quest-conversation-voice.js';
import {GENERATED_VOICES} from '../public/js/neural-character-speech.js';

function fixture(){const calls=[],voice={announce:(text,options)=>calls.push({text,...options})},announcer=createGameplayAnnouncements({voice}),world={id:'world',name:'Public world'};return {calls,announcer,world};}
function snapshot(){return {serverTime:100000,players:{p:{position:{x:0,y:0,z:0},quests:{}}},actors:{},construction:{crew:{jobs:[]}}};}

test('each map visit receives one guide while initial jobs and nearby residents stay quiet',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();
 state.players.p.vehicleMission={instanceId:'job',title:'Supply flight',status:'active',index:0,checkpoints:[{name:'Load supplies'},{name:'Fly to camp'}]};
 state.actors.ranger={id:'ranger',active:true,position:{x:2,y:0,z:0},resident:{name:'Rowan',role:'Ranger',task:'Preparing trail supplies.'}};
 state.construction.crew.jobs.push({id:'build',label:'Repair the bridge',status:'active'});
 state.transportRadio=[{id:1,at:100000,speaker:'Pilot',text:'Patrolling airspace.'}];
 announcer.update(state,'p',world);assert.equal(calls.length,1);assert.equal(calls[0].category,'introduction');assert.equal(calls[0].role,'narrator');assert.equal(calls[0].voice,'World narrator');assert.match(calls[0].text,/Welcome to Public world/);
 announcer.update(state,'p',world);assert.equal(calls.length,1);
 announcer.update(state,'p',{id:'camp',name:'Camp'});assert.equal(calls.length,2);
 announcer.update(state,'p',world);assert.equal(calls.length,3);assert.match(calls.at(-1).text,/Welcome to Public world/);
 announcer.update(state,'p',world);assert.equal(calls.length,3);
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

test('a missing player does not consume the visit introduction or baseline',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();announcer.update({...state,players:{}},'p',world);assert.equal(calls.length,0);
 announcer.update(state,'p',world);assert.equal(calls.length,1);
});

test('audio starts at a gesture, defaults to enabled, respects mute and shares deduplicated calls',()=>{
 const spoken=[],speech={getVoices:()=>GENERATED_VOICES,speak:utterance=>spoken.push(utterance),cancel(){},resume(){}},voice=createQuestConversationVoice({speech,Utterance:class{constructor(text){this.text=text;}},setTimer:()=>1,clearTimer(){}});
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


test('fresh open player help requests speak once, while own, stale and closed calls stay quiet',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();announcer.update(state,'p',world);
 state.questTeams=[{id:'open'}];
 state.transportRadio=[
  {id:1,at:state.serverTime,helpRequest:true,speaker:'Rescuer',speakerId:'h',teamId:'open',expires:190000,text:'Join my rescue team.'},
  {id:2,at:state.serverTime,helpRequest:true,speakerId:'p',teamId:'open',expires:190000,text:'Own help call'},
  {id:3,at:state.serverTime,helpRequest:true,speakerId:'h',teamId:'closed',expires:190000,text:'Closed team'},
  {id:4,at:state.serverTime,helpRequest:true,speakerId:'h',teamId:'open',expires:state.serverTime,text:'Expired help'},
  {id:5,at:state.serverTime-13000,helpRequest:true,speakerId:'h',teamId:'open',expires:190000,text:'Stale help'}
 ];
 announcer.update(state,'p',world);assert.equal(calls.length,2);assert.match(calls.at(-1).text,/Join my rescue team/);
 announcer.update(state,'p',world);assert.equal(calls.length,2);
});


test('confirmed same-map re-entry resets the guide without replaying the job backlog',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();
 state.liveDispatch={id:'existing',title:'Old job',expires:190000};
 announcer.update(state,'p',world);announcer.reset();announcer.update(state,'p',world);
 assert.equal(calls.length,2);assert.ok(calls.every(call=>call.category==='introduction'));
 assert.notEqual(calls[0].key,calls[1].key);
});

test('the first entry guide waits for a player gesture and follows later map entries',()=>{
 const spoken=[],speech={getVoices:()=>GENERATED_VOICES,speak:utterance=>spoken.push(utterance),cancel(){},resume(){}},voice=createQuestConversationVoice({speech,Utterance:class{constructor(text){this.text=text;}},setTimer:()=>1,clearTimer(){}}),announcer=createGameplayAnnouncements({voice}),state=snapshot();
 announcer.update(state,'p',{id:'airport',name:'Airport',airport:{enabled:true}});assert.equal(spoken.length,0);
 announcer.unlock();assert.equal(spoken.length,1);assert.match(spoken[0].text,/Tower radio/);spoken[0].onend();
 announcer.update(state,'p',{id:'fitness',name:'Fitness',game:'fitness'});assert.equal(spoken.length,2);assert.match(spoken[1].text,/training station/);spoken[1].onend();
 announcer.update(state,'p',{id:'airport',name:'Airport',airport:{enabled:true}});assert.equal(spoken.length,3);
 voice.dispose();
});

test('AI dispatch explains the actual map offer and does not repeat it on heartbeats',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();announcer.update(state,'p',world);
 state.questOffers=[{id:'rescue',description:'Board an aircraft, fly the marked beacons and land to recover the crew.'}];
 state.liveDispatch={id:'dispatch',questId:'rescue',title:'Crew rescue',speaker:'Tower',expires:190000};
 announcer.update(state,'p',world);
 assert.equal(calls.length,2);assert.match(calls.at(-1).text,/Board an aircraft, fly the marked beacons and land/);assert.equal(calls.at(-1).voice,'Tower');
 announcer.update(state,'p',world);assert.equal(calls.length,2);
});

test('factory orders and tests announce new server stages once and remain local to their map',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();
 state.players.p.factory={job:{id:'old-order',environmentId:world.id,status:'processing',stepIndex:0,name:'Cargo model',steps:[{name:'Fabrication'},{name:'Assembly'}],message:'Fabrication running.'}};
 state.players.p.testing={session:{id:'old-test',environmentId:world.id,status:'configured',itemName:'Training model',message:'Test configured.'}};
 announcer.update(state,'p',world);assert.equal(calls.length,1,'entry establishes the existing order baseline');
 const job=state.players.p.factory.job;job.status='awaiting';job.stepIndex=1;job.message='Continue at assembly.';
 announcer.update(state,'p',world);assert.equal(calls.length,2);assert.match(calls.at(-1).text,/Factory order.*Continue at assembly.*Next: Assembly/);
 announcer.say(job.message,'factory-action-response');assert.equal(calls.length,2,'the explicit action response does not repeat the snapshot instruction');
 state.players.p.testing.session.status='deployed';state.players.p.testing.session.message='Model deployed. Arm the pad when ready.';
 announcer.update(state,'p',world);assert.equal(calls.length,3);assert.match(calls.at(-1).text,/Model test.*Arm the pad/);
 announcer.say(state.players.p.testing.session.message,'proving-action-response');assert.equal(calls.length,3,'the explicit test action is already explained');
 announcer.update(state,'p',world);assert.equal(calls.length,3);
 job.environmentId='another-factory';job.status='ready';job.message='Foreign order';
 announcer.update(state,'p',world);assert.equal(calls.length,3,'saved work from another map is not an available local task');
});

test('shipping information follows checkpoints without duplicating freight-control calls',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();announcer.update(state,'p',world);
 const job=state.players.p.shipping={job:{id:'manifest',environmentId:world.id,title:'Supply voyage',phase:'loading',checkpointIndex:0,waypoints:[{name:'Harbor gate'},{name:'Receiving dock'}],message:'Manifest accepted. Load the containers.'}};
 state.transportRadio=[{id:1,at:state.serverTime,speaker:'Freight control',recipients:['p'],text:job.job.message}];
 announcer.update(state,'p',world);assert.equal(calls.length,2);assert.match(calls.at(-1).key,/radio:/);
 job.job.phase='sailing';job.job.checkpointIndex=1;job.job.message='Checkpoint confirmed. Follow the marked lane.';
 announcer.update(state,'p',world);assert.equal(calls.length,3);assert.match(calls.at(-1).text,/Shipping manifest.*Receiving dock/);
 announcer.update(state,'p',world);assert.equal(calls.length,3);
});

test('requested AI work reports useful phase changes without reading progress ticks or ambient jobs',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();announcer.update(state,'p',world);
 state.factory={crewWork:{job:{id:'ambient',status:'working',message:'Ambient machine running.'}}};
 const conversation=state.players.p.npcConversation={contact:'Maya',aiWorkContext:{kind:'world',workerId:'maya'},aiWork:{id:'request',requested:true,workerName:'Maya',status:'active',phase:'walking',machineName:'Beacon switch',message:'Walking to the beacon.',progress:0}};
 announcer.update(state,'p',world);assert.equal(calls.length,2);assert.match(calls.at(-1).text,/Maya.*AI work.*Walking to the beacon/);assert.equal(calls.at(-1).voice,'Maya');
 conversation.aiWork.progress=.5;announcer.update(state,'p',world);assert.equal(calls.length,2);
 conversation.aiWork.status='completed';conversation.aiWork.phase='done';conversation.aiWork.message='Beacon restored.';
 announcer.update(state,'p',world);assert.equal(calls.length,3);assert.match(calls.at(-1).text,/Beacon restored/);
 assert.ok(calls.every(call=>!call.text.includes('Ambient machine')));
 const previousKey=calls[1].key;conversation.aiWork={...conversation.aiWork,id:'second-request',status:'active',phase:'walking',message:'Walking to the beacon.'};
 announcer.update(state,'p',world);assert.equal(calls.length,4);assert.notEqual(calls.at(-1).key,previousKey,'another requested job can repeat the same phase');
});

test('AI task information remains in its direct reply when that response is already voiced',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();announcer.update(state,'p',world);
 state.players.p.npcConversation={aiWorkContext:{kind:'world',workerId:'maya'},aiWork:{id:'request',requested:true,workerName:'Maya',status:'active',phase:'walking',message:'Walking to the beacon.'},conversation:[{conversation:true,role:'guide',at:state.serverTime,recipients:['p'],text:'Walking to the beacon.'}]};
 announcer.update(state,'p',world);assert.equal(calls.length,1);
 announcer.update(state,'p',world);assert.equal(calls.length,1);
});

test('meeting a working AI contact does not subscribe to autonomous or other-player jobs',()=>{
 const {calls,announcer,world}=fixture(),state=snapshot();announcer.update(state,'p',world);
 state.players.p.npcConversation={aiWorkContext:{kind:'factory',workerId:'worker'},aiWork:{id:'ambient-production',requested:false,status:'processing',phase:'processing',message:'Ambient machine running.'}};
 announcer.update(state,'p',world);assert.equal(calls.length,1);
 state.players.p.npcConversation.aiWork.status='completed';announcer.update(state,'p',world);assert.equal(calls.length,1);
});
