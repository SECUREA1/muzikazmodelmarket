import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {residentCommand} from '../server-world-residents.mjs';
import {casinoDialogue} from '../server-casino-dialogue.mjs';
import {casinoTaskCommand,stepCasinoTasks,casinoTaskView,casinoProgressView,recordCasinoPlayerGame} from '../server-casino-tasks.mjs';
import {casinoWorld} from '../casino-world.mjs';

function fixture(){
 const make=(id,name,duty,x,z,extra={})=>({id:'casino-resident-'+id,active:true,position:{x,y:.02,z},rotation:{y:0},resident:{id:'casino-resident-'+id,casino:true,name,duty,role:duty==='guard'?'Security guard':duty==='guest'?'Casino guest':duty==='host'?'Welcome host':duty==='dealer'?'Poker dealer':duty[0].toUpperCase()+duty.slice(1),index:0,home:{x,y:.02,z},task:'welcoming the floor',skills:{hospitality:65,social:70,poker:80},memory:[],...extra}});
 const host=make('welcome','Amira Lane','host',-5,31.5),cashier=make('cashier','Sofia Chen','cashier',22,31),vendor=make('vendor','Theo Park','vendor',-22,31),dealer=make('dealer-poker-1','Nora Hart','dealer',-20,-11,{game:'poker'}),guest=make('guest-1','Avery Stone','guest',-20,-4.3,{game:'poker'}),guard=make('guard-entry','Marcus Vale','guard',-10,24);
 const sim={actors:Object.fromEntries([host,cashier,vendor,dealer,guest,guard].map(actor=>[actor.id,actor])),players:{},events:[]},player=sim.players.alice={actorId:'alice',username:'Alice',health:100,grounded:true,lastSeen:100000,position:{...host.position},movementRevision:0,score:0,tokens:{MZK:1234}};
 let now=100000;
 return {sim,player,host,cashier,vendor,dealer,guest,guard,get now(){return now;},advance(ms=1100){now+=ms;player.lastSeen=now;return now;},say(npc,choice,text){now+=1100;player.lastSeen=now;return residentCommand(sim,player,casinoWorld(),{entityId:npc.id,choice,text},now);},walkTo(checkpoint){const target=checkpoint.actorId?sim.actors[checkpoint.actorId].position:checkpoint;let span;while((span=Math.hypot(target.x-player.position.x,target.z-player.position.z))>.02){const amount=Math.min(.4,span);player.position={x:player.position.x+(target.x-player.position.x)/span*amount,y:.02,z:player.position.z+(target.z-player.position.z)/span*amount};now+=100;player.lastSeen=now;stepCasinoTasks(sim,now);}for(let i=0;i<15;i++){now+=100;player.lastSeen=now;stepCasinoTasks(sim,now);}}};
}

test('casino conversations answer actual questions, explain games and remember each player separately',()=>{
 const f=fixture(),{sim,player,host,dealer,cashier}=f;
 f.say(host,'question','I like poker');assert.match(player.npcConversation.conversation.at(-1).text,/remember.*poker|poker.*next time/i);
 f.say(host,'question','What do you remember about me?');assert.match(player.npcConversation.conversation.at(-1).text,/enjoy poker/);
 f.say(host,'casino-rules','What do you remember about me?');assert.match(player.npcConversation.conversation.at(-1).text,/enjoy poker/);
 assert.equal(player.npcConversation.casino.relationship.rememberedGame,'poker');
 player.position={...dealer.position};f.say(dealer,'question','How do I hold cards in poker?');assert.match(player.npcConversation.conversation.at(-1).text,/Hold any cards.*draw once/);
 player.position={...cashier.position};f.say(cashier,'question');assert.match(player.npcConversation.conversation.at(-1).text,/MZK wallet/);
 const bob={actorId:'bob',username:'Bob',casinoSocial:{}};const response=casinoDialogue(sim,bob,host,'question','Do you remember me?',f.advance());assert.doesNotMatch(response.text,/enjoy poker/);assert.equal(bob.casinoSocial[host.id].preferences.game,undefined);
 assert.equal(player.tokens.MZK,1234);assert.equal(player.score,0);
});

test('role skills, personality, live plans and observations produce contextual follow-ups',()=>{
 const f=fixture(),{sim,player,host,guard}=f;
 host.resident.task='helping guests find the poker salon';host.resident.goal={kind:'meet-guest',targetId:f.guest.id};host.resident.memory=[{kind:'game',text:'Nora just helped a new guest understand the draw',at:99000}];
 f.say(host,'casino-activity');const activity=player.npcConversation.conversation.at(-1).text;assert.match(activity,/poker salon|meet guest/);assert.match(activity,/Avery|Nora/);
 f.say(host,'casino-personality');assert.match(player.npcConversation.conversation.at(-1).text,/Amira|host/i);
 f.say(host,'casino-skills');assert.match(player.npcConversation.conversation.at(-1).text,/skills|XP|practice/i);
 player.position={...guard.position};f.say(guard,'question','Where is the vault?');assert.match(player.npcConversation.conversation.at(-1).text,/locked|public corridor/);
 f.say(guard,'joke');const first=player.npcConversation.conversation.at(-1).text;f.say(guard,'joke');assert.notEqual(player.npcConversation.conversation.at(-1).text,first);
 assert.ok(player.casinoSocial[guard.id].turns.length<=6);assert.equal(player.residentTask,undefined);
});

test('private social memory is bounded and previous generic casino reward choices remain unavailable',()=>{
 const f=fixture();
 for(let i=0;i<35;i++){const npc={...f.host,id:'new-contact-'+i,resident:{...f.host.resident,name:'Contact '+i}};casinoDialogue(f.sim,f.player,npc,'day','hello',f.advance());}
 assert.ok(Object.keys(f.player.casinoSocial).length<=24);
 for(let i=0;i<12;i++)casinoDialogue(f.sim,f.player,f.host,'day','hello',f.advance());
 assert.equal(f.player.casinoSocial[f.host.id].turns.length,6);
 assert.throws(()=>f.say(f.host,'accept'),/daily reward objectives are unavailable/);
 f.say(f.host,'casino-task');assert.equal(f.player.casinoTask,undefined);assert.ok(f.player.npcConversation.casino.taskOffer.title);
 assert.ok(f.player.npcConversation.dialogueChoices.some(choice=>choice.id==='casino-accept'));assert.ok(!f.player.npcConversation.dialogueChoices.some(choice=>choice.id==='accept'));
});

test('walking staff favors require actual route, stopped checkpoints and reward reputation once without MZK',()=>{
 const f=fixture();f.say(f.host,'casino-task');f.say(f.host,'talk','I can help');
 const task=f.player.casinoTask;assert.equal(task.status,'active');assert.equal(task.kind,'orientation');
 assert.throws(()=>f.say(f.host,'casino-confirm'),/marker|public route/);
 while(task.status==='active'){
  f.walkTo(task.checkpoints[task.index]);f.say(f.host,'casino-confirm');
 }
 assert.equal(task.status,'completed');assert.equal(f.player.casinoProgress.reputation,8);assert.equal(f.player.casinoProgress.skills.hospitality,12);assert.deepEqual(f.player.casinoProgress.cosmetics,['Floor guide badge']);
 assert.equal(f.player.tokens.MZK,1234);assert.equal(f.player.score,0);
 assert.throws(()=>f.say(f.host,'casino-confirm'),/already complete/);
 assert.throws(()=>f.say(f.host,'casino-accept'),/already helped/);
 assert.equal(casinoTaskView(f.player)._motion,undefined);assert.equal(casinoProgressView(f.player).completedTasks,1);
});

test('map access epochs, discontinuous positions, vehicles and repeated clicks cannot complete favors',()=>{
 const f=fixture();f.say(f.host,'casino-accept');const task=f.player.casinoTask;
 f.player.movementRevision++;stepCasinoTasks(f.sim,f.advance());assert.equal(task.status,'cancelled');
 f.say(f.host,'casino-accept');f.player.position={x:0,y:.02,z:-17};stepCasinoTasks(f.sim,f.advance(100));assert.equal(f.player.casinoTask.status,'cancelled');
 f.player.position={...f.host.position};f.say(f.host,'casino-accept');f.player.vehicleId='fake-car';
 for(let i=0;i<20;i++)stepCasinoTasks(f.sim,f.advance(200));assert.equal(f.player.casinoTask.walkedMeters,0);f.player.vehicleId=null;
 for(let i=0;i<3;i++)assert.throws(()=>f.say(f.host,'casino-confirm'),/marker|public route/);
 assert.equal(casinoProgressView(f.player).reputation,0);assert.equal(f.player.tokens.MZK,1234);
 f.say(f.host,'casino-cancel');assert.equal(f.player.casinoTask.status,'cancelled');
 f.say(f.host,'casino-accept');f.player.replacedByRoom='public-commons';stepCasinoTasks(f.sim,f.advance());assert.equal(f.player.casinoTask.status,'cancelled');assert.match(f.player.casinoTask.message,/World travel/);
});

test('service delivery requires speaking to the real guest before reporting the handoff',()=>{
 const f=fixture();f.player.position={...f.vendor.position};f.say(f.vendor,'casino-accept');const task=f.player.casinoTask;
 assert.equal(task.kind,'delivery');f.walkTo(task.checkpoints[0]);f.say(f.vendor,'casino-confirm');
 f.walkTo(task.checkpoints[1]);assert.throws(()=>f.say(f.vendor,'casino-confirm'),/Speak with the marked guest/);
 const guest=f.sim.actors[task.checkpoints[1].actorId];f.say(guest,'question','How is your evening?');f.say(f.vendor,'casino-confirm');
 f.walkTo(task.checkpoints[2]);f.say(f.vendor,'casino-confirm');assert.equal(task.status,'completed');assert.equal(f.player.casinoProgress.skills.hospitality,16);assert.equal(f.player.tokens.MZK,1234);
});

test('only completed canonical rounds grant familiarity and old replays stay rejected after bounded dedup eviction',()=>{
 const f=fixture(),round={id:'actual-round',game:'poker',phase:'complete',outcome:'two pair',completedAt:new Date(100000).toISOString()};
 assert.equal(recordCasinoPlayerGame(f.sim,f.player,{...round,phase:'playing'},100000),false);
 assert.equal(recordCasinoPlayerGame(f.sim,f.player,{...round,completedAt:undefined},100000),false);
 assert.equal(recordCasinoPlayerGame(f.sim,f.player,round,100000),true);assert.equal(recordCasinoPlayerGame(f.sim,f.player,round,100000),false);
 for(let i=1;i<=80;i++)assert.equal(recordCasinoPlayerGame(f.sim,f.player,{...round,id:'round-'+i,completedAt:new Date(100000+i*1000).toISOString()},100000+i*1000),true);
 const xp=f.player.casinoProgress.skills.poker;assert.equal(recordCasinoPlayerGame(f.sim,f.player,round,200000),false);assert.equal(f.player.casinoProgress.skills.poker,xp);
 assert.equal(f.player.casinoGameRounds.length,64);assert.equal(f.player.casinoGameHistory.length,8);assert.equal(f.player.casinoProgress.reputation,0);assert.equal(f.player.tokens.MZK,1234);
});

test('room bridge persists completed game practice and recovers tasks and private conversations',async t=>{
 const {AuthoritativeRooms}=await import('../authoritative-room.mjs'),{SharedRoomStore}=await import('../shared-room-store.mjs');
 const dir=await mkdtemp(join(tmpdir(),'casino-dialogue-room-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000;
 const store=new SharedRoomStore(join(dir,'rooms.json')),room=new AuthoritativeRooms({store,now:()=>now}),world=casinoWorld(),identity={accountId:'alice',username:'Alice'},send=(action,fields={})=>{now+=1300;return room.command(world.id,world,identity,{action,requestId:'casino-dialogue-'+now,...fields});};
 let view=await send('join');const host=view.actors['casino-resident-welcome'];
 await send('map-access',{position:{x:host.position.x,z:host.position.z+2}});
 await send('npc-social',{entityId:host.id,choice:'question',text:'I like poker'});
 view=await send('npc-social',{entityId:host.id,choice:'casino-accept'});assert.equal(view.players['account:alice'].casinoTask.status,'active');
 const round={id:'bridge-round',game:'poker',phase:'complete',outcome:'two pair',completedAt:new Date(now).toISOString(),stationId:'casino-poker-1'};
 assert.equal(await room.casinoActivity('account:alice',round),true);assert.equal(await room.casinoActivity('account:alice',round),false);
 const loaded=new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>now});const saved=await loaded.snapshot(world.id,world);
 assert.equal(saved.players['account:alice'].casinoProgress.skills.poker,2);assert.equal(saved.players['account:alice'].casinoTask.status,'active');
 const privatePlayer=await loaded.player(world.id,'account:alice');assert.equal(privatePlayer.casinoSocial[host.id].preferences.game,'poker');
 assert.equal(saved.players['account:alice'].casinoTask._motion,undefined);
});

test('leaving the casino cancels a favor even on a sub-tick round trip, while a same-room reconnect preserves it',async t=>{
 const {AuthoritativeRooms}=await import('../authoritative-room.mjs'),{SharedRoomStore}=await import('../shared-room-store.mjs');
 const dir=await mkdtemp(join(tmpdir(),'casino-favor-travel-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000,request=0;
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now}),world=casinoWorld(),identity={accountId:'alice',username:'Alice'},send=(environment,action,fields={})=>runtime.command(environment.id,environment,identity,{action,requestId:'casino-travel-'+ ++request,...fields});
 const away={id:'public-commons',name:'Commons',publicDestination:true,proceduralLand:true,spawn:{x:0,y:.02,z:2},builderScene:{version:3,layout:'grand-floor',mapSize:80,objects:[],layoutMeta:{locations:[]}}};
 let view=await send(world,'join');const host=view.actors['casino-resident-welcome'];now+=1300;view=await send(world,'npc-social',{entityId:host.id,choice:'casino-accept'});assert.equal(view.players['account:alice'].casinoTask.status,'active');
 now++;view=await send(world,'join');assert.equal(view.players['account:alice'].casinoTask.status,'active','ordinary reconnect retains a walking favor');
 now++;await send(away,'join');now++;view=await send(world,'join');assert.equal(view.players['account:alice'].casinoTask.status,'cancelled');assert.match(view.players['account:alice'].casinoTask.message,/World travel/);
});
