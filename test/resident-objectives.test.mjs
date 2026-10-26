import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureResidentIntelligence,stepResidentLife,archiveResidentIntelligence} from '../server-resident-life.mjs';
import {stepAIWorldActions} from '../server-ai-world-actions.mjs';
import {stepWorldResidents} from '../server-world-residents.mjs';

const collision={groundAt:(_env,point)=>({...point}),hasBodyClearance:()=>true,resolve:(_env,_from,to)=>({...to})};
function fixture(){
 const environment={id:'garden-walk',name:'Garden walk',builderScene:{mapSize:100,layout:'grand-floor',objects:[],layoutMeta:{locations:[{id:'welcome',name:'Garden welcome point',x:0,y:0,z:0},{id:'lookout',name:'Garden lookout',x:14,y:0,z:0}]}}};
 const npc={id:'walker',health:100,active:true,position:{x:0,y:0,z:0},resident:{name:'Ellis Reed',home:{x:0,y:0,z:0},locationIndex:0}},sim={actors:{walker:npc},players:{alice:{actorId:'alice',username:'Alice',position:{x:-20,y:0,z:0},health:100,lastSeen:0,score:8,inventory:[],tokens:{MZK:50}}},events:[]};
 ensureResidentIntelligence(sim,npc,environment,100000);Object.assign(npc.resident,{nextObjectiveAt:100000,nextSocialAt:999999,nextAmbientAt:999999});
 return {environment,npc,sim,collision};
}
function advance(f,now,count){for(let i=1;i<=count;i++){f.sim.time=now+i*250;stepResidentLife(f.sim,f.environment,f.sim.time,.25,{collision:f.collision});}return now+count*250;}
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

test('resident accepts a map round, physically checks the landmark and returns before journal credit',()=>{
 const f=fixture(),player=structuredClone(f.sim.players.alice),skill=f.npc.resident.skills.natureObservation;
 advance(f,100000,1);const q=f.npc.resident.objective;
 assert.equal(q.status,'active');assert.equal(q.worldId,f.environment.id);assert.equal(q.index,0);assert.equal(f.npc.resident.objectivesCompleted,undefined);
 let now=100250,maxTravel=0;
 while(q.status==='active'&&now<180000){now=advance(f,now,1);maxTravel=Math.max(maxTravel,gap(f.npc.position,f.npc.resident.home));if(q.index===0)assert.equal(f.npc.resident.objectivesCompleted,undefined);}
 assert.equal(q.status,'completed');assert.ok(maxTravel>5);assert.ok(q.checkpoints.every(point=>point.completedAt-point.arrivedAt>=point.dwell));assert.ok(gap(f.npc.position,f.npc.resident.home)<.3);assert.equal(f.npc.resident.objectivesCompleted,1);assert.ok(f.npc.resident.skills.natureObservation>skill);assert.ok(f.npc.resident.memory.some(item=>item.kind==='objective'));assert.equal(f.sim.residentLife.stats.objectives,1);assert.deepEqual(f.sim.players.alice,player);
});

test('resident rounds respect walls, floor changes, edited landmarks and deadlines',()=>{
 const wall=fixture();wall.collision={...collision,resolve:(_env,from,to)=>to.x>3?from:to};advance(wall,100000,120);assert.equal(wall.npc.resident.objective,undefined);assert.ok(wall.npc.position.x<3.1);
 const floor=fixture();floor.environment.builderScene.layoutMeta.locations[1].y=5;advance(floor,100000,100);assert.equal(floor.npc.resident.objective,undefined);assert.equal(floor.npc.position.y,0);
 const edit=fixture();advance(edit,100000,1);edit.environment={...edit.environment,builderScene:{...edit.environment.builderScene,layoutMeta:{locations:edit.environment.builderScene.layoutMeta.locations.map(p=>p.id==='lookout'?{...p,x:40}:p)}}};advance(edit,100250,1);assert.equal(edit.npc.resident.objective.status,'cancelled');assert.equal(edit.npc.resident.objectivesCompleted,undefined);
 const timeout=fixture();advance(timeout,100000,1);timeout.npc.resident.objective.deadline=100300;advance(timeout,100250,1);assert.equal(timeout.npc.resident.objective.status,'failed');assert.equal(timeout.npc.resident.objectivesCompleted,undefined);
});

test('requested work and conversations pause personal rounds, and save continuation is deterministic',()=>{
 const f=fixture();advance(f,100000,4);const q=f.npc.resident.objective,position={...f.npc.position};
 f.npc.aiTask={status:'active'};advance(f,101000,20);assert.deepEqual(f.npc.position,position);assert.equal(q.index,0);
 f.npc.aiTask.status='completed';f.npc.resident.goal=null;f.npc.resident.pauseUntil=108000;advance(f,106000,4);assert.deepEqual(f.npc.position,position);
 const resumed={...f,sim:structuredClone(f.sim)};resumed.npc=resumed.sim.actors.walker;advance(f,107000,200);advance(resumed,107000,200);assert.deepEqual(resumed.sim,f.sim);assert.equal(f.npc.resident.objectivesCompleted,1);
 const before=structuredClone(f.sim);stepResidentLife(f.sim,f.environment,157000,.25,{collision});assert.deepEqual(f.sim,before,'duplicate timestamp cannot award twice');
 archiveResidentIntelligence(f.sim,f.npc,f.environment,157001);const replacement={id:'walker',health:100,active:true,position:{x:0,y:0,z:0},resident:{name:'A newly generated name',home:{x:0,y:0,z:0},locationIndex:0}};f.sim.actors.walker=replacement;ensureResidentIntelligence(f.sim,replacement,f.environment,157002);assert.equal(replacement.resident.name,'Ellis Reed','legacy names survive distance culling alongside memories');assert.equal(replacement.resident.objectivesCompleted,1);assert.equal(replacement.resident.objectiveHistory.at(-1).status,'completed');assert.equal(replacement.resident.objective,undefined,'active routes are not restored from the archive');
});

test('autonomous controls yield to shared work and rounds; unavailable operators release reservations',()=>{
 for(const mode of ['shared','objective','pause']){
  const f=fixture();f.npc.resident.nextWorldActionAt=0;
  const target={id:'switch',name:'Light',active:true,health:100,position:{x:2,y:0,z:0},definition:{gameplay:{behavior:'switch'}}};f.sim.actors.switch=target;
  if(mode==='shared')f.npc.resident.sharedTask={id:'team'};if(mode==='objective')f.npc.resident.objective={status:'active'};if(mode==='pause')f.npc.resident.pauseUntil=110000;
  stepAIWorldActions(f.sim,f.environment,100000,.25,{collision});assert.equal(f.npc.aiTask,undefined,mode);
 }
 const f=fixture();f.npc.health=0;f.npc.aiTask={id:'last-task',status:'active',targetId:'switch'};f.sim.actors.switch={id:'switch',aiWorldOperator:{npcId:f.npc.id,taskId:'last-task',expiresAt:120000}};
 stepAIWorldActions(f.sim,f.environment,100000,.25,{collision});assert.equal(f.npc.aiTask.status,'cancelled');assert.equal(f.sim.actors.switch.aiWorldOperator,undefined);
});

test('autonomous residents choose recovery when injured, remember real object use, and preserve enabled controls',()=>{
 const f=fixture();f.npc.health=30;f.npc.resident.nextWorldActionAt=0;f.npc.resident.nextObjectiveAt=999999;
 const recovery={id:'recovery',name:'Recovery point',active:true,position:{x:1.8,y:0,z:0},definition:{gameplay:{behavior:'heal',value:25}}},light={id:'light',name:'Garden light',active:true,switched:true,position:{x:0,y:0,z:1.8},definition:{gameplay:{behavior:'switch'}}};f.sim.actors.recovery=recovery;f.sim.actors.light=light;
 const tick=from=>{for(let i=1;i<=12;i++){f.sim.time=from+i*250;stepAIWorldActions(f.sim,f.environment,f.sim.time,.25,{collision});}};
 tick(100000);assert.equal(f.npc.aiTask.kind,'heal');assert.equal(f.npc.aiTask.status,'completed');assert.equal(f.npc.health,55);assert.ok(f.npc.resident.memory.some(item=>item.kind==='world-action'&&item.subjectId==='recovery'));
 delete f.sim.actors.recovery;f.npc.resident.needs.curiosity=100;Object.assign(f.npc.resident,{nextWorldActionAt:0,speaking:false});tick(103000);assert.equal(f.npc.aiTask.kind,'switch');assert.equal(light.switched,true,'autonomous upkeep does not repeatedly toggle an enabled light off');
});

test('the map lifecycle sustains both team assignments and individual rounds without starving ordinary life',()=>{
 const f=fixture();f.sim.actors={};
 for(let i=0;i<1440;i++){
  f.sim.time=100000+i*250;
  stepWorldResidents(f.sim,f.environment,f.sim.time,.25,{collision});
  stepAIWorldActions(f.sim,f.environment,f.sim.time,.25,{collision});
  for(const npc of Object.values(f.sim.actors).filter(actor=>actor.resident)){
   assert.ok(!(npc.resident.sharedTask&&npc.resident.objective?.status==='active'),'one activity owns each movement slot');
   assert.equal(npc.position.y,0);
  }
 }
 const stats=f.sim.residentLife.stats;
 assert.ok(stats.communityTasks>=2);assert.ok(stats.objectives>=2);assert.ok(stats.conversations>0);assert.ok(stats.practices>0);assert.ok(stats.work>0);
 assert.ok(f.sim.communityLife.history.length<=12);assert.ok(f.sim.residentLife.objectives.length<=12);
 const cast=Object.values(f.sim.actors).filter(actor=>actor.resident);
 assert.ok(new Set(cast.map(actor=>actor.resident.name)).size>=2);
 assert.ok(cast.some(actor=>actor.resident.completedCommunityTasks&&actor.resident.objectivesCompleted));
});
