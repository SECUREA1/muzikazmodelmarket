import test from 'node:test';
import assert from 'node:assert/strict';
import {quarryWorld} from '../quarry-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {quarryCommand,quarryLinkConnected,quarryMass,stepQuarry} from '../server-quarry.mjs';
import {earthworksTake,earthworksDeposit} from '../public/js/construction-earthworks.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' versus '+b);
function fixture(){
 const environment=quarryWorld(),runtime=new AuthoritativeRooms({now:()=>1000}),sim=runtime.initialize({objects:{}},environment).sim;
 const q=sim.quarry;q.aiEnabled=true;sim.construction.crew.enabled=true;for(const worker of sim.construction.crew.workers)worker.enabled=worker.id==='crew-maya';
 for(const state of Object.values(q.stations))state.enabled=true;
 const e=sim.construction.earthworks,raw=earthworksTake(e,{x:25,y:-3,z:-35},10,{radius:3,materials:['gravel']});earthworksDeposit(e,{x:68,y:Infinity,z:-34},raw,{radius:5});
 const player={actorId:'operator',health:100,lastSeen:1000,position:{x:80,y:0,z:-25}};sim.players.operator=player;let now=1000;
 return {environment,sim,q,player,tick(){now+=250;player.lastSeen=now;stepQuarry(sim,environment,now,.25);},command:(operation,fields={})=>quarryCommand(sim,player,environment,{operation,...fields},now,{identity:{walletId:'operator'}})};
}
test('every authored physical belt connects, and visible flow is measured from real conserved processing',()=>{
 const f=fixture(),mass=quarryMass(f.sim);for(const link of f.environment.quarry.links)assert.equal(quarryLinkConnected(link,f.sim.actors),true,link.id);
 f.tick();assert.ok(f.q.stations.screener.throughput>0);assert.ok(f.q.stations.screener.materialVolumes.sand>0);assert.ok(f.q.stations.crusher.materialVolumes.crushed>0);assert.ok(f.q.stations.stacker.throughput>0);
 for(const link of f.environment.quarry.links){const state=f.sim.actors[link.actorId].quarryMachine;assert.equal(state.running,state.throughput>1e-8);if(link.kind==='product-output')close(state.throughput,f.q.flow.products[link.material]||0);}
 close(quarryMass(f.sim),mass);assert.ok(f.q.stockpiles.sand.volume>0);
});
test('a removed intake or misaligned real conveyor stops feed without consuming source material',()=>{
 const f=fixture(),link=f.environment.quarry.links.find(l=>l.kind==='screen-feed'),actor=f.sim.actors[link.actorId],mass=quarryMass(f.sim);actor.position.x+=2;
 for(let i=0;i<8;i++)f.tick();assert.equal(f.q.stats.screened,0);assert.equal(f.q.stations.screener.throughput,0);assert.match(f.q.stations.screener.status,/disconnected/);assert.equal(actor.quarryMachine.running,false);close(quarryMass(f.sim),mass);
 actor.position.x-=2;f.tick();assert.ok(f.q.stats.screened>0);actor.active=false;const previous=f.q.stats.screened;f.tick();close(f.q.stats.screened,previous);close(quarryMass(f.sim),mass);
});
test('a broken product route retains its material buffer while other connected piles receive real output',()=>{
 const f=fixture(),link=f.environment.quarry.links.find(l=>l.kind==='product-output'&&l.material==='sand'),mass=quarryMass(f.sim);f.sim.actors[link.actorId].active=false;
 for(let i=0;i<8;i++)f.tick();assert.equal(f.q.stockpiles.sand.volume,0);assert.ok(f.q.bins.sand>0);assert.ok(f.q.stockpiles.fines.volume>0);close(quarryMass(f.sim),mass);
 f.sim.actors[link.actorId].active=true;f.tick();assert.ok(f.q.stockpiles.sand.volume>0);close(quarryMass(f.sim),mass);
});
test('feed controls set real throughput with operator reach and exclusive ownership checks',async()=>{
 const f=fixture(),mass=quarryMass(f.sim);await f.command('start',{stationId:'screener'});await f.command('feed-rate',{stationId:'screener',feedRate:.25});f.tick();close(f.q.stations.screener.throughput,.3);close(quarryMass(f.sim),mass);
 await assert.rejects(f.command('feed-rate',{stationId:'screener',feedRate:2}),/25%.*100%/);const other={...f.player,actorId:'other'};f.sim.players.other=other;
 await assert.rejects(quarryCommand(f.sim,other,f.environment,{operation:'feed-rate',stationId:'screener',feedRate:.5},1250),/Another player/);
 f.player.position={x:-80,y:0,z:80};await assert.rejects(f.command('feed-rate',{stationId:'screener',feedRate:.5}),/Walk/);
 await f.command('emergency-stop');f.tick();assert.ok(Object.values(f.q.stations).every(s=>s.throughput===0));assert.ok(f.environment.quarry.links.every(l=>!f.sim.actors[l.actorId].quarryMachine.running));close(quarryMass(f.sim),mass);
});

test('removed or disconnected processors cannot manufacture material through intact conveyors',()=>{
 for(const [kind,edit]of [['screener','removed'],['crusher','moved'],['stacker','removed']]){
  const f=fixture(),station=f.environment.quarry.stations[kind],actor=f.sim.actors[station.actorId],mass=quarryMass(f.sim);
  if(edit==='removed')actor.active=false;else actor.position.x+=100;
  for(let i=0;i<4;i++)f.tick();
  assert.equal(f.q.stations[kind].running,false,kind+' must be unavailable');
  assert.equal(f.q.stations[kind].throughput,0,kind+' must transfer no material');
  assert.equal(f.q.stats[kind==='screener'?'screened':kind==='crusher'?'crushed':'stacked'],0,kind+' must perform no work');
  close(quarryMass(f.sim),mass);
 }
});

test('a non-conveyor actor at the same endpoints cannot masquerade as a working belt',()=>{
 const f=fixture(),link=f.environment.quarry.links.find(l=>l.kind==='screen-feed'),actor=f.sim.actors[link.actorId],mass=quarryMass(f.sim);
 actor.modelId='material:cube';actor.asset={id:'material:cube',buildAssetId:'material:cube'};
 assert.equal(quarryLinkConnected(link,f.sim.actors),false);
 f.tick();assert.equal(f.q.stats.screened,0);close(quarryMass(f.sim),mass);
});

test('stone diverted into the crusher is not also shown on the screen-to-stacker route',()=>{
 const f=fixture();f.tick();assert.ok(f.q.flow.screenYield.stone>0);assert.ok(f.q.flow.stoneTransfer.stone>0);close(f.q.flow.screenOutput.stone,0);assert.ok(f.q.stations.screener.materialVolumes.stone>0,'screen outlet itself still displays actual produced stone');
 const mass=quarryMass(f.sim);f.q.conveyor=false;f.tick();close(f.q.flow.stoneTransfer.stone,0);close(f.q.flow.screenOutput.stone,f.q.flow.screenYield.stone);close(quarryMass(f.sim),mass);
});

test('a permanent quarry visual update keeps working machine poses and material inventory',()=>{
 const environment=quarryWorld(),runtime=new AuthoritativeRooms({now:()=>1000}),room={objects:{}},sim=runtime.initialize(room,environment).sim,truck=sim.actors['quarry-truck'];truck.position={x:0,y:0,z:44};truck.rotation.y=.3;
 const mass=quarryMass(sim),updated={...environment,contentUpdatedAt:environment.contentUpdatedAt+':visual-refresh'};runtime.initialize(room,updated);assert.deepEqual(truck.position,{x:0,y:0,z:44});assert.equal(truck.rotation.y,.3);close(quarryMass(sim),mass);assert.ok(updated.quarry.links.every(link=>quarryLinkConnected(link,sim.actors)));
});
