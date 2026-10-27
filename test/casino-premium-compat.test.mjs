import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {CasinoService} from '../server-casino.mjs';
import {casinoWorld} from '../casino-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {saveResidentContinuity} from '../server-resident-progress.mjs';

async function fixture(t,balance=1000){
 const directory=await mkdtemp(join(tmpdir(),'casino-premium-compat-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'users.json'),db=new UserJsonDatabase(file),wallet='account:legacy-casino',owner='legacy-casino';
 const memory={profile:{displayName:'Returning guest'},builderDraft:{mapId:'saved-home',objects:[{id:'chair'}]},ioncoreRpg:{stats:{energy:67,hydration:81},history:[{reason:'saved care'}]}};
 const items=[{id:'saved-custom-item',type:'custom-item',name:'Saved sculpture'}];
 await db.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:balance},items,memory,revision:5};return {};});
 return {directory,file,db,wallet,owner,memory,items,casino:new CasinoService(db,{integer:()=>0})};
}
const remaining=used=>Array.from({length:52},(_,i)=>i).filter(card=>!used.includes(card));

test('legacy saved poker and blackjack hands finish after the premium upgrade without station or total-stake metadata',async t=>{
 const f=await fixture(t,970),pokerHand=[8,9,10,11,12],blackjackHand=[8,5],dealerHand=[21,18];
 const poker={id:'legacy-draw-hand',game:'poker',phase:'playing',revision:1,betMzk:10,payoutMzk:0,createdAt:'2026-10-23T00:00:00.000Z',hand:pokerHand,deck:remaining(pokerHand)};
 const blackjack={id:'legacy-blackjack-hand',game:'blackjack',phase:'playing',revision:1,betMzk:20,payoutMzk:0,createdAt:'2026-10-23T00:00:00.000Z',hand:blackjackHand,dealerHand,deck:remaining([...blackjackHand,...dealerHand])};
 await f.db.transaction(data=>{data.casino={accounts:{[f.owner]:{rounds:{poker,blackjack},history:[]}}};return {};});
 const service=new CasinoService(new UserJsonDatabase(f.file),{integer:()=>0}),loaded=await service.state(f.wallet,f.owner);
 assert.equal(loaded.balance,970);assert.equal(loaded.activeRounds.poker.id,poker.id);assert.deepEqual(loaded.activeRounds.blackjack.dealerHand,[21,null]);assert.equal(loaded.activeRounds.blackjack.dealerTotal,null);assert.equal(JSON.stringify(loaded).includes('"deck"'),false);
 const stand={game:'blackjack',operation:'stand',roundId:blackjack.id,revision:1,requestId:'resume-old-blackjack'};
 const stood=await service.play(f.wallet,f.owner,stand);assert.equal(stood.round.outcome,'push');assert.equal(stood.round.payoutMzk,20);assert.equal(stood.receipt.debitedMzk,0);assert.equal(stood.receipt.netMzk,0);assert.equal(stood.balance,990);
 assert.deepEqual(await service.play(f.wallet,f.owner,stand),stood);
 const draw={game:'poker',operation:'draw',roundId:poker.id,revision:1,holds:[0,1,2,3,4],requestId:'resume-old-draw'};
 const drawn=await service.play(f.wallet,f.owner,draw);assert.equal(drawn.round.outcome,'royal flush');assert.equal(drawn.round.payoutMzk,2500);assert.equal(drawn.receipt.debitedMzk,0);assert.equal(drawn.receipt.netMzk,2490);assert.equal(drawn.balance,3490);
 assert.deepEqual(await service.play(f.wallet,f.owner,draw),drawn);
 const saved=await new UserJsonDatabase(f.file).get(f.wallet);assert.deepEqual(saved.memory,f.memory);assert.deepEqual(saved.items,f.items);
 const final=await service.state(f.wallet,f.owner);assert.deepEqual(final.activeRounds,{});assert.equal(final.history.length,2);assert.equal(final.balance,3490);
 const durable=await new UserJsonDatabase(f.file).read();assert.equal(durable.transactions.filter(row=>row.type==='CASINO_PAYOUT').length,2);
});

test('pre-upgrade eight-field command receipts replay exactly once without changing canonical balance or unrelated saves',async t=>{
 const f=await fixture(t,1875),input={game:'roulette',operation:'bet',betMzk:25,selection:0,requestId:'legacy-settled-spin'};
 const response={round:{id:'old-spin',game:'roulette',phase:'complete',revision:1,betMzk:25,payoutMzk:900,number:0,color:'green',selection:0,outcome:'win'},balance:1875,receipt:{betMzk:25,debitedMzk:25,payoutMzk:900,netMzk:875},message:'European roulette: win. Returned 900 MZK.'};
 const signature=JSON.stringify([input.game,input.operation,input.betMzk,input.selection,input.roundId,input.revision,input.holds,input.itemId]);
 await f.db.transaction(data=>{data.transactions.push({id:'legacy-command',type:'CASINO_COMMAND',casinoOwnerId:f.owner,walletId:f.wallet,requestId:input.requestId,signature,response,amountMzk:0});data.casino={accounts:{[f.owner]:{rounds:{},history:[response.round]}}};return {};});
 const before=await f.db.read(),actual=await f.casino.play(f.wallet,f.owner,input);
 assert.deepEqual(actual,response,'a lost pre-upgrade response retains its original public shape');assert.deepEqual(await f.db.read(),before,'a replay performs no balance, ledger, item or save mutation');
 await assert.rejects(f.casino.play(f.wallet,f.owner,{...input,selection:'black'}),/another casino action/);assert.equal((await f.db.get(f.wallet)).tokens.MZK,1875);
});

test('casino catalogue migration preserves saved room objects, player quests, social progress and the 22-person cast',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'casino-premium-room-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'rooms.json'),store=new SharedRoomStore(file),world=casinoWorld();let now=100000;
 const identity={accountId:'returning-guest',username:'Returning guest'},actorId='account:'+identity.accountId;
 const original=new AuthoritativeRooms({store,now:()=>now});await original.command(world.id,world,identity,{action:'join',requestId:'legacy-join'});
 let rememberedId;
 await store.update(world.id,saved=>{
  const sim=saved.simulation,player=sim.players[actorId];
  sim.environmentUpdatedAt='pre-premium-casino';rememberedId=Object.values(sim.actors).find(npc=>npc.resident?.duty==='dealer').id;
  const info=sim.actors[rememberedId].resident;info.memory.push({kind:'saved-acquaintance',subjectId:actorId,text:'Remembered the returning guest',at:now});info.skills.poker=97;info.relationships.push({id:actorId,affinity:17,lastAt:now});
  player.quests={savedQuest:{status:'completed',rewardClaimed:true}};player.casinoTask={id:'saved-casino-favor',status:'completed',title:'A completed favor'};player.residentProgress={reputation:31,skills:{rangeSafety:24,social:14},completedTasks:2,cosmetics:['Saved guide pin'],completedKeys:['saved-room|host|1']};
  saveResidentContinuity(player,world.id,now,actorId);saved.objects['saved-building']={id:'saved-building',deleted:true,ownerId:actorId,revision:2};
 });
 now+=1000;
 const restored=new AuthoritativeRooms({store:new SharedRoomStore(file),now:()=>now}),snapshot=await restored.snapshot(world.id,world),cast=Object.values(snapshot.actors).filter(npc=>npc.resident?.casino);
 assert.equal(cast.length,22);assert.equal(cast.filter(npc=>npc.resident.duty==='guard').length,2);assert.equal(new Set(cast.map(npc=>npc.id)).size,22);
 const saved=await restored.store.get(world.id),player=saved.simulation.players[actorId],remembered=saved.simulation.actors[rememberedId].resident;
 assert.deepEqual(player.quests,{savedQuest:{status:'completed',rewardClaimed:true}});assert.equal(player.casinoTask.id,'saved-casino-favor');assert.equal(player.casinoTask.status,'completed');assert.equal(player.residentProgress.skills.rangeSafety,24);assert.equal(player.residentContinuity.progress.reputation,31);
 assert.ok(remembered.memory.some(memory=>memory.kind==='saved-acquaintance'));assert.ok(remembered.relationships.some(relation=>relation.id===actorId&&relation.affinity>=17));assert.ok(remembered.skills.poker>=97);assert.equal(saved.objects['saved-building'].ownerId,actorId);
});
