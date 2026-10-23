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
