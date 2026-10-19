import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {useFiringRangeInteraction} from '../public/js/firing-range-client.js';
import {firingRangeLocationAt} from '../public/js/firing-range.js';
import {FIRING_RANGE_WEAPONS} from '../public/js/firing-range.js';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
function section(start,end){const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(from>=0&&to>from);return source.slice(from,to);}

test('world startup resets the actual server motion owner without a removed walking predictor',()=>{
 const loading=section('  async function loadById(', '  let cachedAvatars');
 const from=loading.indexOf('serverPlayerInitialized=false;'),to=loading.indexOf('stickSprinting=false;',from);
 assert.ok(from>=0&&to>from);
 let resets=0;
 const reset=new Function('serverMotion',`let serverPlayerInitialized=true,serverMovementRevision=9;${loading.slice(from,to)};return {serverPlayerInitialized,serverMovementRevision};`);
 assert.deepEqual(reset({reset(){resets++;}}),{serverPlayerInitialized:false,serverMovementRevision:null});assert.equal(resets,1);
});

test('each physical range console opens its matching function and transformed area',async()=>{
 const calls=[],handlers={open:(...args)=>calls.push(['open',...args]),market:options=>calls.push(['market',options]),backpack:()=>calls.push(['backpack']),watch:options=>calls.push(['watch',options])};
 for(const intent of ['range-start','range-settings','range-armory','range-market','range-backpack','range-watch'])assert.equal(await useFiringRangeInteraction({intent,locationId:'east-range'},handlers),true);
 assert.deepEqual(calls,[['open','play','east-range'],['open','tournament','east-range'],['open','armory','east-range'],['market',{category:'weapons',intent:'browse'}],['backpack'],['watch',{locationId:'east-range'}],['open','results','east-range']]);
 assert.equal(await useFiringRangeInteraction({intent:'unknown'},handlers),false);assert.equal(await useFiringRangeInteraction(null,handlers),false);
 await assert.rejects(useFiringRangeInteraction({intent:'range-watch'},{...handlers,watch:()=>Promise.reject(Error('Lane unavailable'))}),/Lane unavailable/);
});

test('the actual explorer interaction handler routes the nearby market and reports rejected watches',async()=>{
 let interaction={intent:'range-market',locationId:'main'};const calls=[];
 const run=new Function('context','useFiringRangeInteraction',`
  const liveRangeSnapshot={},playerRig={position:{}},rangeScenes={nearest:()=>context.interaction()};
  const openLiveRangePanel=(...args)=>context.calls.push(['open',...args]),openRangeMarket=options=>context.calls.push(['market',options]),openRangeBackpack=()=>context.calls.push(['backpack']);
  const liveRangeAction=()=>Promise.reject(Error('Watch denied')),setStatus=message=>context.calls.push(['status',message]);
  ${section('  function useNearbyRangeInteraction(){','  window.addEventListener(\'keydown\',event=>{if(!liveRangeSnapshot')}
  return useNearbyRangeInteraction;
 `)({interaction:()=>interaction,calls},useFiringRangeInteraction);
 assert.equal(run(),true);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls[0][0],'market');
 interaction={intent:'range-watch',locationId:'main'};assert.equal(run(),true);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls.at(-1),['status','Watch denied']);
 interaction=null;assert.equal(run(),false);
});

test('an old range command cannot change equipment or camera after switching worlds',async()=>{
 let finish;const calls=[];
 const fixture=new Function('context','FIRING_RANGE_WEAPONS',`
  let worldLoadGeneration=1,authoritativeClient={};
  const serverCommand=()=>new Promise(resolve=>context.pending(resolve)),faceRangeLane=()=>context.calls.push('face'),liveRangeSelfId='you',liveRangeHud={close:()=>context.calls.push('close')},toxicBubbleSystem={tool:'laser',setTool:()=>context.calls.push('equip')};
  ${section('  function liveRangeAction(action,fields={}){','  async function prepareRangePanel()')}
  return {action:liveRangeAction,leave(){worldLoadGeneration++;authoritativeClient={};}};
 `)({pending:resolve=>finish=resolve,calls},FIRING_RANGE_WEAPONS);
 const action=fixture.action('range-start');fixture.leave();
 finish({firingRange:{state:'live',settings:{mode:'precision',weapon:'marksman'}}});
 assert.equal(await action,false);assert.deepEqual(calls,[]);
});

test('range weapon authorization stays temporary, local to the area, and respects tournament rules',()=>{
 const range={participants:{you:{role:'player'}},settings:{mode:'freeplay',weapon:'marksman'},state:'live',locations:[{id:'main',transform:{position:{x:50,y:0,z:0}}}]};
 const context={range,activeEnvironment:{id:'firing-range'},serverHostedRoom:true,position:{x:0,y:0,z:0}};
 const borrowed=new Function('context','FIRING_RANGE_WEAPONS','isFiringRangeEnvironment','firingRangeLocationAt',`
  const liveRangeSnapshot=context.range,liveRangeSelfId='you',serverHostedRoom=context.serverHostedRoom,activeEnvironment=context.activeEnvironment,playerRig={position:context.position};
  ${section('  function borrowedRangeWeapon(tool){','  function sharedRangeAim(')}
  return borrowedRangeWeapon;
 `)(context,FIRING_RANGE_WEAPONS,environment=>environment.id==='firing-range',firingRangeLocationAt);
 for(const weapon of FIRING_RANGE_WEAPONS)assert.equal(borrowed(weapon),true);
 assert.equal(borrowed('flamethrower'),false);
 range.settings.mode='precision';assert.equal(borrowed('marksman'),true);assert.equal(borrowed('rail-cannon'),false);
 range.state='finished';assert.equal(borrowed('rail-cannon'),true);
 range.participants.you.role='spectator';assert.equal(borrowed('marksman'),false);
 range.participants.you.role='player';context.activeEnvironment.id='park';assert.equal(borrowed('marksman'),false);
 context.position.x=50;assert.equal(borrowed('marksman'),true);
});

test('the actual headset grip cycles legal range loans and keeps a live tournament weapon locked',()=>{
 const context={range:{},allowed:[...FIRING_RANGE_WEAPONS],tool:'laser',chosen:[]};
 const cycle=new Function('context','FIRING_RANGE_WEAPONS',`
  const liveRangeSnapshot=context.range,borrowedRangeWeapon=tool=>context.allowed.includes(tool),XR_TOOL_ORDER=['spray','bat','taser'],RANGED_WEAPONS={};
  const toxicBubbleSystem={get tool(){return context.tool;},setTool(tool){context.tool=tool;context.chosen.push(tool);}},pulseXRController=()=>{},setStatus=()=>{};
  ${section('  function cycleXRTool(controller)', '  function zoomPercent()')}
  return cycleXRTool;
 `)(context,FIRING_RANGE_WEAPONS);
 for(let index=0;index<FIRING_RANGE_WEAPONS.length;index++)assert.equal(cycle({}),true);
 assert.equal(new Set(context.chosen).size,9);assert.ok(context.chosen.every(tool=>FIRING_RANGE_WEAPONS.includes(tool)));
 context.allowed=['marksman'];assert.equal(cycle({}),true);assert.equal(context.tool,'marksman');
 context.allowed=[];assert.equal(cycle({}),false);assert.equal(context.tool,'marksman');
});
