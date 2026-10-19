import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHockeyInputs} from '../public/js/hockey-input.js';
import {createHockey,joinHockey} from '../public/js/hockey-rules.js';

const source=readFileSync(new URL('../public/js/hockey-game.js',import.meta.url),'utf8');
const section=(start,end)=>{
 const from=source.indexOf(start),to=source.indexOf(end,from);
 assert.ok(from>=0&&to>from,'exercise the actual hockey runtime function');
 return source.slice(from,to);
};
function fixture({hidden=false,presenting=false}={}){
 let now=100;const state=createHockey(),player=joinHockey(state,'you');state.phase='playing';
 const inputs=createHockeyInputs({now:()=>now}),requests=[];let samples=0;
 const context=vm.createContext({
  busy:false,running:true,live:true,nextPollAt:0,spectating:false,connectionError:'',
  performance:{now:()=>now},document:{hidden},renderer:{xr:{isPresenting:presenting}},
  hockeyInputs:inputs,input:()=>{samples++;return {x:1,z:0,...inputs.sample(state,player)};},
  command:async(action,fields)=>{requests.push({action,fields});return {};},
  accept(){},resetHockeyInput:()=>inputs.reset(),$:()=>({textContent:''})
 });
 vm.runInContext(section('async function poll()','$(\'#start\').onclick='),context);
 return {context,state,player,inputs,requests,samples:()=>samples,advance:time=>now+=time};
}

test('actual live poll sends headset controls while the immersive page is hidden',async()=>{
 const f=fixture({hidden:true,presenting:true});f.inputs.tap('q');
 await f.context.poll();
 assert.equal(f.samples(),1);assert.equal(f.requests[0].fields.input.x,1);assert.equal(f.requests[0].fields.input.check,true);
 const background=fixture({hidden:true});await background.context.poll();
 assert.equal(background.samples(),0);assert.equal(Object.keys(background.requests[0].fields.input).length,0);
});

test('actual busy live polling preserves a tap until the next request samples it',async()=>{
 const f=fixture();let finish;
 f.context.command=async(action,fields)=>{
  f.requests.push({action,fields});
  if(f.requests.length===1)await new Promise(resolve=>finish=resolve);
  return {};
 };
 const first=f.context.poll();assert.equal(f.context.busy,true);
 f.advance(100);f.inputs.tap('f');f.advance(5000);
 await f.context.poll();assert.equal(f.requests.length,1,'a busy poll must not sample and consume input');
 finish();await first;assert.equal(f.context.busy,false);
 f.advance(51);await f.context.poll();
 assert.equal(f.requests[1].fields.input.poke,true);
 f.advance(51);await f.context.poll();assert.equal(f.requests[2].fields.input.poke,undefined,'one tap is sent once');
});

test('VR action menu closes before queuing a usable action and does not use a timed key pulse',()=>{
 const inputs=createHockeyInputs();let menuOpen=true,focused=0;
 const context=vm.createContext({
  hockeyInputs:inputs,hockeyCanPlay:()=>!menuOpen,
  xrControls:{closeMenu(){menuOpen=false;}},restoreHockeyFocus:()=>focused++
 });
 vm.runInContext(section('function hockeyVRKey(','async function startHockeyVR('),context);
 context.hockeyMenuKey('shoot',{lift:true});assert.equal(menuOpen,false);assert.equal(focused,1);
 const state=createHockey(),player=joinHockey(state,'you');state.phase='playing';state.puck.owner=player.id;
 const sent=inputs.sample(state,player);assert.equal(sent.shoot,true);assert.equal(sent.lift,true);
 assert.equal(inputs.keys.size,0,'a one-shot action does not leave a held key behind');
});

test('opening the headset menu immediately clears pending actions and held skating',()=>{
 const inputs=createHockeyInputs();let options,blocked=false;
 const context=vm.createContext({
  renderer:{xr:{isPresenting:true}},scene:{},camera:{},vrRig:{},accessBar:{},
  controllerMove:{x:0,y:0},spectating:false,running:true,
  hockeyBlocked:()=>blocked,
  resetHockeyInput(){inputs.reset();context.controllerMove={x:0,y:0};},
  mountXRGameControls:value=>{options=value;return {};}
 });
 vm.runInContext(section('const xrControls=mountXRGameControls(','// Native dialogs restore focus'),context);
 options.onMove({x:.5,y:-1},1/60);assert.equal(context.controllerMove.y,-1);
 inputs.press('w');inputs.tap('shoot');blocked=true;options.onMove({x:0,y:0},0);
 assert.deepEqual(inputs.snapshot(),{keys:[],pending:[]});assert.equal(context.controllerMove.x,0);assert.equal(context.controllerMove.y,0);
});
