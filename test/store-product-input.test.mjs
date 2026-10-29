import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const start=source.indexOf('  const onGameplayKeyDown='),end=source.indexOf('  // Capture this handoff',start);
function fixture(kind,{blocked=false,hosted=true}={}){
 const calls=[],context=vm.createContext({
  gameplayControlsReady:()=>true,gameplayOverlayOpen:()=>blocked,fishingUI:{visible:()=>false},keys:new Set(),isTypingTarget:()=>false,isGameCameraToggleKey:()=>false,
  renderer:{xr:{isPresenting:false}},heldGameInput:{press:()=>true},serverHostedRoom:hosted,authoritativeClient:null,
  resolveNearbyAction:()=>({kind}),activateNearbyAction:()=>calls.push('inspect'),safelyInteract:(_label,run)=>run(),builderGameplay:{interact:()=>{calls.push('builder');return true;}},playerRig:{position:{}},setStatus(){}
 });
 vm.runInContext(source.slice(start,end)+'\nglobalThis.press=onGameplayKeyDown;',context);
 return {calls,press:(extra={})=>context.press({key:'e',repeat:false,preventDefault(){},...extra})};
}

test('the E key inspects nearby merchandise in both solo and shared worlds',()=>{
 for(const hosted of [false,true]){const f=fixture('store-product',{hosted});f.press();assert.deepEqual(f.calls,['inspect']);}
});
test('store key handling retains resident and Builder actions and respects overlays and repeats',()=>{
 const resident=fixture('resident');resident.press();assert.deepEqual(resident.calls,['inspect']);
 const builder=fixture('item');builder.press();assert.deepEqual(builder.calls,['builder']);
 const blocked=fixture('store-product',{blocked:true});blocked.press();assert.deepEqual(blocked.calls,[]);
 const repeat=fixture('store-product');repeat.press({repeat:true});assert.deepEqual(repeat.calls,[]);
});

test('physical product selection retains exact sellers and Builder listings before native SKUs',()=>{
 const begin=source.indexOf('  function openStoreProduct('),finish=source.indexOf('  function updateStoreDisplays(',begin),calls=[];
 const context=vm.createContext({lockMenuInput(){},gameMarketplace:{open:(section,options)=>calls.push({section,...options})}});
 vm.runInContext(source.slice(begin,finish),context);
 context.openStoreProduct({id:'player:alice:chair',source:'player',sellerId:'alice',itemId:'chair',sku:'asset:chair'});
 context.openStoreProduct({id:'player:bob:chair',source:'player',sellerId:'bob',itemId:'chair',sku:'asset:chair'});
 context.openStoreProduct({id:'builder:listing-1',source:'builder',sku:'asset:chair'});
 context.openStoreProduct({source:'upgrade',sku:'asset:chair'});
 assert.deepEqual(JSON.parse(JSON.stringify(calls)),[
  {section:'browse',productId:'player:alice:chair'},{section:'browse',productId:'player:bob:chair'},
  {section:'builder',productId:'builder:listing-1'},{section:'upgrades',sku:'asset:chair'}
 ]);
});
