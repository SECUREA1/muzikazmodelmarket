import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {casinoWorld} from '../casino-world.mjs';
import {CASINO_LAYOUT_VERSION} from '../public/js/casino-config.js';

async function setup(t){
 const directory=await mkdtemp(join(tmpdir(),'casino-layout-save-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=new SharedRoomStore(join(directory,'rooms.json')),world=casinoWorld();let now=100000;
 const rooms=new AuthoritativeRooms({store,now:()=>now}),identity={accountId:'returning',username:'Returning guest'},actorId='account:returning';
 await rooms.command(world.id,world,identity,{action:'join',requestId:'join-before-renovation'});
 return {store,world,rooms,actorId,tick:()=>{now+=1000;}};
}

test('a saved player inside a renovated wall returns to clear public ground without losing social or quest progress',async t=>{
 const f=await setup(t),blocked={x:-27,y:.02,z:-30};
 assert.equal(f.rooms.collision.hasBodyClearance(f.world,blocked,.4),false,'the save position intersects the new service-room wall');
 await f.store.update(f.world.id,room=>{
  room.simulation.casinoLayoutVersion=1;const p=room.simulation.players[f.actorId];p.position=blocked;p.input={forward:1};
  p.quests={savedQuest:{progress:3}};p.casinoProgress={reputation:42,skills:{poker:18},cosmetics:['Floor guide badge']};
  p.casinoTask={id:'old-walking-favor',status:'active'};
 });
 f.tick();const state=await f.rooms.snapshot(f.world.id,f.world),p=state.players[f.actorId];
 assert.ok(f.rooms.collision.hasBodyClearance(f.world,p.position,.4));assert.ok(Math.hypot(p.position.x,p.position.z-32)<.1);
 assert.deepEqual(p.quests,{savedQuest:{progress:3}});assert.equal(p.casinoProgress.reputation,42);assert.equal(p.casinoProgress.skills.poker,18);
 assert.equal(p.casinoTask.status,'cancelled');assert.equal(p.input.forward,undefined);
 const saved=await f.store.get(f.world.id);assert.equal(saved.simulation.casinoLayoutVersion,CASINO_LAYOUT_VERSION);
 const revision=p.movementRevision;f.tick();const repeated=await f.rooms.snapshot(f.world.id,f.world);
 assert.equal(repeated.players[f.actorId].movementRevision,revision,'ordinary snapshots do not repeatedly relocate the visitor');
});

test('a returning player on clear floor keeps their saved position during the layout migration',async t=>{
 const f=await setup(t),position={x:0,y:.02,z:19};
 await f.store.update(f.world.id,room=>{room.simulation.casinoLayoutVersion=1;room.simulation.players[f.actorId].position=position;});
 f.tick();const state=await f.rooms.snapshot(f.world.id,f.world);
 assert.ok(Math.hypot(state.players[f.actorId].position.x-position.x,state.players[f.actorId].position.z-position.z)<.01);
 assert.equal(Object.values(state.actors).filter(actor=>actor.resident?.casino).length,22);
 assert.equal(Object.values(state.actors).filter(actor=>actor.resident?.duty==='guard').length,2);
});

test('completed advanced rounds grant familiarity once and reach the dealer assigned to that table',async t=>{
 const f=await setup(t);
 for(const [game,stationId,dealerId]of [['baccarat','casino-baccarat-vip','casino-resident-dealer-blackjack-2'],['threecard','casino-threecard-salon','casino-resident-dealer-poker-2']]){
  const round={id:'server-settled-'+game,game,stationId,phase:'complete',completedAt:new Date(100000).toISOString(),outcome:'win'};
  assert.equal(await f.rooms.casinoActivity(f.actorId,round),true);
  assert.equal(await f.rooms.casinoActivity(f.actorId,round),false);
  const saved=await f.store.get(f.world.id);
  assert.equal(saved.simulation.players[f.actorId].casinoProgress.skills[game],2);
  assert.ok(saved.simulation.actors[dealerId].resident.memory.some(item=>item.kind==='player-game'&&item.subjectId===f.actorId));
 }
});
