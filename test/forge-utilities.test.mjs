import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {forgeItemSettings} from '../public/js/forge-items.js';

test('crafted utility objects open gates, switch lanterns and ring a shared cooldown-protected bell',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'forge-utilities-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=1000000,sequence=0;
 const models=[['gate','forge-iron-gate',3],['lantern','forge-lantern',0],['bell','forge-bronze-bell',-3]];
 const environment={id:'forge-utility-check',playable:true,spawn:{x:0,y:.02,z:2},proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:40,objects:models.map(([id,modelId,x])=>({id,modelId,asset:{buildAssetId:modelId},position:{x,y:0,z:-1},functionalSettings:forgeItemSettings(modelId)})),gameplay:{friendlyFire:false,radTox:false}}};
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>now});
 const identity={accountId:'utility-smith',username:'Smith'},send=fields=>runtime.command(environment.id,environment,identity,{requestId:'utility-'+ ++sequence,...fields});
 await send({action:'join',radToxEnabled:false});
 let state=await send({action:'interact',entityId:'gate'});assert.equal(state.actors.gate.open,true);
 state=await send({action:'interact',entityId:'gate'});assert.equal(state.actors.gate.open,false);
 state=await send({action:'interact',entityId:'lantern'});assert.equal(state.actors.lantern.switched,true);
 state=await send({action:'interact',entityId:'lantern'});assert.equal(state.actors.lantern.switched,false);
 state=await send({action:'interact',entityId:'bell'});assert.equal(state.result.forgeBell.entityId,'bell');assert.equal(state.result.forgeBell.rungAt,now);
 assert.ok(state.events.some(event=>event.forgeBell?.id===state.result.forgeBell.id));
 now+=500;await assert.rejects(send({action:'interact',entityId:'bell'}),/cooling down/);
 now+=600;state=await send({action:'interact',entityId:'bell'});assert.equal(state.result.forgeBell.rungAt,now);
});
