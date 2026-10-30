import test from 'node:test';
import assert from 'node:assert/strict';
import {emergencyGameFlow} from '../public/js/emergency-game-flow.js';
const state=(phase,patch={})=>({id:'response-1',phase,cycle:1,objectives:[{id:'shelter',completed:false},{id:'supplies',completed:false},{id:'recovery',completed:false}],...patch});
const step=(flow,id)=>flow.steps.find(item=>item.id===id);

test('first arrival and recurring quiet intervals explain their own actual timing',()=>{
 const first=emergencyGameFlow(state('idle',{id:null,cycle:0}));
 assert.match(first.description,/1–3 minutes/);assert.match(first.description,/18-second warning/);assert.equal(step(first,'standby').status,'current');
 const repeat=emergencyGameFlow(state('idle'));
 assert.match(repeat.description,/3–20-minute quiet break/);assert.doesNotMatch(repeat.description,/1–3 minutes/);
 const clear=emergencyGameFlow(state('all-clear'));
 assert.equal(clear.title,'Response complete');assert.match(clear.description,/3–20-minute quiet break/);assert.equal(step(clear,'all-clear').status,'complete');
 assert.equal(emergencyGameFlow(null).steps.length,6);
});

test('the displayed current step follows each phase without owning the event clock',()=>{
 for(const [phase,current]of [['warning','impacts'],['detonation','impacts'],['fallout','supplies'],['recovery','recovery'],['clearing','all-clear']]){
  const input=state(phase),before=structuredClone(input),flow=emergencyGameFlow(input);
  assert.equal(step(flow,current).status,'current');assert.deepEqual(input,before);
 }
 assert.match(emergencyGameFlow(state('clearing')).description,/eight seconds/);
 assert.equal(step(emergencyGameFlow(state('fallout')),'impacts').status,'complete');
});

test('late joining a later phase does not invent personal or shared quest completions',()=>{
 const input=state('recovery',{objectives:[{id:'shelter',completed:true},{id:'supplies',completed:false},{id:'recovery',completed:false}]});
 let flow=emergencyGameFlow(input);
 assert.equal(step(flow,'shelter').status,'optional');assert.equal(step(flow,'supplies').status,'pending');assert.equal(step(flow,'recovery').status,'current');
 flow=emergencyGameFlow(input,{shelterArrived:true});assert.equal(step(flow,'shelter').status,'complete');
 input.objectives[1].completed=true;flow=emergencyGameFlow(input);assert.equal(step(flow,'supplies').status,'complete');
 assert.equal(step(emergencyGameFlow(state('all-clear')),'recovery').status,'pending','phase alone is not a receipt for a quest');
});

test('optional aircraft onboarding never completes the ground response and rejects previous-event progress',()=>{
 const input=state('fallout'),evacuation={aircraft:[{id:'daybreak'}],progress:{eventId:input.id,status:'active',stage:'preflight'}};
 let flow=emergencyGameFlow(input,{evacuation});assert.equal(step(flow,'evacuation').status,'current');assert.match(step(flow,'evacuation').detail,/Cockpit confirmed/);
 evacuation.progress.stage='depart';assert.match(step(emergencyGameFlow(input,{evacuation}),'evacuation').detail,/safe airborne climb/);
 evacuation.progress.stage='complete';assert.equal(step(emergencyGameFlow(input,{evacuation}),'evacuation').status,'optional','stage text does not prove completion');
 evacuation.progress.status='complete';flow=emergencyGameFlow(input,{evacuation});assert.equal(step(flow,'evacuation').status,'complete');assert.equal(step(flow,'supplies').status,'current');assert.equal(step(flow,'recovery').status,'pending');
 evacuation.progress.eventId='old-response';assert.equal(step(emergencyGameFlow(input,{evacuation}),'evacuation').status,'optional');
 assert.equal(step(emergencyGameFlow(input,{evacuation:{aircraft:[]}}),'evacuation'),undefined);
 assert.equal(step(emergencyGameFlow(input),'evacuation'),undefined);
});
