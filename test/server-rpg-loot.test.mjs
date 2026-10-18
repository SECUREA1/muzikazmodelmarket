import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {refreshRpgLoot,dropRpgLoot} from '../server-rpg-loot.mjs';

test('supply sites replenish, cover all body stats, expire drops and preserve custom maps',()=>{
 const sim={actors:{},radTox:{}};const map={spawn:{x:0,y:0,z:0}};
 refreshRpgLoot(sim,map,100000,p=>p);assert.equal(Object.keys(sim.actors).length,6);
 const first=Object.values(sim.actors)[0];first.active=false;first.loot.collectedAt=100000;
 refreshRpgLoot(sim,map,159999,p=>p);assert.equal(Object.values(sim.actors).filter(a=>a.active).length,5);
 refreshRpgLoot(sim,map,160001,p=>p);assert.equal(Object.values(sim.actors).filter(a=>a.active).length,6);
 const custom={actors:{},radTox:{}};refreshRpgLoot(custom,{builderScene:{}},1,p=>p);assert.equal(Object.keys(custom.actors).length,0);
 const enemy={position:{x:1,y:0,z:0}};dropRpgLoot(custom,enemy,100000);dropRpgLoot(custom,enemy,100000);assert.equal(Object.keys(custom.actors).length,1);
 refreshRpgLoot(custom,{builderScene:{}},400001,p=>p);assert.equal(Object.keys(custom.actors).length,0);
});

test('server enemy drops grant durable care supplies once, enforce reach and preserve other items',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'rpg-loot-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const db=new UserJsonDatabase(join(dir,'users.json')),wallet='0x1111111111111111111111111111111111111111';
 await db.put(wallet,{tokens:{MZK:0},items:[{id:'old-collectible'}],memory:{ioncoreRpg:{stats:{health:20}}}});
 let now=100000;const store=new SharedRoomStore(join(dir,'rooms.json'));
 const runtime=new AuthoritativeRooms({store,now:()=>now,collectLoot:(identity,id,key)=>db.grantRpgLoot(identity.walletId,id,key)});
 const identity={accountId:'alice',walletId:wallet,username:'Alice',stats:{health:20}};
 const map={id:'custom',updatedAt:'v1',spawn:{x:0,y:0,z:0},builderScene:{objects:[{id:'enemy',modelId:'enemy',position:{x:0,y:0,z:-1},functionalSettings:{behavior:'hostile',health:20,damage:0}}]}};
 const send=(action,extra={},requestId=action+'-'+now)=>runtime.command('custom',map,identity,{action,requestId,...extra});
 await send('join');let state=await send('fire',{tool:'laser',direction:[0,0,-1]});
 const loot=Object.values(state.actors).find(a=>a.loot&&!a.loot.currency);assert.ok(loot,'defeated enemy drops care supply');
 await assert.rejects(send('collect',{entityId:'missing'},'bad'),{statusCode:409});
 state=await send('collect',{entityId:loot.id},'collect-once');assert.equal(state.actors[loot.id].active,false);
 await send('collect',{entityId:loot.id},'collect-once');
 await assert.rejects(send('collect',{entityId:loot.id},'collect-twice'),{statusCode:409});
 let backpack=await db.get(wallet);assert.equal(backpack.items.length,2);assert.equal(backpack.tokens.MZK,0);assert.ok(backpack.items.some(i=>i.id==='old-collectible'));
 const owned=backpack.items.find(i=>i.type==='rpg-consumable');
 assert.equal((await db.rpgState(wallet)).items[0].id,owned.id);
 await db.put('bob',{items:[],tokens:{MZK:0}});
 assert.equal((await db.grantRpgLoot('bob',loot.loot.catalogId,'loot:'+loot.loot.token)).claimedByOther,true);
 assert.equal((await db.rpgState('bob')).items.length,0);
 await db.rpgAction(wallet,'use',owned.id,'use-once');await db.rpgAction(wallet,'use',owned.id,'use-once');
 await assert.rejects(db.rpgAction(wallet,'use',owned.id,'use-twice'));
 backpack=await new UserJsonDatabase(db.file).get(wallet);assert.equal(backpack.items.length,1);assert.equal(backpack.memory.ioncoreRpg.stats.health,55);
 await db.grantRpgLoot(wallet,loot.loot.catalogId,'loot:'+loot.loot.token);assert.equal((await db.get(wallet)).items.length,1,'replayed grant after consumption cannot recreate item');
});

test('slow telemetry storage does not hold the movement command queue',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'rpg-telemetry-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>100000,telemetry:()=>new Promise(()=>{})});
 const identity={accountId:'alice',walletId:'alice',username:'Alice'};
 const result=await Promise.race([runtime.command('map',{id:'map',builderScene:{}},identity,{action:'join',requestId:'join'}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Telemetry blocked movement')),1000);timer.unref();})]);
 assert.equal(result.selfId,'account:alice');
});

test('automatic pickups cannot stall movement when storage or backpack is unavailable',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'loot-retry-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new SharedRoomStore(join(dir,'rooms.json'));let calls=0;
 const runtime=new AuthoritativeRooms({store,now:()=>100000,collectLoot:async()=>{calls++;throw Error('Backpack is full.');}});
 const identity={accountId:'alice',walletId:'alice',username:'Alice'},map={id:'map',builderScene:{},spawn:{x:0,y:0,z:0}};
 await runtime.command('map',map,identity,{action:'join',requestId:'join'});
 await store.update('map',room=>dropRpgLoot(room.simulation,{position:{x:0,y:0,z:0}},100000));
 for(let i=0;i<3;i++){const state=await runtime.command('map',map,identity,{action:'input',requestId:'input-'+i,input:{side:1}});assert.equal(state.players['account:alice'].health,100);}
 assert.equal(calls,1,'backpack failures are throttled while inputs continue');
});
