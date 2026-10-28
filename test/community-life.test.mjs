import test from 'node:test';import assert from 'node:assert/strict';import {stepCommunityLife} from '../server-community-life.mjs';import {residentCommand} from '../server-world-residents.mjs';
test('shared work needs both named partners at their actual positions and builds a persistent relationship',()=>{
 const cast=[0,1].map(i=>({id:'resident-'+i,position:{x:i*3,y:0,z:0},resident:{name:['Maya Reed','Leo Reed'][i],role:'Community host',home:{x:i*3,y:0,z:0},phase:'working',ageGroup:i?'child':'adult'}})),sim={actors:Object.fromEntries(cast.map(a=>[a.id,a]))};
 stepCommunityLife(sim,cast,1000,.1);const task=cast[0].resident.sharedTask;assert.match(task.title,/passing/);cast[1].position.x=20;for(let i=0;i<100;i++)stepCommunityLife(sim,cast,2000+i*250,.25);assert.equal(task.elapsed,.1,'an absent helper cannot award shared work');cast[1].position.x=3;for(let i=0;i<70;i++)stepCommunityLife(sim,cast,30000+i*250,.25);assert.equal(cast[0].resident.completedCommunityTasks,1);assert.equal(cast[1].resident.completedCommunityTasks,1);assert.equal(cast[0].resident.relationships.find(person=>person.id==='resident-1').affinity,5);assert.match(cast[0].resident.speech,/Leo Reed/);
});
test('a machine worker answers locally with their real current job and refuses remote conversation',()=>{
 const worker={id:'crew-maya',name:'Maya Chen',role:'Crane operator',position:{x:0,y:0,z:0},home:{x:0,y:0,z:0},jobId:'steel',message:'Aligning the next connection'},sim={actors:{},players:{},events:[],construction:{crew:{workers:[worker],jobs:[{id:'steel',label:'Erect structural steel'}]}}},player={actorId:'alice',username:'Alice',health:100,lastSeen:10000,position:{x:1,y:0,z:0}},world={id:'site'};
 residentCommand(sim,player,world,{entityId:worker.id,choice:'question'},10000);assert.match(player.npcConversation.contact.name,/Maya Chen/);assert.match(worker.speech,/Erect structural steel/);player.position.x=20;player.lastSeen=12000;assert.throws(()=>residentCommand(sim,player,world,{entityId:worker.id,choice:'day'},12000),/closer/);assert.equal(Object.keys(sim.actors).length,0,'talk never creates duplicate physical workers');
});

test('nearby crew expose a named local conversation while vehicle keys stay reserved for machines',async()=>{
 const {sharedNearbyActions}=await import('../public/js/gameplay-actions.js'),self={id:'player',health:100,position:{x:0,y:0,z:0}},crew={workers:[{id:'crew-maya',name:'Maya Chen',position:{x:1,y:0,z:0}}]};
 const action=sharedNearbyActions(self,{}, {},null,crew)[0];assert.equal(action.resident,true);assert.equal(action.entityId,'crew-maya');assert.match(action.label,/Maya Chen/);assert.equal(sharedNearbyActions(self,{}, {},'f',crew).length,0);crew.workers[0].position.x=10;assert.equal(sharedNearbyActions(self,{}, {},null,crew).length,0);
});

function team(kind='park'){
 const cast=['Maya','Leo'].map((name,i)=>({id:'team-'+i,active:true,health:100,position:{x:i*3,y:0,z:0},resident:{name,role:'Local helper',home:{x:i*3,y:0,z:0},intelligenceVersion:1,context:{worldId:'garden',kind,primarySkill:'observation'},skills:{social:40,observation:50},needs:{energy:85,social:50,purpose:40},relationships:[]}}));
 return {cast,sim:{actors:Object.fromEntries(cast.map(a=>[a.id,a])),residentLife:{stats:{},events:[]}}};
}

test('team duties follow the local activity and require staged contributions from separate work positions',()=>{
 const {sim,cast}=team('music');stepCommunityLife(sim,cast,1000,.25);
 const [a,b]=cast.map(person=>person.resident),task=a.sharedTask;
 assert.equal(task.kind,'music');assert.match(task.title,/duet/);assert.notEqual(task.responsibility,b.sharedTask.responsibility);assert.notDeepEqual(task.workPosition,b.sharedTask.workPosition);
 for(let i=1;i<=20;i++)stepCommunityLife(sim,cast,1000+i*250,.25);
 assert.equal(task.stageIndex,1);assert.match(task.responsibility,/lead phrase/);assert.match(b.sharedTask.responsibility,/rhythm/);
 for(let i=21;i<=52;i++)stepCommunityLife(sim,cast,1000+i*250,.25);
 assert.equal(task.stageIndex,2);assert.match(task.responsibility,/timing/);
 for(let i=53;i<=65;i++)stepCommunityLife(sim,cast,1000+i*250,.25);
 assert.equal(a.sharedTask,undefined);assert.equal(a.completedCommunityTasks,1);assert.equal(sim.communityLife.completed,1);
 assert.equal(a.communityHistory[0].status,'completed');assert.equal(a.communityHistory[0].partnerName,'Leo');assert.ok(a.skills.observation>50);assert.ok(a.memory.some(item=>item.kind==='community-task'));assert.equal(sim.residentLife.stats.communityTasks,1);
});

test('teamwork yields to assigned machine jobs, personal objectives, conversation and depleted energy',()=>{
 const conflicts=[actor=>{actor.aiTask={status:'active'};},actor=>{actor.resident.machineWork={status:'active'};},actor=>{actor.resident.objective={status:'active'};},actor=>{actor.resident.goal={kind:'objective'};},actor=>{actor.resident.conversationId='talk';},actor=>{actor.resident.needs.energy=10;}];
 for(const conflict of conflicts){const {sim,cast}=team();conflict(cast[0]);const original=structuredClone(cast[0].resident.goal);stepCommunityLife(sim,cast,1000,.25);assert.equal(cast[0].resident.sharedTask,undefined);assert.equal(cast[1].resident.sharedTask,undefined);assert.deepEqual(cast[0].resident.goal,original);}
 const {sim,cast}=team();stepCommunityLife(sim,cast,1000,.25);cast[1].aiTask={status:'active'};cast[1].resident.goal={kind:'work',reason:'Player request'};stepCommunityLife(sim,cast,1250,.25);
 assert.equal(cast[0].resident.sharedTask,undefined);assert.equal(cast[1].resident.sharedTask,undefined);assert.equal(cast[1].resident.goal.reason,'Player request');assert.equal(cast[0].resident.communityHistory[0].status,'interrupted');assert.equal(cast[0].resident.completedCommunityTasks,undefined);
});

test('separate floors, departed partners, repeated timestamps and paused conversation cannot produce team progress',()=>{
 const {sim,cast}=team();cast[1].position.y=cast[1].resident.home.y=5;stepCommunityLife(sim,cast,1000,.25);assert.equal(cast[0].resident.sharedTask,undefined);
 cast[1].position.y=cast[1].resident.home.y=0;stepCommunityLife(sim,cast,1250,.25);const task=cast[0].resident.sharedTask;assert.equal(task.elapsed,.25);
 for(let i=0;i<100;i++)stepCommunityLife(sim,cast,1250,.25);assert.equal(task.elapsed,.25);
 cast[1].resident.pauseUntil=5000;stepCommunityLife(sim,cast,1500,.25);assert.equal(task.elapsed,.25);assert.equal(task.state,'waiting');
 cast[1].position.y=5;stepCommunityLife(sim,cast,5250,.25);assert.equal(task.elapsed,.25);assert.equal(task.state,'approaching');
 cast[1].position.y=0;cast[1].active=false;stepCommunityLife(sim,cast,5500,.25);assert.equal(cast[0].resident.sharedTask,undefined);assert.equal(cast[0].resident.completedCommunityTasks,undefined);
});

test('map changes interrupt an old team objective and repeated accomplishments keep bounded history and relationships',()=>{
 const {sim,cast}=team();stepCommunityLife(sim,cast,1000,.25);cast[1].resident.context.worldId='another-map';stepCommunityLife(sim,cast,1250,.25);assert.equal(cast[0].resident.sharedTask,undefined);assert.equal(cast[0].resident.completedCommunityTasks,undefined);
 cast[1].resident.context.worldId='garden';let now=15000;
 for(let round=0;round<20;round++){
  for(const person of cast){person.resident.communityRetryAt=0;person.resident.pauseUntil=0;person.resident.speaking=false;person.resident.speechUntil=0;}
  for(let i=0;i<65;i++){stepCommunityLife(sim,cast,now,.25);now+=250;}
 }
 assert.equal(sim.communityLife.completed,20);assert.equal(cast[0].resident.completedCommunityTasks,20);assert.ok(cast[0].resident.communityHistory.length<=6);assert.ok(sim.communityLife.history.length<=12);assert.ok(cast[0].resident.memory.length<=8);assert.ok(cast[0].resident.relationships.length<=8);assert.ok(cast[0].resident.relationships[0].affinity<=100);
 assert.equal(sim.players,undefined,'teamwork does not manufacture players or player rewards');
});

test('a blocked team approach releases both residents to ordinary activities instead of freezing until its deadline',async()=>{
 const {ensureResidentIntelligence,stepResidentLife}=await import('../server-resident-life.mjs');
 const environment={id:'blocked-team-garden',name:'Garden',builderScene:{mapSize:80,layout:'grand-floor',objects:[],layoutMeta:{locations:[{id:'garden',name:'Garden',x:0,y:0,z:0}]}}};
 const {sim,cast}=team('park');
 const collision={groundAt:(_environment,p)=>({...p}),hasBodyClearance:()=>true,resolve:(_environment,from,to)=>from.x>5&&to.x<from.x?{...from}:{...to}};
 for(const actor of cast){actor.resident.locationIndex=0;ensureResidentIntelligence(sim,actor,environment,100000);}
 stepCommunityLife(sim,cast,100000,.25);
 const taskId=cast[0].resident.sharedTask.id,target={...cast[1].resident.sharedTask.workPosition};
 cast[1].position.x=8;
 for(let index=1;index<=40;index++){
  const now=100000+index*250;stepCommunityLife(sim,cast,now,.25);stepResidentLife(sim,environment,now,.25,{collision});
  const goal=cast[1].resident.goal;
  if(goal?.familyTaskId===taskId)assert.deepEqual(goal.target,target,'the team work position never becomes an unrelated detour');
 }
 for(const actor of cast){
  assert.equal(actor.resident.sharedTask,undefined,'an unreachable partner no longer owns the activity slot');
  assert.ok(actor.resident.communityHistory.some(item=>item.id===taskId&&item.status==='interrupted'));
  assert.notEqual(actor.resident.goal?.familyTaskId,taskId);
  assert.equal(actor.resident.completedCommunityTasks,undefined,'a failed route earns no accomplishment');
 }
});
