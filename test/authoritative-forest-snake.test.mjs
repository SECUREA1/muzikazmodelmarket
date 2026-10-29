import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {forestHarvestWorld} from '../forest-harvest-world.mjs';
import {FOREST_SNAKE_ID,FOREST_SNAKE_MODEL_ID,FOREST_SNAKE_REMARKS} from '../public/js/forest-snake-config.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {createRoomSnapshotEncoder,snapshotAcknowledgements,hydrateRoomSnapshot} from '../public/js/room-snapshot.js';
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'forest-snake-room-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=1_000_000,sequence=0;
 const world=forestHarvestWorld(),store=new SharedRoomStore(join(dir,'rooms.json')),room=new AuthoritativeRooms({store,now:()=>now}),identity={accountId:'snake-guest',walletId:'account:snake-guest',username:'Guest'};
 t.after(()=>room.collision.clearWorlds());
 return {world,store,room,advance:ms=>now+=ms,send:(action,fields={})=>room.command(world.id,world,identity,{action,requestId:'snake-'+ ++sequence,...fields}),get now(){return now;}};
}
test('the real forest room patrols, speaks on a shared clock and exposes one canonical market snake',async t=>{
 const f=await fixture(t),joined=await f.send('join'),initial={...joined.forestSnake.position};
 assert.equal(joined.actors[FOREST_SNAKE_ID].modelId,FOREST_SNAKE_MODEL_ID);assert.equal(joined.actors[FOREST_SNAKE_ID].forestSnakeManaged,true);
 assert.equal(GAME_ECONOMY.filter(item=>item.buildAssetId===FOREST_SNAKE_MODEL_ID).length,1);
 f.advance(500);const moved=await f.room.snapshot(f.world.id,f.world);assert.notDeepEqual(moved.forestSnake.position,initial);
 f.advance(3200);const talking=await f.send('forest-status');assert.ok(FOREST_SNAKE_REMARKS.includes(talking.forestSnake.speech.text));
 const utterance=talking.forestSnake.speech;
 await f.store.update(f.world.id,room=>{const self=room.simulation.players[joined.selfId];self.position={...room.simulation.forestHarvest.snake.headPosition,y:0};self.grounded=true;self.lastSeen=f.now;});
 const chat=await f.send('forest-snake-talk',{text:'Client-supplied words',position:{x:999,y:0,z:999}});assert.equal(chat.result.snakeSpeech.id,utterance.id);assert.equal(chat.result.snakeSpeech.text,utterance.text);
 assert.equal(chat.players[joined.selfId].health,100);assert.equal(chat.actors[FOREST_SNAKE_ID].destructible,false);
 await f.store.update(f.world.id,room=>{room.simulation.players[joined.selfId].position={x:130,y:0,z:130};});
 await assert.rejects(f.send('forest-snake-talk'),/closer/);
});
test('snake motion has its own compact component instead of resending the tree inventory each frame',async t=>{
 const f=await fixture(t),first=await f.send('join'),encode=createRoomSnapshotEncoder();
 const request={action:'input',snapshotProtocol:2,snapshotMode:'compact',sceneVersion:first.sceneVersion};
 const baseline=hydrateRoomSnapshot(encode(first,request,f.world));
 f.advance(200);const next=await f.room.snapshot(f.world.id,f.world),wire=encode(next,{...request,snapshotAcknowledgements:snapshotAcknowledgements(baseline)},f.world);
 assert.ok(wire.snapshotUnchanged.includes('forestHarvest'));assert.ok(!wire.snapshotUnchanged.includes('forestSnake'));
 const hydrated=hydrateRoomSnapshot(wire,baseline);assert.deepEqual(hydrated.forestHarvest,first.forestHarvest);assert.notDeepEqual(hydrated.forestSnake.position,first.forestSnake.position);
});
