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

test('a delayed camera dialog close event preserves fresh skating and action taps',()=>{
 const inputs=createHockeyInputs();let options;
 const context=vm.createContext({
  hockeyCameraMenu:null,hockeyViewport:{},$:()=>({}),
  mountGameCameraMenu:value=>{options=value;return {};},
  resetHockeyInput:()=>inputs.reset(),restoreHockeyFocus(){}
 });
 vm.runInContext(section('hockeyCameraMenu=mountGameCameraMenu(','const extraCameraViews='),context);
 inputs.press('w');inputs.tap('shoot');options.onOpenChange(true);
 assert.deepEqual(inputs.snapshot(),{keys:[],pending:[]});
 // The dialog open attribute clears before the native close event is delivered.
 inputs.press('s');inputs.tap('f');options.onOpenChange(false);
 assert.deepEqual(inputs.snapshot(),{keys:['s'],pending:['f']});
});

function roleChangeFixture(action){
 const waits=[],cleared=[],started=[],requests=[],accepted=[],nodes=new Map();let finishRequest,failRequest,resets=0,cameras=0;
 const response=new Promise((resolve,reject)=>{finishRequest=resolve;failRequest=reject;});
 for(const [id,value]of [['player-slot','0-2'],['difficulty','pro'],['format','tournament'],['period-seconds','90']])nodes.set('#'+id,{value});
 nodes.set('#hockey-ai-fill',{checked:false});
 const context=vm.createContext({
  running:true,spectating:action==='join',live:true,busy:true,timer:11,roleChangePending:false,
  preferredCameraMode:'first-person',connectionError:'',poll(){},
  resetHockeyInput:()=>resets++,setCamera:()=>cameras++,hockeyViewForGameCamera:()=> 'ice',
  clearInterval:id=>cleared.push(id),
  setInterval:(callback,delay)=>{started.push({callback,delay});return 22;},
  setTimeout:(resume,delay)=>{waits.push({resume,delay});},
  command:(name,fields)=>{assert.equal(context.busy,true);requests.push({name,fields});return response;},
  accept:snapshot=>{accepted.push(snapshot);context.spectating=snapshot.role==='spectator';},
  $:selector=>{if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector);}
 });
 vm.runInContext(section('async function changeHockeyRole(',"$('#join-slot').onclick="),context);
 return {context,waits,cleared,started,requests,accepted,nodes,finishRequest,failRequest,resets:()=>resets,cameras:()=>cameras,async resumeWait(){
  const wait=waits.shift();assert.ok(wait,'wait for the existing poll request');assert.equal(wait.delay,25);
  wait.resume();await Promise.resolve();await Promise.resolve();
 }};
}

for(const action of ['join','spectate'])test(`live ${action} retains one click during a busy poll and resumes polling after the role settles`,async()=>{
 const f=roleChangeFixture(action),changing=f.context.changeHockeyRole(action);
 assert.deepEqual(f.cleared,[11]);assert.equal(f.requests.length,0);assert.equal(f.started.length,0);assert.equal(f.resets(),1);
 await f.context.changeHockeyRole(action);
 assert.equal(f.waits.length,1,'rapid repeated clicks share one pending transition');assert.deepEqual(f.cleared,[11]);
 f.context.busy=false;await f.resumeWait();
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].name,action);assert.equal(f.context.busy,true,'the role request owns the request slot');
 assert.equal(f.started.length,0,'polling stays paused until the role request finishes');
 if(action==='join')assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].fields)),{slot:'0-2',settings:{difficulty:'pro',mode:'tournament',periodSeconds:90,aiFill:false}});
 const snapshot={role:action==='spectate'?'spectator':'player'};f.finishRequest(snapshot);await changing;
 assert.deepEqual(f.accepted,[snapshot]);assert.equal(f.context.spectating,action==='spectate');assert.equal(f.cameras(),1);
 assert.equal(f.nodes.get('#camera-view').value,action==='spectate'?'broadcast':'ice');
 assert.equal(f.context.busy,false);assert.equal(f.context.roleChangePending,false);assert.equal(f.started.length,1);
 assert.equal(f.started[0].callback,f.context.poll);assert.equal(f.started[0].delay,50);assert.equal(f.context.timer,22);
});

test('a waiting role change cannot join or restart polling after leaving or changing matches',async()=>{
 for(const action of ['join','spectate'])for(const cancel of [context=>{context.running=false;},context=>{context.timer=99;},context=>{context.live=false;}]){
  const f=roleChangeFixture(action),changing=f.context.changeHockeyRole(action);
  cancel(f.context);f.context.busy=false;await f.resumeWait();await changing;
  assert.equal(f.requests.length,0);assert.equal(f.accepted.length,0);assert.equal(f.started.length,0);assert.equal(f.context.roleChangePending,false);
 }
});

test('an old role response cannot update a departed or superseded match',async()=>{
 for(const action of ['join','spectate'])for(const cancel of [context=>{context.running=false;},context=>{context.timer=99;},context=>{context.live=false;}]){
  const f=roleChangeFixture(action),changing=f.context.changeHockeyRole(action);
  f.context.busy=false;await f.resumeWait();assert.equal(f.requests.length,1);
  cancel(f.context);f.finishRequest({role:action==='spectate'?'spectator':'player'});await changing;
  assert.equal(f.accepted.length,0);assert.equal(f.cameras(),0);assert.equal(f.started.length,0);
  assert.equal(f.context.busy,false);assert.equal(f.context.roleChangePending,false);
 }
});

test('a failed live role change clears its pending state and restores current-match polling',async()=>{
 const f=roleChangeFixture('join'),changing=f.context.changeHockeyRole('join');
 f.context.busy=false;await f.resumeWait();f.failRequest(Error('Arena is full'));await changing;
 assert.equal(f.accepted.length,0);assert.equal(f.context.spectating,true);
 assert.equal(f.context.connectionError,'Arena is full');assert.equal(f.nodes.get('#call').textContent,'Arena is full');
 assert.equal(f.context.busy,false);assert.equal(f.context.roleChangePending,false);assert.equal(f.started.length,1);
});

test('a failed old role request cannot overwrite a newer match status',async()=>{
 for(const cancel of [context=>{context.running=false;},context=>{context.timer=99;},context=>{context.live=false;}]){
  const f=roleChangeFixture('join'),changing=f.context.changeHockeyRole('join');
  f.context.busy=false;await f.resumeWait();cancel(f.context);f.context.connectionError='Current match status';
  f.failRequest(Error('Old request failed'));await changing;
  assert.equal(f.context.connectionError,'Current match status');assert.equal(f.nodes.has('#call'),false);
  assert.equal(f.context.roleChangePending,false);assert.equal(f.started.length,0);
 }
});
