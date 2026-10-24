import test from 'node:test';
import assert from 'node:assert/strict';
import {isGameTypingTarget,shouldResumeCompanionMovement} from '../public/js/game-keyboard-input.js';

function control(localName,{type='text',companion=true,hidden=false,disabled=false}={}){
 return {localName,type,disabled,closest(selector){
  if(selector==='[hidden],[inert]')return hidden?{}:null;
  if(selector==='[data-gameplay-blocking="false"]')return companion?{}:null;
  if(selector==='select,input')return ['select','input'].includes(localName)?this:null;
  return this;
 }};
}
const key=(target,value,fields={})=>({target,key:value,...fields});

test('quest and map selectors hand WASD back to gameplay while retaining native selection keys',()=>{
 const selector=control('select');
 for(const value of ['w','A','s','d'])assert.equal(shouldResumeCompanionMovement(key(selector,value)),true);
 for(const value of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' ','Escape','Tab'])assert.equal(shouldResumeCompanionMovement(key(selector,value)),false);
 for(const field of ['altKey','ctrlKey','metaKey','isComposing','defaultPrevented'])assert.equal(shouldResumeCompanionMovement(key(selector,'w',{[field]:true})),false);
 assert.equal(shouldResumeCompanionMovement(key(selector,'w',{shiftKey:true})),true,'Sprinting can begin from a companion selector.');
});

test('text editing remains local and unavailable controls never hand off movement',()=>{
 for(const localName of ['textarea','input']){
  const input=control(localName);assert.equal(isGameTypingTarget(input),true);assert.equal(shouldResumeCompanionMovement(key(input,'w')),false);
 }
 for(const options of [{companion:false},{hidden:true},{disabled:true}])assert.equal(shouldResumeCompanionMovement(key(control('select',options),'w')),false);
 assert.equal(shouldResumeCompanionMovement(key(null,'w')),false);
});

test('nontext controls hand off WASD while retaining their normal editing keys',()=>{
 for(const type of ['range','checkbox','radio','button']){
  const input=control('input',{type});assert.equal(isGameTypingTarget(input),true);assert.equal(shouldResumeCompanionMovement(key(input,'w')),true);
  for(const value of ['ArrowLeft','ArrowRight','Enter',' '])assert.equal(shouldResumeCompanionMovement(key(input,value)),false);
 }
 assert.equal(isGameTypingTarget(control('input',{type:'number'})),true,'Numeric fields still need their editing keys.');
});
