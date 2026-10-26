import test from 'node:test';
import assert from 'node:assert/strict';
import {fishingCommand,stepFishing,playerFishingView} from '../server-fishing.mjs';
import {FISH_SPECIES,FISHING_RULES,fishingZoneAt} from '../public/js/fishing-config.js';
import {neonMarina} from '../neon-marina.mjs';

function setup({speciesId='mackerel',phase=0,zones}={}){
 const marina=neonMarina(),species=FISH_SPECIES.find(fish=>fish.id===speciesId);
 const environment={id:'easy-fishing',builderScene:{objects:[],layoutMeta:{harbor:{...marina.harbor,...(zones?{fishingZones:zones}:{})}}}};
 const position=species.water==='fresh'?{x:-390,y:0,z:280}:{x:145,y:0,z:-38};
 const boat={id:'angler',modelId:'harbor-fishing-boat',position,rotation:{x:0,y:0,z:0},active:true,holderId:'account:easy',boating:{anchor:true,speed:0}};
 const player={actorId:'account:easy',username:'Easy Angler',position:{...position,y:.35},vehicleId:boat.id,health:100,grounded:true,lastSeen:100000,yaw:0};
 const sim={actors:{[boat.id]:boat},players:{[player.actorId]:player},events:[]};let now=100000,roll=0;
 const eligible=FISH_SPECIES.filter(fish=>fish.water===species.water),weighted=eligible.flatMap(fish=>Array.from({length:fish.rarity==='legendary'?1:fish.rarity==='rare'?3:fish.rarity==='uncommon'?6:12},()=>fish));
 const integer=(min,max)=>max===undefined?(roll++===0?weighted.findIndex(fish=>fish.id===speciesId):Math.round(phase*100)):min;
 const send=(operation,fields={},options={})=>fishingCommand(sim,player,environment,{operation,sessionId:player.fishing?.session?.id,...fields},now,{integer,...options});
 const advance=ms=>{now+=ms;player.lastSeen=now;stepFishing(sim,environment,now);};
 return {sim,player,boat,environment,send,advance,get now(){return now;}};
}

test('Cast safely anchors a nearly stopped boat after validation and rejects moving, assisted or blocked casts without changing helm',()=>{
 const f=setup();f.boat.boating={speed:.4,anchor:false,throttle:.1,throttleCommand:0};
 const ready=playerFishingView(f.sim,f.player,f.environment).availability;
 assert.equal(ready.canCast,true);assert.equal(ready.ready,false);assert.equal(ready.preparationRequired,true);
 const original=structuredClone(f.boat);
 assert.throws(()=>f.send('cast',{rodId:'fishing-pro-rod'}),/Unlock/);assert.deepEqual(f.boat,original);
 assert.throws(()=>f.send('cast',{zoneId:'beacon-reef'}),/fishing area/);assert.deepEqual(f.boat,original);
 assert.throws(()=>f.send('cast',{}, {visible:()=>false}),/blocked/);assert.deepEqual(f.boat,original);
 f.boat.boating.speed=FISHING_RULES.castSpeedLimit+.01;assert.throws(()=>f.send('cast'),/slow down/);assert.equal(f.boat.boating.anchor,false);
 f.boat.boating.speed=0;f.boat.boating.assist='navigate';assert.throws(()=>f.send('cast'),/cancel Auto/);assert.equal(f.boat.boating.assist,'navigate');
 f.boat.boating.assist=null;f.send('cast');assert.equal(f.boat.boating.anchor,true);assert.equal(f.boat.boating.speed,0);assert.equal(f.boat.boating.throttleCommand,0);
 assert.equal(f.player.fishing.session.status,'waiting');assert.equal(playerFishingView(f.sim,f.player,f.environment).availability.ready,true);
});

test('overlapping fishing areas keep the exact selected destination in availability and catches',()=>{
 const zones=[{id:'first-zone',name:'First',water:'salt',x:145,z:-38,radius:25},{id:'selected-zone',name:'Selected',water:'salt',x:145,z:-38,radius:25}];
 const f=setup({zones});f.boat.boating.navigationZoneId='selected-zone';
 assert.equal(fishingZoneAt(f.environment,{x:145,z:-38}).id,'first-zone');
 assert.equal(fishingZoneAt(f.environment,{x:145,z:-38},'selected-zone').id,'selected-zone');
 assert.equal(fishingZoneAt(f.environment,{x:145,z:-38},'missing'),null);
 const view=playerFishingView(f.sim,f.player,f.environment);
 for(const side of ['port','starboard'])assert.equal(view.availability.sides[side].zoneId,'selected-zone');
 f.send('cast',{side:'starboard',zoneId:'selected-zone'});assert.equal(f.player.fishing.session.zoneId,'selected-zone');
 f.send('cancel');f.send('cast',{zoneId:'first-zone'});assert.equal(f.player.fishing.session.zoneId,'first-zone');
});

test('every species can be landed by holding Reel on the free kit across surge phases and mobile packet intervals',async t=>{
 for(const species of FISH_SPECIES)for(const phase of [0,1.57,3.14,4.71])for(const interval of [450,900,1200])await t.test(species.id+' phase '+phase+' / '+interval+'ms',()=>{
  const f=setup({speciesId:species.id,phase});f.send('cast');const session=f.player.fishing.session;
  f.advance(session.biteAt-f.now);assert.equal(session.status,'bite');
  f.send('hook');const hookedAt=session.hookedAt;
  let maximumTension=0,progress=0;
  for(let i=0;i<Math.ceil(30000/interval)&&session.status==='reeling';i++){
   f.send('reel',{holding:true});f.advance(interval);
   maximumTension=Math.max(maximumTension,session.tension);assert.ok(session.progress>=progress);progress=session.progress;
  }
  assert.equal(session.status,'caught','free starter gear should land every species with a simple hold');
  assert.equal(session.fish.id,species.id);assert.ok(session.landedAt-hookedAt<30000,'a catch should fit a short mobile play session');
  assert.ok(maximumTension<.82,'automatic drag must protect a new player from a snapped line');
  assert.ok(session.landedAt-session.startedAt>=6000,'fast assisted catches still satisfy durable settlement bounds');
  assert.equal(f.send('keep').settlement.fish.id,species.id);
 });
});

test('release, expired reel leases and duplicate Hook preserve earned progress without auto-playing',()=>{
 const f=setup();f.send('cast');const session=f.player.fishing.session;
 f.advance(session.biteAt-f.now+FISHING_RULES.biteWindowMs-200);f.send('hook');const hookedAt=session.hookedAt;
 f.send('reel',{holding:true});f.advance(1000);const progress=session.progress;
 f.send('hook');assert.equal(session.hookedAt,hookedAt,'a retried Hook cannot restart or speed up the fight');
 f.send('reel',{holding:false});f.advance(2500);assert.equal(session.progress,progress);assert.equal(session.reeling,false);assert.equal(session.tension,0);
 f.send('reel',{holding:true});f.advance(FISHING_RULES.reelLeaseMs);assert.equal(session.reeling,false);const expiredProgress=session.progress;
 f.advance(2500);assert.equal(session.progress,expiredProgress,'lost input cannot continue earning progress');
 assert.throws(()=>f.send('reel',{holding:1}),/held or released/);
 assert.throws(()=>f.send('reel',{sessionId:'other-session',holding:true}),/expired/);
 f.send('cancel');assert.equal(session.status,'cancelled');assert.equal(f.boat.boating.anchor,true);
});

test('boat safety changes cancel the cast and never let a fisher control somebody else’s vessel',()=>{
 for(const change of [f=>{f.boat.active=false;},f=>{f.boat.holderId='account:other';},f=>{f.boat.boating.anchor=false;},f=>{f.boat.boating.assist='navigate';},f=>{f.boat.boating.speed=2;},f=>{f.player.vehicleId=null;}]){
  const f=setup();f.send('cast');change(f);f.advance(50);assert.equal(f.player.fishing.session.status,'cancelled');assert.equal(f.player.fishing.session.reeling,false);
 }
});
