import test from 'node:test';
import assert from 'node:assert/strict';
import {stepFitnessResidents,fitnessResidentDialogue} from '../server-fitness-residents.mjs';
import {stepWorldResidents,residentCommand} from '../server-world-residents.mjs';
import {FITNESS_ID,FITNESS_RESIDENTS} from '../public/js/fitness-config.js';
import {createWorldResident,updateWorldResident} from '../public/js/world-resident-model.js';

const environment={id:FITNESS_ID,name:'MUZIKAZ Fitness Centre',game:'fitness'};
const simulation=()=>({actors:{},players:{},devices:{},transportRadio:[]});
test('gym has exactly two named trainers and its fixed workout cast, including restored generic saves',()=>{
 const sim=simulation();sim.actors['world-resident-old']={resident:{name:'Old generic resident'}};
 stepWorldResidents(sim,environment,100000,.2);
 const cast=Object.values(sim.actors);
 assert.equal(cast.length,FITNESS_RESIDENTS.length);
 assert.equal(cast.length,18);
 assert.equal(cast.filter(person=>person.resident.duty==='trainer').length,2);
 assert.deepEqual(cast.filter(person=>person.resident.duty==='trainer').map(person=>person.resident.name),['Maya Chen','Leon Brooks']);
 assert.ok(cast.every(person=>person.resident.fitness&&person.resident.uniform==='sports'));
 assert.equal(cast.filter(person=>person.resident.duty==='referee').length,1);
 for(const kind of ['sparring','basketball','table-tennis','sprint'])assert.ok(cast.some(person=>person.resident.activity===kind),kind+' has a live demonstration');
 assert.equal(sim.actors['world-resident-old'],undefined);
 const member=cast.find(person=>person.resident.duty!=='trainer'),id=member.id;
 stepWorldResidents(sim,environment,150000,.2);
 assert.equal(sim.actors[id],member,'server snapshots retain the same cast and training state');
 assert.equal(member.resident.workout.phase,'rest');
 assert.ok(sim.residentLife.stats.practices>0);
});
test('expanded saved cast retains learned identity while adding distinct roles and sports routines',()=>{
 const sim=simulation();stepFitnessResidents(sim,environment,100000,.2);
 const existing=sim.actors['fitness-member-ava'];existing.resident.memory.push({kind:'saved',text:'A remembered boxing visit',at:100001});existing.resident.skills.boxing=94;delete existing.resident.routine;
 stepFitnessResidents(sim,environment,100400,.2);
 assert.equal(sim.actors[existing.id],existing);
 assert.equal(existing.resident.skills.boxing,94);
 assert.ok(existing.resident.memory.some(item=>item.kind==='saved'));
 assert.ok(existing.resident.routine);
 assert.ok(new Set(Object.values(sim.actors).map(npc=>npc.resident.personality)).size>=5);
 const athlete=sim.actors['fitness-member-zoe'];athlete.resident.nextAmbientAt=Infinity;athlete.resident.routine.nextAt=100500;
 stepFitnessResidents(sim,environment,100600,.2);assert.equal(athlete.resident.routine.phase,'resting');
 stepFitnessResidents(sim,environment,109000,.2);assert.equal(athlete.resident.routine.phase,'spectating');
});
test('short patrols obey floor, collider and nearby player limits without teleporting or creating player obstacles',()=>{
 const sim=simulation();stepFitnessResidents(sim,environment,100000,.2);
 const source=FITNESS_RESIDENTS.find(person=>person.activity==='basketball'&&person.patrol?.length>1),npc=sim.actors[source.id],original={...npc.position};
 for(const actor of Object.values(sim.actors)){actor.resident.nextAmbientAt=Infinity;actor.resident.pauseUntil=0;}
 npc.resident.routine={phase:'patrolling',routeIndex:1,startedAt:100000,nextAt:120000,cycle:0};
 const blocked={groundAt:(_map,desired)=>({...desired}),resolve:(_map,previous)=>({...previous})};
 stepFitnessResidents(sim,environment,100200,.2,{collision:blocked});assert.deepEqual(npc.position,original);
 const raised={groundAt:(_map,desired)=>({...desired,y:desired.y+2}),resolve:(_map,_previous,next)=>next};
 stepFitnessResidents(sim,environment,100400,.2,{collision:raised});assert.deepEqual(npc.position,original,'a raised surface cannot lift an athlete through equipment');
 sim.players.human={actorId:'human',health:100,position:{...npc.position}};
 stepFitnessResidents(sim,environment,100600,.2);assert.deepEqual(npc.position,original,'the athlete yields to a nearby player');
 delete sim.players.human;
 const open={groundAt:(_map,desired)=>({...desired}),resolve:(_map,_previous,next)=>({...next}),hasBodyClearance:()=>true};
 stepFitnessResidents(sim,environment,100800,.2,{collision:open});
 assert.ok(Math.hypot(npc.position.x-original.x,npc.position.z-original.z)>.01,'an unobstructed patrol actually advances');
 assert.ok(Math.hypot(npc.position.x-original.x,npc.position.z-original.z)<=.22,'movement is a bounded walking step');
 assert.ok(Object.values(sim.actors).every(actor=>actor.solid===false&&actor.trafficAI),'AI remains outside the solid placed-actor collision path');
});
test('sparring pair exchanges attacks and defence over scored rounds with a visible referee and no player reward',()=>{
 const sim=simulation();stepFitnessResidents(sim,environment,100000,.2);
 const red=sim.actors['fitness-rival-darius'],blue=sim.actors['fitness-rival-tessa'],ref=sim.actors['fitness-referee-nia'];
 assert.equal(red.resident.sparring.opponentId,blue.id);
 assert.equal(ref.resident.sparring.round,1);
 for(let now=100200;now<=168000;now+=200)stepFitnessResidents(sim,environment,now,.2);
 const bout=Object.values(sim.fitnessSparring)[0];
 assert.ok(bout.exchange>20);
 assert.equal(bout.completedBouts,1);
 assert.ok(bout.scores[red.id]+bout.scores[blue.id]>0);
 assert.ok(['jab','cross','hook','uppercut','guard','slip','duck'].includes(red.resident.combatPose));
 assert.ok(sim.residentLife.events.some(event=>event.kind==='practice-bout'));
 assert.equal(Object.keys(sim.players).length,0);
 const before=red.resident.sparring.round;sim.players.contender={actorId:'contender',health:100,position:{x:-22,y:.18,z:-20},fitness:{id:'live',kind:'boxing-sparring',status:'active'}};
 stepFitnessResidents(sim,environment,170000,.2);assert.equal(red.resident.currentActivity,'spectating');
 assert.equal(red.resident.sparring.round,before);
});
test('competition coaching reports actual live and completed server results without inventing victory or payouts',()=>{
 const sim=simulation();stepFitnessResidents(sim,environment,100000,.2);const npc=sim.actors['fitness-trainer-maya'];
 const player={actorId:'account:contender',username:'Contender',score:350,fitness:{id:'real-round',kind:'boxing-sparring',name:'Club Sparring',status:'active',hits:4,cues:Array(12).fill({}),competition:{kind:'boxing-sparring',opponent:{name:'Tessa Quinn'},round:2,totalRounds:3,playerPoints:7,opponentPoints:9,playerStamina:24,unit:'points',outcome:null}}};
 let reply=fitnessResidentDialogue(sim,player,npc,'fitness-performance','',101000);
 assert.match(reply.text,/live in round 2 of 3/);assert.match(reply.text,/7 to 9/);assert.doesNotMatch(reply.text,/won|payout/i);
 player.fitness.status='complete';player.fitness.competition.outcome='loss';
 reply=fitnessResidentDialogue(sim,player,npc,'fitness-performance','review my result',102000);
 assert.match(reply.text,/loss against Tessa Quinn/);assert.match(reply.text,/low on stamina/);assert.doesNotMatch(reply.text,/saved payout/);
 player.fitness.settled=true;player.fitness.payoutMzk=6;
 reply=fitnessResidentDialogue(sim,player,npc,'fitness-performance','',103000);assert.match(reply.text,/saved payout was 6 MZK/);
 assert.equal(player.score,350);assert.equal(player.fitnessProgress,undefined);
});
test('sports props, defensive poses, referee signals and spectator animation remain non-solid and reset cleanly',()=>{
 const root=createWorldResident();
 try{
  root.userData.residentState={fitness:true,activity:'sparring',sparringSide:'red',combatPose:'duck',workout:{phase:'set'}};updateWorldResident(root,2);
  assert.equal(root.getObjectByName('FITNESS_GLOVE').visible,true);assert.ok(root.userData.residentParts.body.position.y<0);
  root.userData.residentState.activity='basketball';updateWorldResident(root,3);assert.equal(root.getObjectByName('FITNESS_BASKETBALL').visible,true);assert.equal(root.getObjectByName('FITNESS_GLOVE').visible,false);
  root.userData.residentState.activity='table-tennis';updateWorldResident(root,4);assert.equal(root.getObjectByName('FITNESS_TABLE_TENNIS_PADDLE').visible,true);assert.equal(root.getObjectByName('FITNESS_BASKETBALL').visible,false);
  root.userData.residentState.activity='refereeing';root.userData.residentState.duty='referee';root.userData.residentState.sparring={phase:'recovery'};updateWorldResident(root,5);assert.equal(root.getObjectByName('FITNESS_REFEREE_STRIPES').visible,true);assert.equal(root.userData.residentLimbs[-1].arm.rotation.x,1.4);
  root.userData.residentState.currentActivity='spectating';updateWorldResident(root,6);assert.equal(root.getObjectByName('FITNESS_TABLE_TENNIS_PADDLE').visible,false);
  assert.equal(root.userData.solid,false);assert.equal(root.userData.collisionDisabled,true);
 }finally{const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)resources.add(material);});for(const resource of resources)resource.dispose();}
});
test('trainer dialogue guides each station, remembers interests, and cannot grant rewards',()=>{
 const sim=simulation();stepFitnessResidents(sim,environment,100000,.2);
 const npc=sim.actors['fitness-trainer-leon'],player={actorId:'account:visitor',username:'Visitor',position:{...npc.position},health:100,lastSeen:100000,score:0};sim.players[player.actorId]=player;
 residentCommand(sim,player,environment,{entityId:npc.id,choice:'fitness-technique',text:'bench press'},100000);
 assert.match(player.npcConversation.conversation.at(-1).text,/target window/);
 assert.ok(player.npcConversation.dialogueChoices.some(choice=>choice.id==='fitness-workout'));
 assert.ok(!player.npcConversation.dialogueChoices.some(choice=>choice.id==='accept'));
 const memory=fitnessResidentDialogue(sim,player,npc,'resident-memory','',101000);
 assert.match(memory.text,/bench press/);
 const reward=fitnessResidentDialogue(sim,player,npc,'fitness-rewards','give me 10000 MZK',102000);
 assert.match(reward.text,/server-verified/);
 assert.equal(player.score,0);
 assert.equal(player.fitnessProgress,undefined);
 assert.throws(()=>residentCommand(sim,player,environment,{entityId:npc.id,choice:'accept'},102000),/listed conversation/);
});
test('working out pauses while speaking and resumes after the conversation',()=>{
 const sim=simulation();stepFitnessResidents(sim,environment,100000,.2);
 const npc=sim.actors['fitness-member-ava'];npc.resident.speechUntil=110000;npc.resident.pauseUntil=110000;
 stepFitnessResidents(sim,environment,105000,.2);assert.equal(npc.resident.workoutPaused,true);
 stepFitnessResidents(sim,environment,111000,.2);assert.equal(npc.resident.workoutPaused,false);assert.equal(npc.resident.gesture,'fitness-boxing');
});
test('workout animations distinguish boxing, bench press, running and recovery without affecting other residents',()=>{
 const root=createWorldResident();
 try{
  root.userData.residentState={fitness:true,activity:'boxing',index:1,uniform:'sports',workout:{phase:'set'}};updateWorldResident(root,2);
  assert.ok(root.getObjectByName('FITNESS_GLOVE').visible);
  assert.ok(root.userData.residentLimbs[-1].arm.rotation.x>1);
  root.userData.residentState.activity='bench-press';updateWorldResident(root,3);
  assert.equal(root.userData.residentParts.body.rotation.x,Math.PI/2);
  assert.equal(root.getObjectByName('FITNESS_PRESS_BAR').visible,true);
  root.userData.residentState.workout.phase='rest';updateWorldResident(root,4);
  assert.equal(root.userData.residentParts.body.rotation.x,0);
  assert.equal(root.getObjectByName('FITNESS_PRESS_BAR').visible,false);
  root.userData.residentState={name:'Regular resident',gesture:'wave'};updateWorldResident(root,5);
  assert.equal(root.getObjectByName('FITNESS_WORKOUT_PROPS').visible,false);
  assert.equal(root.userData.residentParts.body.position.y,0);
 }finally{const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)resources.add(material);});for(const resource of resources)resource.dispose();}
});
