import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fishingCommand,stepFishing,fishingView,playerFishingView,fishingLocked,grantFishingReward,fishingAccountState} from '../server-fishing.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {neonMarina} from '../neon-marina.mjs';

function fixture(){
 const marina=neonMarina(),environment={id:'fishing-test',name:'Harbor',proceduralLand:true,spawn:{x:124,y:0,z:30},builderScene:{layout:'community-park',mapSize:256,layoutMeta:{harbor:marina.harbor,locations:marina.locations},objects:marina.objects}};
 const boat={id:'boat',modelId:'harbor-fishing-boat',position:{x:145,y:0,z:-38},rotation:{x:0,y:0,z:0},active:true,holderId:'account:angler',boating:{anchor:true,speed:0}},player={actorId:'account:angler',username:'Angler',position:{x:145,y:.35,z:-38},vehicleId:'boat',health:100,grounded:true,lastSeen:100000,yaw:0};
 const sim={players:{[player.actorId]:player},actors:{boat},events:[]};
 let now=100000;const advance=ms=>{now+=ms;player.lastSeen=now;stepFishing(sim,environment,now);};
 const send=(operation,extra={})=>fishingCommand(sim,player,environment,{operation,sessionId:player.fishing?.session?.id,...extra},now,{integer:(min,max)=>max===undefined?0:min});
 return {sim,player,boat,environment,send,advance,get now(){return now;}};
}

function land(f){
 f.send('cast');const session=f.player.fishing.session;f.advance(session.biteAt-f.now);f.send('hook');
 for(let i=0;i<170&&session.status==='reeling';i++){f.send('reel',{holding:session.tension<.65});f.advance(450);}
 assert.equal(session.status,'caught','responsive reel/release pulses must be able to land a fish');return session;
}

test('server owns bite, fight, catch and gear validation; both boat sides and real pier work',()=>{
 const f=fixture();assert.throws(()=>f.send('cast',{rodId:'fishing-pro-rod'}),/Unlock/);
 let session=land(f);assert.ok(session.fish.weightKg>0);assert.equal(fishingLocked(f.player),true);
 const settlement=f.send('keep').settlement;assert.equal(settlement.fish.catchId,session.fish.catchId);assert.equal(settlement.disposition,'keep');
 f.send('cancel');assert.equal(fishingLocked(f.player),false);assert.deepEqual(f.player.position,{x:145,y:.35,z:-38});
 f.send('cast',{side:'starboard'});assert.ok(f.player.position.x>f.boat.position.x);assert.equal(playerFishingView(f.sim,f.player).session.fish,undefined,'a client cannot inspect the rolled fish before landing');
 f.send('cancel');f.player.vehicleId=null;f.boat.holderId=null;f.player.position={x:143.2,y:.2,z:-32.4};f.player.grounded=true;
 const pier=f.send('cast');assert.match(pier.message,/Line cast/);assert.equal(f.player.fishing.session.boatId,null);
});

test('hook timing and reel leases reject preplays, expire holds, and cancel stale/moved/dead fishers',()=>{
 const f=fixture();f.send('cast');assert.throws(()=>f.send('hook'),/bite indicator/);
 f.advance(f.player.fishing.session.biteAt-f.now);f.send('hook');f.send('reel',{holding:true});f.advance(1500);
 const session=f.player.fishing.session,progress=session.progress;assert.equal(session.reeling,false);f.advance(1500);assert.ok(session.progress<=progress,'a lost pointer-up cannot keep reeling indefinitely');
 f.player.health=0;f.advance(50);assert.equal(session.status,'cancelled');
 const g=fixture();g.send('cast');g.player.lastSeen=g.now-16000;stepFishing(g.sim,g.environment,g.now);assert.equal(g.player.fishing.session.status,'cancelled');
 const h=fixture();h.send('cast');h.player.position.x+=2;h.advance(50);assert.equal(h.player.fishing.session.status,'cancelled');
 const j=fixture();j.send('cast');j.advance(j.player.fishing.session.biteEndsAt-j.now+1);assert.equal(j.player.fishing.session.status,'escaped');
});

test('owned reel/pro rod/net affect the fight and lure changes bite timing',()=>{
 const basic=fixture(),upgraded=fixture();
 upgraded.player.fishing={gear:['fishing-rod','fishing-bait','fishing-pro-rod','fishing-reel','fishing-net','fishing-lure'],creel:[]};
 basic.send('cast');upgraded.send('cast',{rodId:'fishing-pro-rod',baitId:'fishing-lure'});
 assert.ok(upgraded.player.fishing.session.biteAt<basic.player.fishing.session.biteAt);
 for(const f of [basic,upgraded]){f.advance(f.player.fishing.session.biteAt-f.now);f.send('hook');f.player.fishing.session.progress=.8;f.send('reel',{holding:true});f.advance(500);}
 assert.ok(upgraded.player.fishing.session.progress>basic.player.fishing.session.progress);assert.ok(upgraded.player.fishing.session.tension<basic.player.fishing.session.tension);
});

test('server Fishing Cup shares AI/human standings, rejects early claims and retains old claims after rotation',()=>{
 const f=fixture();f.send('join-tournament');const first=fishingView(f.sim).tournament;assert.equal(first.leaderboard.filter(entry=>entry.ai).length,2);
 assert.throws(()=>f.send('claim-tournament'),/finish/);f.advance(first.startsAt-f.now);land(f);
 const entry=fishingView(f.sim).tournament.leaderboard.find(row=>row.actorId===f.player.actorId);assert.equal(entry.catches,1);assert.ok(entry.score>0);
 f.advance(first.endsAt-f.now);const result=f.send('claim-tournament');assert.equal(result.settlement.type,'tournament');assert.ok(result.settlement.amountMzk>0);
 f.advance(60001);assert.notEqual(fishingView(f.sim).tournament.id,first.id);assert.equal(fishingView(f.sim).recentTournaments[0].id,first.id);
 assert.equal(f.send('claim-tournament',{tournamentId:first.id}).settlement.tournamentId,first.id);
});

async function accountFixture(t){
 const directory=await mkdtemp(join(tmpdir(),'fishing-server-'));t.after(()=>rm(directory,{recursive:true,force:true}));const database=new UserJsonDatabase(join(directory,'users.json')),wallet='account:angler';
 await database.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:0},items:[],memory:{},revision:0};data.users['account:other']={walletId:'account:other',tokens:{MZK:0},items:[],memory:{},revision:0};return {};});
 return {directory,database,wallet};
}
const catchResult=(id=randomUUID(),disposition='keep')=>({type:'catch',disposition,fish:{id:'snapper',name:'Coral Snapper',rarity:'uncommon',weightKg:5,valueMzk:70,catchId:id},startedAt:100000,landedAt:120000,zoneId:'marina-fishing',environmentId:'fishing-test'});

test('durable catches, sales and tournament claims settle once and survive reload; capped sales retain unpaid fish',async t=>{
 const f=await accountFixture(t),now=200000,first=catchResult();
 const kept=await grantFishingReward(f.database,f.wallet,first,{now}),replay=await grantFishingReward(f.database,f.wallet,first,{now});assert.equal(kept.id,replay.id);assert.equal(kept.creel.length,1);
 await assert.rejects(grantFishingReward(f.database,'account:other',first,{now}),/another angler/);
 const fishIds=[first.fish.catchId];for(let i=0;i<4;i++){const result=catchResult();fishIds.push(result.fish.catchId);await grantFishingReward(f.database,f.wallet,result,{now});}
 const sale={type:'sale',saleId:randomUUID(),catchIds:fishIds},receipt=await grantFishingReward(f.database,f.wallet,sale,{now});assert.equal(receipt.amountMzk,280);assert.equal(receipt.creel.length,1,'fish that exceed today’s payout allowance are retained');
 assert.equal((await grantFishingReward(f.database,f.wallet,sale,{now})).id,receipt.id);
 await assert.rejects(grantFishingReward(f.database,f.wallet,{type:'sale',saleId:randomUUID(),catchIds:receipt.creel.map(fish=>fish.catchId)},{now}),/stay in the creel/);
 const reloaded=await fishingAccountState(new UserJsonDatabase(f.database.file),f.wallet);assert.equal(reloaded.creel.length,1);assert.equal(reloaded.stats.catches,5);assert.equal(reloaded.stats.totalEarnedMzk,280);assert.ok(reloaded.gear.includes('fishing-rod'));
 const tournament={type:'tournament',tournamentId:randomUUID(),rank:1,score:500,catches:1,weightKg:5,amountMzk:60,endsAt:180000};const prize=await grantFishingReward(f.database,f.wallet,tournament,{now});assert.equal(prize.amountMzk,20);assert.equal((await grantFishingReward(f.database,f.wallet,tournament,{now})).id,prize.id);
 assert.throws(()=>grantFishingReward(f.database,f.wallet,{...catchResult(),fish:{...first.fish,catchId:randomUUID(),valueMzk:9999}},{now}),/Invalid authoritative catch/);
});

test('authoritative room holds boat-side stance, blocks helm/combat, settles/reloads catches, and releases on map/world travel',async t=>{
 const account=await accountFixture(t),f=fixture();let now=100000,n=0;
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(account.directory,'rooms.json')),now:()=>now,fishingState:actor=>fishingAccountState(account.database,actor.walletId),fishingReward:(actor,result)=>grantFishingReward(account.database,actor.walletId,result,{now})}),identity={accountId:'angler',username:'Angler',walletId:account.wallet},boat=f.environment.builderScene.objects.find(object=>object.id.endsWith('angler-boat'));
 const send=(action,fields={},at)=>{now=at??now+100;return runtime.command(f.environment.id,f.environment,identity,{action,requestId:'fish-'+ ++n,...fields});};
 let state=await send('join'),selfId=state.selfId;await send('map-access',{entityId:boat.id});await send('input',{input:{anchor:true,throttle:0}});state=await send('input',{input:{}},now+250);
 assert.equal(state.players[selfId].fishing.availability.canCast,true);assert.equal(state.actors[boat.id].maxHealth,300);
 state=await send('fishing',{operation:'cast',side:'port'});let session=state.players[selfId].fishing.session;const position=state.players[selfId].position;
 await assert.rejects(send('fire',{tool:'laser',direction:[0,0,-1]}),/Pack away/);
 state=await send('input',{input:{forward:1,side:1,anchor:false,throttle:1}},now+250);assert.deepEqual(state.players[selfId].position,position);assert.equal(state.actors[boat.id].boating.anchor,true);assert.equal(state.players[selfId].fishing.session.status,'waiting');
 state=await send('fishing',{operation:'hook',sessionId:session.id},session.biteAt);session=state.players[selfId].fishing.session;
 for(let i=0;i<175&&session.status==='reeling';i++){state=await send('fishing',{operation:'reel',sessionId:session.id,holding:session.tension<.65},now+450);session=state.players[selfId].fishing.session;}
 assert.equal(session.status,'caught');state=await send('fishing',{operation:'keep',sessionId:session.id});assert.equal(state.players[selfId].fishing.creel.length,1);assert.equal(state.players[selfId].fishing.session.status,'kept');assert.equal(state.result.fishingReceipt.amountMzk,0);
 state=await send('join');assert.equal(state.players[selfId].fishing.creel.length,1);
 state=await send('fishing',{operation:'cast',side:'starboard'});state=await send('map-access',{locationId:'captain-mara'});assert.equal(state.players[selfId].fishing.session.status,'cancelled');assert.equal(state.players[selfId].vehicleId,null);
 state=await send('fishing',{operation:'talk',guideId:'captain-mara'});assert.match(state.result.message,/Captain Mara/);
 state=await send('fishing',{operation:'sell'});assert.ok(state.result.fishingReceipt.amountMzk>0);assert.equal(state.players[selfId].fishing.creel.length,0);
 await assert.rejects(send('fire',{tool:'fishing-rod',direction:[0,0,-1]}),/Fishing panel/);
 await send('map-access',{entityId:boat.id});await send('input',{input:{anchor:true,throttle:0}});state=await send('fishing',{operation:'cast'},now+250);
 const other={id:'another-world',name:'Other world',spawn:{x:0,y:0,z:0}};await runtime.command(other.id,other,identity,{action:'join',requestId:'leave-for-other-world'});const old=await runtime.store.get(f.environment.id);assert.equal(old.simulation.players[selfId].fishing.session.status,'cancelled');assert.equal(old.simulation.actors[boat.id].holderId,null);
});
