import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {ISLAND_EXPERIENCES,ISLAND_SPAWN} from '../public/js/tropical-island-config.js';
import {ensureTropicalIsland,stepTropicalIsland,tropicalIslandCommand,tropicalIslandView,playerTropicalIslandView} from '../server-tropical-island.mjs';

const station=id=>ISLAND_EXPERIENCES.find(point=>point.id===id);
const world=()=>({id:'tropical-island',game:'tropical-island',name:'Palm Coast Resort',publicDestination:true,proceduralLand:true,spawn:{...ISLAND_SPAWN},streets:[],builderScene:{layout:'tropical-island',mapSize:180,gameplay:{multiplayer:true,radTox:false},layoutMeta:{locations:ISLAND_EXPERIENCES.map(point=>({...point,name:point.label,width:8,depth:8}))},objects:ISLAND_EXPERIENCES.map(point=>({id:'island-station-'+point.id,modelId:'street-sign',name:point.label,position:{...point.position},functionalSettings:{behavior:'talk',islandStation:point.id,interactionDistance:point.radius,enabled:true}}))}});
function fixture(){
 const environment=world();let now=100000;
 const player={actorId:'account:alice',username:'Alice',health:100,grounded:true,lastSeen:now,position:{...station('tiki-bar').position},score:0,yaw:0};
 const sim={actors:Object.fromEntries(environment.builderScene.objects.map(object=>[object.id,{id:object.id,active:true,position:{...object.position}}])),players:{'account:alice':player}};
 ensureTropicalIsland(sim,environment,now);
 const act=(operation,stationId,kind,at)=>{now=at??now+100;player.lastSeen=now;return tropicalIslandCommand(sim,player,environment,{action:'island-action',operation,stationId,kind},now);};
 return {sim,player,environment,act,get now(){return now;},setNow:value=>{now=value;},move:id=>{player.position={...station(id).position};}};
}

test('native island stations enforce server map, proximity, health and availability',()=>{
 const f=fixture();
 assert.throws(()=>tropicalIslandCommand(f.sim,f.player,{id:'other-world'},{action:'island-action',operation:'drink',stationId:'tiki-bar',kind:'beer'},f.now),/Visit Palm Coast/);
 assert.throws(()=>f.act('visit','invented-site'),/Choose an island resort station/);
 f.move('lookout');assert.throws(()=>f.act('drink','tiki-bar','beer'),/Move closer/);
 f.move('tiki-bar');f.player.health=0;assert.throws(()=>f.act('drink','tiki-bar','beer'),/Join the live island/);f.player.health=100;
 f.player.grounded=false;assert.throws(()=>f.act('drink','tiki-bar','beer'),/Step onto the island/);f.player.grounded=true;
 f.sim.actors['island-station-tiki-bar'].active=false;assert.throws(()=>f.act('drink','tiki-bar','beer'),/unavailable/);f.sim.actors['island-station-tiki-bar'].active=true;
 f.environment.builderScene.objects[0].functionalSettings.enabled=false;assert.throws(()=>f.act('drink','tiki-bar','beer'),/unavailable/);
 assert.equal(f.player.score,0);assert.equal(f.player.island?.drinks||0,0);
});

test('drinks use the real server clock, stack independently and award no passport or score',()=>{
 const f=fixture(),start=f.now+100;
 f.act('drink','tiki-bar','beer',start);
 assert.equal(f.player.island.activeDrinks[0].remaining,120);
 assert.equal(f.player.island.intoxication,0);
 assert.equal(f.player.score,0);assert.deepEqual(f.player.island.visits,[]);
 f.act('drink','tiki-bar','beer',start+60000);
 assert.equal(f.player.island.activeDrinks[0].remaining,60);
 assert.equal(f.player.island.activeDrinks[1].remaining,120);
 stepTropicalIsland(f.sim,f.environment,start+120000);
 assert.equal(f.player.island.activeDrinks.length,1);
 assert.equal(f.player.island.activeDrinks[0].remaining,60);
 stepTropicalIsland(f.sim,f.environment,start+180000);
 assert.equal(f.player.island.intoxication,0);assert.equal(f.player.island.buzzRemaining,0);assert.equal(f.player.island.status,'running');
 stepTropicalIsland(f.sim,f.environment,start+3600000);
 assert.equal(f.player.island.status,'running');assert.equal(f.player.island.elapsed,3600);
 f.act('drink','tiki-bar','beer',start+3600000);
 assert.equal(f.player.island.activeDrinks[0].remaining,120,'fresh drink cannot inherit an earlier offline interval');
});

test('unique passport visits are server scored once; submitted scores and doses are ignored',()=>{
 const f=fixture();
 for(const point of ISLAND_EXPERIENCES){f.move(point.id);f.act('visit',point.id);f.act('visit',point.id);}
 assert.equal(f.player.score,800);assert.equal(f.player.island.score,800);assert.equal(f.player.island.visits.length,8);
 f.move('tiki-bar');tropicalIslandCommand(f.sim,f.player,f.environment,{action:'island-action',operation:'drink',stationId:'tiki-bar',kind:'beer',dose:99,intoxication:1,score:900000},f.now);
 assert.equal(f.player.island.activeDrinks[0].dose,.33);assert.equal(f.player.island.intoxication,0);assert.equal(f.player.score,800);
 const view=playerTropicalIslandView(f.player);view.visits.push('forged');view.activeDrinks[0].dose=99;
 assert.equal(f.player.island.visits.length,8);assert.equal(f.player.island.activeDrinks[0].dose,.33);
});

test('native activities match station types and shared beach balls use server motion',()=>{
 const f=fixture();f.move('beach-ball');const before=tropicalIslandView(f.sim).balls[0].position;
 const kick=f.act('kick','beach-ball');assert.match(kick.message,/kicked/);
 stepTropicalIsland(f.sim,f.environment,f.now+250);
 const after=tropicalIslandView(f.sim).balls[0].position;assert.ok(after.y>before.y);
 const copied=tropicalIslandView(f.sim);copied.balls[0].position.x=900;assert.notEqual(f.sim.island.balls[0].position.x,900);
 f.move('lookout');assert.throws(()=>f.act('kick','lookout'),/Beach Ball Rally/);
 f.move('snorkel');f.act('snorkel','snorkel');assert.equal(f.player.island.activity.kind,'snorkel');
 assert.deepEqual(f.player.position,station('snorkel').position,'reef inspection does not trust or inject client teleports');
 f.move('cabanas');f.act('relax','cabanas');assert.equal(f.player.island.activity.kind,'relax');
 assert.equal(f.player.score,0,'activities and drinks cannot duplicate the explicit passport reward');
});

async function runtime(t){
 const directory=await mkdtemp(join(tmpdir(),'native-island-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=1000000,request=0;const file=join(directory,'rooms.json'),environment=world();
 const make=()=>new AuthoritativeRooms({store:new SharedRoomStore(file),now:()=>now});
 const rooms=make(),identity={accountId:'alice',username:'Alice',walletId:'account:alice'};
 const send=(action,fields={},at)=>{now=at??now+100;return rooms.command(environment.id,environment,identity,{action,requestId:'island-command-'+ ++request,...fields});};
 return {rooms,environment,identity,send,make,setNow:value=>{now=value;},get now(){return now;}};
}

test('authoritative gameplay exposes residents, quests, shared actors and replay-safe island actions',async t=>{
 const f=await runtime(t),joined=await f.send('join'),id=joined.selfId;
 assert.equal(joined.island.enabled,true);assert.equal(joined.players[id].island.authoritative,true);
 assert.equal(joined.players[id].island.remaining,null);assert.equal(joined.players[id].island.status,'running');
 assert.ok(Object.values(joined.actors).some(actor=>actor.resident),'uses real native residents');
 await f.send('map-access',{position:{...station('tiki-bar').position,z:station('tiki-bar').z+2}});
 const visited=await f.send('interact',{entityId:'island-station-tiki-bar'});
 assert.equal(visited.result.islandStationId,'tiki-bar');assert.deepEqual(visited.players[id].island.visits,['tiki-bar']);
 const fields={operation:'drink',stationId:'tiki-bar',kind:'beer',requestId:'island-drink-once'};
 const drink=await f.send('island-action',fields),retry=await f.send('island-action',fields);
 assert.equal(drink.players[id].island.drinks,1);assert.equal(retry.players[id].island.drinks,1);assert.equal(retry.players[id].score,100);
 f.setNow(f.now+120000);const sober=await f.rooms.snapshot(f.environment.id,f.environment);
 assert.equal(sober.players[id],undefined,'inactive presence remains governed by native room leases');
 const restored=await f.make().command(f.environment.id,f.environment,f.identity,{action:'join',requestId:'island-rejoin',radToxEnabled:false});
 assert.equal(restored.players[id].island.intoxication,0);assert.equal(restored.players[id].island.drinks,1);assert.deepEqual(restored.players[id].island.visits,['tiki-bar']);
 assert.equal(restored.players[id].score,100,'saved passport progress restores through the native room store');
 assert.ok(restored.questOffers.some(offer=>offer.siteQuest),'native map quests remain available');
});
