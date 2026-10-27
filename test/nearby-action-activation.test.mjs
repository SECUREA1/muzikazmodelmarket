import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const start=source.indexOf('  function activateNearbyAction(event)');
const activate=source.slice(start,source.indexOf("  window.addEventListener('keydown'",start));

function fixture(){
 const opened=[],sent=[],timers=[];let ready=true,overlay=false,resolved=0;
 const context=vm.createContext({
  nearbyAction:{kind:'prison',stationId:'intake'},nearbyActionLocked:false,
  gameplayControlsReady:()=>ready,gameplayOverlayOpen:()=>overlay,
  resolveNearbyAction:()=>{resolved++;return context.target;},
  renderNearbyAction:next=>context.nearbyAction=next,
  prisonUI:{open:id=>opened.push(id)},factoryUI:{open:id=>opened.push(id)},
  serverHostedRoom:true,serverCommand:(...args)=>sent.push(args),
  refreshNearbyAction(){},performance:{now:()=>0},window:{setTimeout:fn=>timers.push(fn)},
 });
 vm.runInContext(activate,context);context.target={kind:'prison',stationId:'intake'};
 return {context,opened,sent,timers,get resolved(){return resolved;},
  press(){context.activateNearbyAction({preventDefault(){},stopPropagation(){}});},
  setReady(value){ready=value;},setOverlay(value){overlay=value;}};
}

test('nearby Use cannot act before joining or through an open menu',()=>{
 const f=fixture();f.setReady(false);f.press();assert.equal(f.resolved,0);assert.deepEqual(f.opened,[]);
 f.setReady(true);f.setOverlay(true);f.press();assert.equal(f.resolved,0);assert.deepEqual(f.opened,[]);
 f.setOverlay(false);f.press();assert.deepEqual(f.opened,['intake']);
});

test('walking away invalidates a stale prison Use hint before it can open anything',()=>{
 const f=fixture();f.context.target={kind:'none'};f.press();
 assert.equal(f.resolved,1);assert.deepEqual(f.opened,[]);assert.deepEqual(f.sent,[]);
 assert.equal(f.context.nearbyActionLocked,false,'a stale target cannot lock later controls');
 f.context.target={kind:'prison',stationId:'meal'};f.press();assert.deepEqual(f.opened,['meal']);
});

test('Use resolves the current station and rejects duplicate activations until released',()=>{
 const f=fixture();f.context.target={kind:'prison',stationId:'radio'};f.press();f.press();
 assert.deepEqual(f.opened,['radio']);assert.equal(f.resolved,1);
 f.timers.shift()();f.press();assert.deepEqual(f.opened,['radio','radio']);
});

test('a shared item uses its current entity instead of the cached object',()=>{
 const f=fixture();f.context.nearbyAction={kind:'item',entityId:'old'};
 f.context.target={kind:'item',entityId:'current'};f.press();
 assert.equal(f.sent.length,1);assert.equal(f.sent[0][0],'interact');assert.equal(f.sent[0][1].entityId,'current');
 assert.deepEqual(f.opened,[]);
});

test('prison E opens only a current activity and gives useful guidance when none is near',()=>{
 const listener=source.split('\n').find(line=>line.includes("window.addEventListener('keydown'")&&line.includes('const destination=prisonUI.getDestination()'));
 const statuses=[],opened=[];let handler,station=null,destination=null;
 const context=vm.createContext({window:{addEventListener:(_type,fn)=>handler=fn},
  gameplayControlsReady:()=>true,isTypingTarget:()=>false,gameplayOverlayOpen:()=>false,
  isPrisonEnvironment:()=>true,activeEnvironment:{id:'ironwood-prison'},
  prisonUI:{near:()=>station,getDestination:()=>destination},setStatus:message=>statuses.push(message),
  activateNearbyAction:()=>opened.push(station.id)});
 vm.runInContext(listener,context);
 const press=(repeat=false)=>handler({key:'e',repeat,preventDefault(){},stopImmediatePropagation(){}});
 press();assert.match(statuses.at(-1),/Open Prison to choose/);assert.deepEqual(opened,[]);
 destination={id:'meal',name:'Cafeteria meal service'};press();assert.match(statuses.at(-1),/Walk closer to Cafeteria/);
 station={id:'intake'};press();press(true);assert.deepEqual(opened,['intake']);
});
