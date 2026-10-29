import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createWorldDeedDeliveryScene} from '../public/js/world-deed-delivery-scene.js';

function acceptedSnapshot(shell,{metadata=false}={}){
 const scene=new THREE.Scene(),requests=[],environment={id:'native-'+shell,...(metadata?{memberPlot:true}:{})};
 const manager=createWorldDeedDeliveryScene({scene,autoPoll:false,createCanvas:()=>null,inventory:{api:async path=>{
  requests.push(path);return {mapId:environment.id,serverTime:1000,dropoffs:[{id:'store-door',position:{x:3,y:0,z:4}}],routes:[],vehicles:[]};
 }}});
 const source=readFileSync(new URL('../public/js/'+shell+'-game.js',import.meta.url),'utf8');
 const start=source.indexOf(shell==='hockey'?'function accept(snapshot':'function acceptRoom(value');
 const end=source.indexOf(shell==='hockey'?'async function inputFailure(':'async function joinSharedGame(',start);
 const context=vm.createContext({
  sequence:-1,connectionError:'',state:null,selfId:null,hockeyInputEpoch:null,spectating:false,localSkater:null,
  localSkating:{reset(){},accept(){},sample(){return null;}},environment,deedDeliveryScene:manager,performance,
  game:0,roomRequestRevision:1,roomLastSequence:-1,gameStarted:false,roomInputEpoch:null,roomInputSequence:0,
  liveMotion:{reset(){},reconcile(){}},roomSnapshot:null,gameConfig:{},roomRosterKey:'',lobby:{},
  mapRecord:environment,parkEnvironment:{id:'fallback-park'},applyMatch(){},syncGameInstructions(){},refreshPlayerSlots(){},renderRoster(){},status(){},$:()=>({})
 });
 vm.runInContext(source.slice(start,end),context);manager.update(environment);
 return {manager,requests,environment,accept(sequence,deliveryActivity){
  const value={sequence,deliveryActivity,role:'spectator',selfId:'spectator',state:{game:0},requestRevision:1,slots:[],started:false};
  if(shell==='hockey')context.accept(value);else context.acceptRoom(value);
 }};
}

for(const shell of ['hockey','arcade']){
 test(shell+' activates deliveries only from accepted live activity and stops when it clears',async t=>{
  const f=acceptedSnapshot(shell);t.after(()=>f.manager.dispose());
  f.accept(1,false);f.accept(2,'true');await f.manager.refresh();
  assert.equal(f.requests.length,0,'ordinary idle worlds do not query delivery projections');
  f.accept(3,true);await f.manager.refresh();assert.equal(f.requests.length,1);
  assert.match(f.requests[0],new RegExp('mapId='+f.environment.id));assert.equal(f.manager.snapshot().dropoffs,1);
  f.accept(2,false);assert.equal(f.manager.snapshot().visible,true,'an older snapshot cannot withdraw live cargo');
  f.accept(4,true);assert.equal(f.requests.length,1,'unchanged activity adds no immediate request');
  f.accept(5,false);await f.manager.refresh();assert.equal(f.manager.snapshot().mapId,null);assert.equal(f.requests.length,1);
  f.accept(4,true);assert.equal(f.requests.length,1,'late active data cannot restart retired cargo');
 });
 test(shell+' preserves metadata-enabled deliveries with an idle server hint',async t=>{
  const f=acceptedSnapshot(shell,{metadata:true});t.after(()=>f.manager.dispose());await f.manager.refresh();
  assert.equal(f.requests.length,1);f.accept(1,false);await f.manager.refresh();
  assert.equal(f.manager.snapshot().mapId,f.environment.id);assert.equal(f.manager.snapshot().dropoffs,1);
 });
}
