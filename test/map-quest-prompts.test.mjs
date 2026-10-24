import test from 'node:test';
import assert from 'node:assert/strict';
import {questOfferRequirement,questObjectiveReading,questCompletionReading} from '../public/js/map-quest-prompts.js';

const player={id:'p',health:100,position:{x:0,y:0,z:0}};
test('map quest guidance accepts walking only after leaving seats, lifts and vehicles',()=>{
 const offer={mode:'foot',kind:'site-tour'};
 assert.equal(questOfferRequirement(offer,player),'');
 for(const state of [{vehicleId:'plane'},{seatedId:'bench'},{skiLift:{id:'lift'}}])assert.match(questOfferRequirement(offer,{...player,...state}),/Leave your vehicle or seat/);
 assert.match(questOfferRequirement(offer,{...player,health:0}),/respawn/);
 assert.match(questOfferRequirement(offer,null),/Join/);
 const completed={...player,vehicleMission:{status:'completed',finishedAt:10000}};
 assert.match(questOfferRequirement(offer,completed,{serverTime:20000}),/preparing your next/);
 assert.equal(questOfferRequirement(offer,completed,{serverTime:70000}),'');
 assert.equal(questOfferRequirement(offer,{...completed,localQuests:true},{serverTime:20000}),'');
});
test('specialist offers explain live game and correct craft requirements',()=>{
 assert.match(questOfferRequirement({mode:'foot',kind:'marksman'},player),/firing lane/);
 assert.equal(questOfferRequirement({mode:'foot',kind:'marksman'},player,{firingRange:{participants:{p:{role:'player'}}}}),'');
 assert.match(questOfferRequirement({mode:'foot',kind:'basketball'},{...player,basketballRole:'spectator'},{basketball:{}}),/live court/);
 assert.match(questOfferRequirement({mode:'foot',kind:'ski'},player),/ski race/);
 assert.equal(questOfferRequirement({mode:'foot',kind:'ski'},{...player,skiRace:{status:'racing'}}),'');
 const aboard={...player,vehicleId:'craft'},craft={id:'craft',modelId:'harbor-skiff',active:true,health:100,holderId:'p',position:{x:0,y:0,z:0}};
 assert.equal(questOfferRequirement({mode:'boat'},aboard,{actors:{craft}}),'');
 assert.match(questOfferRequirement({mode:'gunboat'},aboard,{actors:{craft}}),/Sentinel/);
 assert.match(questOfferRequirement({mode:'boat'},aboard,{actors:{craft:{...craft,trafficAI:true}}}),/Board/);
 assert.match(questOfferRequirement({mode:'boat'},aboard,{actors:{craft:{...craft,holderId:'other'}}}),/Board/);
 assert.match(questOfferRequirement({mode:'armed'},aboard,{actors:{craft:{...craft,modelId:'corsair-aircraft'}}}),/above 20/);
});
test('active guidance follows exact entity marker and distinguishes real interactions from confirmation',()=>{
 const mission={index:0,deadline:70000,checkpoints:[{name:'Speak to the local guide',entityId:'guide',objectName:'Park guide',action:'interact',x:3,y:0,z:4}],ready:true};
 const reading=questObjectiveReading(mission,player,{serverTime:10000,actors:{}});
 assert.equal(reading.distance,5);assert.equal(reading.time,'1:00');assert.equal(reading.progress,'1 / 1');assert.match(reading.instruction,/Use Park guide/);
 const confirm=questObjectiveReading({...mission,checkpoints:[{name:'Cafe check-in',x:0,z:0,action:'check-in'}]},player,{serverTime:10000});
 assert.equal(confirm.instruction,'Ready to check-in.');
 const workout=questObjectiveReading({...mission,message:'Complete a fresh coached set.',checkpoints:[{name:'Gym',milestone:true,x:0,z:0}]},player,{serverTime:10000});
 assert.equal(workout.instruction,'Complete a fresh coached set.');
 assert.equal(questObjectiveReading({index:3,checkpoints:[]},player,{}),null);
});
test('completed quest count and best time belong to the current world',()=>{
 const self={...player,mapQuestProgress:{worldId:'garden',completed:{tour:{count:2,bestMs:83400,lastCompletedAt:100000}}}};
 assert.equal(questCompletionReading(self,'garden','tour'),'Completed 2 times · Best 1:23');
 assert.equal(questCompletionReading(self,'harbor','tour'),'');
 assert.equal(questCompletionReading(self,'garden','missing'),'');
});
