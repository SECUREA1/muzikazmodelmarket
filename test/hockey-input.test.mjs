import test from 'node:test';
import assert from 'node:assert/strict';
import {createHockeyInputs,bindHockeyKeyboard,hockeyEditingTarget} from '../public/js/hockey-input.js';
import {createHockey,joinHockey,hockeyInput,stepHockey} from '../public/js/hockey-rules.js';

function match(){
 const state=createHockey({aiFill:false,offside:false,icing:false});
 const player=joinHockey(state,'you');state.phase='playing';
 for(const p of state.players)Object.assign(p,{x:p.team?18:-18,z:9,vx:0,vz:0,cooldown:0});
 Object.assign(player,{x:0,z:0});Object.assign(state.puck,{x:.65,z:0,owner:player.id});
 return {state,player};
}
function keyboard(){
 const target=new EventTarget(),document=new EventTarget(),inputs=createHockeyInputs();
 Object.assign(document,{hidden:false,activeElement:{tagName:'BUTTON'}});
 const canvas={tagName:'CANVAS',focus(){document.activeElement=canvas;}};
 let enabled=true,blocked=false,views=0,centers=0,neutral=0;const actions=[];
 const binding=bindHockeyKeyboard({target,document,canvas,inputs,enabled:()=>enabled,blocked:()=>blocked,onView:()=>views++,onCenter:()=>centers++,onTeamAction:action=>actions.push(action),onNeutral:()=>neutral++});
 const send=(type,key,fields={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,{key,...fields});target.dispatchEvent(event);return event;};
 return {target,document,canvas,inputs,binding,send,actions,setEnabled:value=>enabled=value,setBlocked:value=>blocked=value,views:()=>views,centers:()=>centers,neutral:()=>neutral};
}

test('keyboard skating and actions resume directly from focused game buttons',()=>{
 const f=keyboard();
 assert.equal(f.send('keydown','w').defaultPrevented,true);
 assert.equal(f.document.activeElement,f.canvas);assert.equal(f.inputs.keys.has('w'),true);
 f.document.activeElement={tagName:'BUTTON'};
 f.send('keydown','e');f.send('keyup','e');
 const {state,player}=match(),input=f.inputs.sample(state,player);
 assert.equal(input.pass,true);hockeyInput(state,'you',input);stepHockey(state,1/60);
 assert.equal(player.animation,'pass');assert.equal(state.puck.owner,null);
 f.send('keyup','w');assert.equal(f.inputs.keys.has('w'),false);f.binding.dispose();
});

test('editable fields and dialogs cannot enqueue gameplay or camera shortcuts',()=>{
 const f=keyboard();
 for(const field of [{tagName:'INPUT'},{tagName:'SELECT'},{tagName:'TEXTAREA'},{tagName:'DIV',isContentEditable:true},{tagName:'SPAN',closest:()=>({role:'textbox'})}]){
  f.document.activeElement=field;
  for(const key of ['w',' ','e','v','c','x'])assert.equal(f.send('keydown',key).defaultPrevented,false);
  assert.deepEqual(f.inputs.snapshot(),{keys:[],pending:[]});
 }
 f.document.activeElement=f.canvas;f.setBlocked(true);
 for(const key of ['w',' ','e','v','c','x'])f.send('keydown',key);
 assert.deepEqual(f.inputs.snapshot(),{keys:[],pending:[]});assert.equal(f.views(),0);assert.equal(f.centers(),0);assert.deepEqual(f.actions,[]);
 f.setBlocked(false);f.setEnabled(false);f.send('keydown','w');assert.equal(f.inputs.keys.size,0);f.binding.dispose();
});

test('keyup, blur and hidden pages clear held controls regardless of current focus',()=>{
 const f=keyboard();f.send('keydown','w');f.send('keydown','e');
 f.document.activeElement={tagName:'INPUT'};f.setBlocked(true);f.send('keyup','w');assert.equal(f.inputs.keys.has('w'),false);
 f.target.dispatchEvent(new Event('blur'));assert.deepEqual(f.inputs.snapshot(),{keys:[],pending:[]});
 f.setBlocked(false);f.document.activeElement=f.canvas;f.send('keydown','w');
 f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));
 assert.deepEqual(f.inputs.snapshot(),{keys:[],pending:[]});assert.equal(f.neutral(),2);f.binding.dispose();
});

test('camera and team shortcuts fire once without stealing modified browser shortcuts',()=>{
 const f=keyboard();f.send('keydown','v');f.send('keydown','v',{repeat:true});f.send('keydown','c');f.send('keydown','x');f.send('keydown','x',{repeat:true});
 f.send('keydown','w',{ctrlKey:true});f.send('keydown','w',{metaKey:true});f.send('keydown','w',{altKey:true});
 assert.equal(f.views(),1);assert.equal(f.centers(),1);assert.deepEqual(f.actions,['switch']);assert.equal(f.inputs.keys.has('w'),false);f.binding.dispose();
});

test('a quick shot press survives release and short pickup recovery until an eligible simulation sample',()=>{
 let now=0;const inputs=createHockeyInputs({now:()=>now}),{state,player}=match();
 player.cooldown=.15;inputs.press('shoot');inputs.release('shoot');
 assert.deepEqual(inputs.sample(state,player),{});
 for(let step=0;step<12;step++){now+=1000/60;hockeyInput(state,'you',inputs.sample(state,player));stepHockey(state,1/60);}
 assert.equal(state.stats.shots[player.team],1);assert.equal(state.puck.owner,null);assert.deepEqual(inputs.sample(state,player),{});
});

test('a live action tap is retained while a slow input request is in flight and delivered once',()=>{
 let now=0;const inputs=createHockeyInputs({now:()=>now}),{state,player}=match();
 const victim=state.players.find(p=>p.team!==player.team&&!p.goalie);Object.assign(victim,{x:1.2,z:0});Object.assign(state.puck,{x:1.2,z:0,owner:victim.id});
 inputs.sending(true);now=100;inputs.tap('f');now=5100;inputs.sending(false);
 const sent=inputs.sample(state,player);assert.equal(sent.poke,true);
 hockeyInput(state,'you',sent);stepHockey(state,1/60);
 assert.equal(state.stats.hits[player.team],1);assert.notEqual(state.puck.owner,victim.id);
 player.cooldown=0;assert.deepEqual(inputs.sample(state,player),{});
});

test('queued actions expire during inactive play and resets discard taps at transitions',()=>{
 let now=0;const inputs=createHockeyInputs({now:()=>now}),{state,player}=match();
 inputs.tap('shoot');now=1300;assert.deepEqual(inputs.sample(state,player),{});assert.equal(state.stats.shots[player.team],0);
 for(const key of [' ','shoot','e','q','f'])inputs.tap(key);
 inputs.press('w');inputs.reset();assert.deepEqual(inputs.snapshot(),{keys:[],pending:[]});assert.deepEqual(inputs.sample(state,player),{});
});

test('Auto collection consumes the gesture so acquiring the puck cannot immediately shoot or pass',()=>{
 const inputs=createHockeyInputs(),{state,player}=match();state.puck.owner=null;
 inputs.press(' ');assert.equal(inputs.sample(state,player).shoot,undefined);
 state.puck.owner=player.id;assert.deepEqual(inputs.sample(state,player),{});
 inputs.release(' ');inputs.press(' ');const action=inputs.sample(state,player,{mode:'shoot'});
 assert.equal(action.shoot,true);assert.equal(action.pass,undefined);
});

test('holding the physical trigger waits through a stoppage and still consumes only one gesture',()=>{
 let now=0;const inputs=createHockeyInputs({now:()=>now}),{state,player}=match();
 state.phase='faceoff';inputs.press(' ');assert.deepEqual(inputs.sample(state,player),{});
 now=5000;state.phase='playing';
 assert.equal(inputs.sample(state,player,{mode:'shoot'}).shoot,true);
 assert.deepEqual(inputs.sample(state,player,{mode:'shoot'}),{});
 inputs.release(' ');inputs.press(' ');assert.equal(inputs.sample(state,player,{mode:'shoot'}).shoot,true);
});

test('forced trigger choices, explicit overrides and loft taps retain their action',()=>{
 const inputs=createHockeyInputs(),{state,player}=match();
 inputs.tap(' ');assert.equal(inputs.sample(state,player,{mode:'pass'}).pass,true);
 inputs.tap('e');assert.equal(inputs.sample(state,player,{mode:'shoot'}).pass,true);
 inputs.tap('shoot',{lift:true});const loft=inputs.sample(state,player);assert.equal(loft.shoot,true);assert.equal(loft.lift,true);
 state.phase='faceoff';inputs.tap('shoot');assert.deepEqual(inputs.sample(state,player),{});
 player.onIce=false;state.phase='playing';assert.deepEqual(inputs.sample(state,player),{});
 assert.equal(hockeyEditingTarget(null),false);assert.equal(hockeyEditingTarget({tagName:'BUTTON'}),false);
});
