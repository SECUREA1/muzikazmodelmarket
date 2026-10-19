import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openFiringRangeSession} from '../public/js/firing-range-client.js';
import {isFiringRangeEnvironment} from '../public/js/firing-range.js';

// Exercise the real mode dispatch without creating a browser/WebGL scene.
async function beginSource(){
 const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 const start=source.indexOf('toxicBubbleSystem.begin=async()=>{');
 const end=source.indexOf("\n  for(const name of ['handlePointerInteraction'",start);
 assert.ok(start>0&&end>start);
 return source.slice(start,end);
}

test('opening the range confirms its lobby without waiting for unrelated combat artwork',async()=>{
 const calls=[],range={state:'ready',dedicated:true};
 const context={environment:{id:'firing-range'},snapshot:range,client:{ready:true,async send(action){calls.push(action);return {firingRange:range};}},
  system:{initAudio(){calls.push('audio');},ensureResources(){throw Error('Combat artwork must not block range entry.');}},hud:{open(){calls.push('lobby');}},status:message=>calls.push(message)};
 const begin=new Function('context','openFiringRangeSession','isFiringRangeEnvironment',`
  const worldLoadGeneration=1,authoritativeClient=context.client,activeEnvironment=context.environment,liveRangeSnapshot=context.snapshot;
  const toxicBubbleSystem=context.system,liveRangeHud=context.hud,setStatus=context.status,RAD_TOX_STATES={ACTIVE:'active'};
  ${await beginSource()}
  return toxicBubbleSystem.begin;
 `)(context,openFiringRangeSession,isFiringRangeEnvironment);
 assert.equal(await begin(),true);
 assert.deepEqual(calls.slice(0,3),['range-ready','audio','lobby']);
 assert.equal(context.system.state,'active');assert.equal(context.system.active,false);
});

test('a pending combat start cannot send its command to a newly selected range',async()=>{
 const commands=[];
 const begin=new Function('commands','openFiringRangeSession','isFiringRangeEnvironment',`
  let worldLoadGeneration=1,authoritativeClient={ready:true,send:async action=>commands.push(action)};
  const activeEnvironment={id:'ordinary-world',builderScene:{layout:'grand-floor'}},liveRangeSnapshot=null;
  const serverHostedRoom=true,radToxEnabled=true,isBasketballEnvironment=()=>false;
  const toxicBubbleSystem={initAudio(){},async ensureResources(){worldLoadGeneration++;authoritativeClient={ready:true,send:async action=>commands.push('range:'+action)};}};
  ${await beginSource()}
  return toxicBubbleSystem.begin;
 `)(commands,openFiringRangeSession,isFiringRangeEnvironment);
 assert.equal(await begin(),false);
 assert.deepEqual(commands,[]);
});
