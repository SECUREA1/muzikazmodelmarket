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
 assert.equal(cast.filter(person=>person.resident.duty==='trainer').length,2);
 assert.deepEqual(cast.filter(person=>person.resident.duty==='trainer').map(person=>person.resident.name),['Maya Chen','Leon Brooks']);
 assert.ok(cast.every(person=>person.resident.fitness&&person.resident.uniform==='sports'));
 assert.equal(sim.actors['world-resident-old'],undefined);
 const member=cast.find(person=>person.resident.duty!=='trainer'),id=member.id;
 stepWorldResidents(sim,environment,150000,.2);
 assert.equal(sim.actors[id],member,'server snapshots retain the same cast and training state');
 assert.equal(member.resident.workout.phase,'rest');
 assert.ok(sim.residentLife.stats.practices>0);
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
