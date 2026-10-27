import test from 'node:test';
import assert from 'node:assert/strict';
import {FUNHOUSE_ID,FUNHOUSE_STATIONS,funhouseStations} from '../public/js/clown-funhouse-config.js';
import {nearestFunhouseStation} from '../public/js/clown-funhouse-ui.js';
import {funhouseCommand,stepFunhouse,ensureFunhouseProgress,playerFunhouseView} from '../server-clown-funhouse.mjs';

const canonical=kind=>FUNHOUSE_STATIONS.find(station=>station.kind===kind);
const object=(id,kind,x=0,z=0,settings={})=>({id,name:'Placed '+kind,modelId:'funhouse-'+kind,asset:{buildAssetId:'funhouse-'+kind},position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'interact',funhouseStation:kind,funhouseApproach:{x:0,y:0,z:0},interactionDistance:4,...settings}});
const map=objects=>({id:'my-carnival',name:'My carnival',builderScene:{layout:'grand-floor',objects}});
function fixture(objects){
 const environment=map(objects),player={actorId:'guest',health:100,grounded:true,position:{x:0,y:0,z:0},lastSeen:100000,score:0},sim={players:{guest:player},actors:{}};let now=100000;
 const send=(action,fields={},at)=>{now=at??now+300;player.lastSeen=now;return funhouseCommand(sim,player,environment,{action,...fields},now,{integer:()=>0});};
 const station=id=>funhouseStations(environment,{actors:sim.actors}).find(value=>value.objectId===id);
 return {environment,player,sim,send,station,move:id=>{player.position={...station(id).position};},get now(){return now;},step:at=>{now=at;player.lastSeen=at;stepFunhouse(sim,environment,at);}};
}

test('fixed attractions stay in their permanent map while placed approaches follow actual scale and rotation',()=>{
 assert.equal(funhouseStations({id:FUNHOUSE_ID}).length,FUNHOUSE_STATIONS.length);
 assert.deepEqual(funhouseStations({id:FUNHOUSE_ID,funhouse:{enabled:false}}),[]);
 assert.deepEqual(funhouseStations({id:'my-copy',game:'funhouse',builderScene:{sourceLayout:'clown-funhouse',objects:[]}}),[]);
 assert.deepEqual(funhouseStations({id:FUNHOUSE_ID,builderScene:{layoutMeta:{funhouse:{editableItems:true}},objects:[]}}),[]);
 const gallery=object('gallery','water',10,20,{funhouseApproach:{x:1,y:2,z:2}});gallery.position.y=4;gallery.rotation.y=Math.PI/2;gallery.scale={x:2,y:3,z:3};
 const environment=map([gallery]),[station]=funhouseStations(environment);
 assert.equal(station.id,'funhouse-instance:gallery');assert.equal(station.canonicalStationId,canonical('water').id);
 assert.ok(Math.abs(station.position.x-16)<1e-8);assert.ok(Math.abs(station.position.z-18)<1e-8);assert.equal(station.position.y,10);
 assert.equal(nearestFunhouseStation(environment,{...station.position}).id,station.id,'elevated placed attractions use their own floor');
 assert.equal(nearestFunhouseStation(environment,{...station.position,y:0}),null,'another floor cannot use the controls');
});

test('live actor movement, removal and explicit disabling replace authored controls without phantom duplicates',()=>{
 const car=object('car','car',0,0),environment=map([car,structuredClone(car)]);
 const actor={id:'car',active:true,position:{x:25,y:0,z:10},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},definition:{gameplay:{funhouseStation:'car',funhouseApproach:{x:-4,y:0,z:3}}}};
 let stations=funhouseStations(environment,{actors:{car:actor}});assert.equal(stations.length,1);assert.deepEqual(stations[0].position,{x:21,y:0,z:13});
 assert.equal(nearestFunhouseStation(environment,{x:0,y:0,z:0},{actors:{car:actor}}),null);
 actor.active=false;assert.deepEqual(funhouseStations(environment,{actors:{car:actor}}),[]);actor.active=true;actor.holderId='someone';assert.deepEqual(funhouseStations(environment,{actors:{car:actor}}),[]);
 delete actor.holderId;car.functionalSettings.funhouseStation=false;car.functionalSettings.funhouseKind='car';actor.definition.gameplay.funhouseStation=false;
 assert.deepEqual(funhouseStations(environment,{actors:{car:actor}}),[],'explicitly disabled controls do not inherit a model default');
 assert.deepEqual(funhouseStations(map([object('fake','invented')])),[]);
});

test('purchased gallery instances run full authoritative rounds in other worlds and award canonical stamps once',()=>{
 const f=fixture([object('gallery','water',5,7)]);f.move('gallery');
 const station=f.station('gallery'),round=f.send('funhouse-start',{stationId:station.id}).funhouse.round;
 assert.equal(round.objectId,'gallery');assert.equal(round.stationId,station.id);
 for(let index=0;index<3;index++){
  const result=f.send('funhouse-squirt',{roundId:round.id,targetId:round.targetId,score:9999});
  assert.equal(result.funhouseEffect.objectId,'gallery');assert.equal(result.funhouseEffect.canonicalStationId,canonical('water').id);
 }
 f.step(round.endsAt);assert.equal(round.status,'complete');assert.equal(f.player.score,30);assert.deepEqual(f.player.funhouse.stamps,[canonical('water').id]);
 f.step(round.endsAt+1000);assert.equal(f.player.score,30);
 const repeat=f.send('funhouse-start',{stationId:station.id}).funhouse.round;f.send('funhouse-squirt',{roundId:repeat.id,targetId:repeat.targetId});f.step(repeat.endsAt);
 assert.equal(f.player.score,40);assert.equal(f.player.funhouse.stamps.length,1);
});

test('editing, deleting or disabling a gallery cancels its existing round and cannot move its score to a replacement',()=>{
 for(const edit of ['move','delete','disable']){
  const gallery=object('gallery','water'),f=fixture([gallery]),round=f.send('funhouse-start',{stationId:f.station('gallery').id}).funhouse.round;
  f.send('funhouse-squirt',{roundId:round.id,targetId:round.targetId});
  if(edit==='move')gallery.position.x=20;else if(edit==='delete')f.environment.builderScene.objects=[];else gallery.functionalSettings.funhouseStation=false;
  f.step(round.endsAt);assert.equal(round.status,'cancelled',edit);assert.equal(f.player.score,0);assert.deepEqual(f.player.funhouse.stamps,[]);
 }
 const f=fixture([object('west','water'),object('east','water',30)]),round=f.send('funhouse-start',{stationId:f.station('west').id}).funhouse.round;
 f.move('east');assert.throws(()=>f.send('funhouse-squirt',{roundId:round.id,targetId:round.targetId}),/Walk closer/);assert.equal(round.status,'cancelled');
 assert.throws(()=>f.send('funhouse-use',{stationId:canonical('car').id}),/Choose a funhouse attraction/,'fixed-map station IDs grant no remote controls');
});

test('placed shows and costumes work while maze completion stays paired to a real entrance',()=>{
 const f=fixture([object('car','car'),object('spinner','spinner',10),object('jack','jackbox',20),object('dress','dressup',30),object('maze-start','mirrors',40,0,{funhouseMazeGroup:'one'}),object('wrong-bell','maze-finish',50,0,{funhouseMazeGroup:'two'}),object('maze-bell','maze-finish',60,0,{funhouseMazeGroup:'one'})]);
 for(const id of ['car','spinner','jack']){f.move(id);const result=f.send('funhouse-use',{stationId:f.station(id).id});assert.equal(result.funhouseEffect.objectId,id);}
 f.move('dress');f.send('funhouse-dress',{stationId:f.station('dress').id,hat:true,shoes:true});
 f.move('maze-start');f.send('funhouse-use',{stationId:f.station('maze-start').id});f.move('wrong-bell');assert.throws(()=>f.send('funhouse-use',{stationId:f.station('wrong-bell').id},f.now+5000),/Begin at/);
 f.move('maze-bell');f.send('funhouse-use',{stationId:f.station('maze-bell').id});
 assert.deepEqual(f.player.funhouse.stamps.sort(),['car','spinner','jackbox','dressup','maze-finish'].map(kind=>canonical(kind).id).sort());
});

test('owned equipment projection retains portable gear and copies its record without requiring an attraction',()=>{
 const player={};const state=ensureFunhouseProgress(player);state.tool='water';state.equipment={hat:'owned-hat',shoes:'owned-shoes',tool:'owned-gun'};state.costume={hat:true,shoes:true};
 const projected=playerFunhouseView(player);assert.equal(projected.tool,'water');assert.equal(projected.equipment.hat,'owned-hat');
 projected.equipment.hat='forged';projected.costume.shoes=false;assert.equal(state.equipment.hat,'owned-hat');assert.equal(state.costume.shoes,true);
});
