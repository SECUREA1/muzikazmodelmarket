import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {forgeWorld} from '../forge-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

test('existing forge rooms gain the new market fixtures on upgrade and retain their smithing account',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'forge-upgrade-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const current=forgeWorld(),previous=structuredClone(current);
 previous.contentUpdatedAt='2026-10-31T12:00:00.000Z';
 const market=current.builderScene.objects.filter(object=>object.functionalSettings?.storeProductIds||object.modelId==='market-atm');
 assert.ok(market.length>0);const marketIds=new Set(market.map(object=>object.id));
 previous.builderScene.objects=previous.builderScene.objects.filter(object=>!marketIds.has(object.id));
 assert.notEqual(current.contentUpdatedAt,previous.contentUpdatedAt);
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>1000000,forgeState:async()=>({job:{id:'saved-workpiece',stage:'hammer'},progress:{completedItems:3}})});
 const identity={accountId:'returning-smith',username:'Smith'};
 const before=await runtime.command(current.id,previous,identity,{action:'join',requestId:'old-forge-arrival'});
 assert.ok(market.every(object=>!before.actors[object.id]));
 const after=await runtime.command(current.id,current,identity,{action:'join',requestId:'renovated-forge-arrival'});
 assert.ok(market.filter(object=>object.modelId==='market-atm').every(object=>after.actors[object.id]?.active));
 assert.equal(after.players[after.selfId].forge.job.id,'saved-workpiece');assert.equal(after.players[after.selfId].forge.progress.completedItems,3);
 assert.notEqual(after.sceneVersion,before.sceneVersion);
});
