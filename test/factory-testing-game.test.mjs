import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {GAME_ECONOMY,GAME_BUNDLES,economyBundleQuote} from '../game-economy.mjs';
import {PROVING_ID,COMPOUND_ID,PROVING_STATIONS,COMPOUND_STATIONS,PROVING_TARGETS,COMPOUND_GATE,testingStations,testingTargets,constrainCompoundPosition} from '../public/js/factory-test-config.js';
import {testingCommand,testingAccountState,stepFactoryTesting,factoryTestingView,publicTestingState,ownedTestingItem,hasCompoundClearance,assertCompoundAccess} from '../server-factory-testing.mjs';

async function fixture(t,environment={id:PROVING_ID}){
 const directory=await mkdtemp(join(tmpdir(),'factory-testing-'));t.after(()=>rm(directory,{recursive:true,force:true}));const database=new UserJsonDatabase(join(directory,'users.json')),wallet='account:range-tester';
 await database.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:10000},items:[{id:'crafted-missile',buildAssetId:'factory-training-missile'},{id:'crafted-rocket',buildAssetId:'factory-cargo-rocket'}],memory:{},revision:0};data.transactions.push({id:'craft-proof-one',type:'FACTORY_ITEM_CREATED',walletId:wallet,itemId:'crafted-missile',recipeId:'training-missile',createdAt:new Date(1).toISOString()},{id:'craft-proof-two',type:'FACTORY_ITEM_CREATED',walletId:wallet,itemId:'crafted-rocket',recipeId:'cargo-rocket',createdAt:new Date(2).toISOString()});return {};});
 let now=1000000,sequence=0;const player={actorId:wallet,username:'Range Tester',health:100,lastSeen:now,position:{...PROVING_STATIONS[0].position}},sim={players:{[wallet]:player},actors:{}};
 const f={database,wallet,player,sim,environment,send:(action,fields={})=>testingCommand(sim,player,f.environment,{action,requestId:'test-command-'+ ++sequence,...fields},now,{database,walletId:wallet}),move:kind=>{const station=testingStations(f.environment,{actors:sim.actors}).find(station=>station.kind===kind);assert.ok(station,kind+' station');player.position={...station.position};return station;},tick:ms=>{now+=ms;player.lastSeen=now;stepFactoryTesting(sim,f.environment,now);},get now(){return now;}};
 f.launch=async(profileId='accuracy',extra={})=>{f.move('setup');const targets=testingTargets(f.environment,{actors:sim.actors}),itemId=profileId==='accuracy'?'crafted-missile':'crafted-rocket';await f.send('proving-setup',{itemId,profileId,targetId:targets.find(target=>target.profileId===profileId).id,...extra});const sessionId=player.testing.session.id,pad=f.move('pad');await f.send('proving-deploy',{sessionId,padId:pad.id});f.move('control');await f.send('proving-arm',{sessionId});return f.send('proving-launch',{sessionId,aim:{x:0,y:0}});};
 f.complete=async(profileId='accuracy')=>{await f.launch(profileId);f.tick(player.testing.session.endsAt-f.now);return f.send('proving-status');};return f;
}

test('crafted and purchased model proofs reject forged Backpack identity and preserve reusable inventory',async t=>{
 const f=await fixture(t),catalog=GAME_ECONOMY.find(item=>item.buildAssetId==='factory-training-missile');await f.database.economyAction(f.wallet,'buy',catalog.sku,'real-economy-buy');
 let data=await f.database.read();assert.equal(ownedTestingItem(data,f.wallet,'economy:'+catalog.sku).profileId,'accuracy');assert.equal(ownedTestingItem(data,f.wallet,'crafted-rocket').profileId,'cargo');
 await f.database.transaction(data=>{data.users[f.wallet].items.push({id:'forged',source:'missile-factory',buildAssetId:'factory-cargo-rocket',economySku:catalog.sku});data.users[f.wallet].memory.testing={clearance:{compound:true,deep:true}};return {};});data=await f.database.read();assert.equal(ownedTestingItem(data,f.wallet,'forged'),null);assert.equal(await hasCompoundClearance(f.database,f.wallet),false);
 await assert.rejects(f.send('proving-setup',{itemId:'forged',profileId:'cargo',targetId:'cargo-zone'}),/receipt-verified/);
 const before=(await f.database.get(f.wallet)).items.length;await f.complete('accuracy');await f.complete('accuracy');assert.equal((await f.database.get(f.wallet)).items.length,before);assert.equal(f.player.testing.progress.completedTests,2);assert.equal(f.player.testing.progress.skills.accuracy,2);assert.equal((await f.database.get(f.wallet)).tokens.MZK,10000-catalog.priceMzk);
});

test('economy bundle receipt grants proof while an edited SKU or missing owned id does not',async t=>{
 const f=await fixture(t),catalog=GAME_ECONOMY.find(item=>item.buildAssetId==='factory-cargo-rocket'),bundle=GAME_BUNDLES.find(bundle=>bundle.entries.some(entry=>entry.sku===catalog.sku));assert.ok(bundle);
 const quote=economyBundleQuote(await f.database.get(f.wallet),bundle);await f.database.buyEconomyBundle(f.wallet,bundle.id,quote.priceMzk,'range-bundle');assert.equal(ownedTestingItem(await f.database.read(),f.wallet,'economy:'+catalog.sku).buildAssetId,'factory-cargo-rocket');
 await f.database.transaction(data=>{const item=data.users[f.wallet].items.find(item=>item.id==='economy:'+catalog.sku);item.buildAssetId='untrusted';item.economySku='fake-sku';return {};});assert.equal(ownedTestingItem(await f.database.read(),f.wallet,'economy:'+catalog.sku).buildAssetId,'factory-cargo-rocket');
 await f.database.transaction(data=>{data.users[f.wallet].items=data.users[f.wallet].items.filter(item=>item.id!=='economy:'+catalog.sku);return {};});assert.equal(ownedTestingItem(await f.database.read(),f.wallet,'economy:'+catalog.sku),null);
});

test('test setup, deployment, arming and launch require correct map, controls, owned profile and free hands',async t=>{
 const f=await fixture(t);f.move('pad');await assert.rejects(f.send('proving-setup',{itemId:'crafted-missile',profileId:'accuracy',targetId:'target-alpha'}),/Walk to an active setup/);f.move('setup');
 await assert.rejects(f.send('proving-setup',{itemId:'crafted-missile',profileId:'cargo',targetId:'cargo-zone'}),/matching test profile/);await assert.rejects(f.send('proving-setup',{itemId:'crafted-missile',profileId:'accuracy',targetId:'cargo-zone'}),/matching practice target/);
 f.player.heldId='held';await assert.rejects(f.send('proving-setup',{itemId:'crafted-missile',profileId:'accuracy',targetId:'target-alpha'}),/hands free/);f.player.heldId=null;
 await f.send('proving-setup',{itemId:'crafted-missile',profileId:'accuracy',targetId:'target-alpha'});const sessionId=f.player.testing.session.id;
 await assert.rejects(f.send('proving-arm',{sessionId}),/Walk to an active control/);f.move('control');await assert.rejects(f.send('proving-launch',{sessionId}),/Arm the deployed test/);
 f.move('pad');f.sim.actors.existing={id:'existing',asset:{id:'crafted-missile'},active:true,health:100};await assert.rejects(f.send('proving-deploy',{sessionId,padId:'proving-pad'}),/Recall the deployed or held/);delete f.sim.actors.existing;
 await f.send('proving-deploy',{sessionId,padId:'proving-pad'});f.move('control');await f.send('proving-arm',{sessionId});await assert.rejects(f.send('proving-launch',{sessionId,aim:{x:9,y:0}}),/between -1 and 1/);
 await assert.rejects(testingCommand(f.sim,f.player,{id:'different',testing:{kind:'proving'}},{action:'proving-launch',sessionId,requestId:'wrong-map'},f.now,{database:f.database,walletId:f.wallet}),/Return to the map/);
});

test('shared pads and immutable item locks prevent simultaneous deployment; cancel releases a reservation',async t=>{
 const f=await fixture(t);await f.launch();const otherWallet='account:range-second';await f.database.transaction(data=>{data.users[otherWallet]={walletId:otherWallet,tokens:{MZK:1000},items:[{id:'second-missile'}],memory:{}};data.transactions.push({id:'second-proof',type:'FACTORY_ITEM_CREATED',walletId:otherWallet,itemId:'second-missile',recipeId:'training-missile',createdAt:new Date(3).toISOString()});return {};});
 const other={actorId:otherWallet,health:100,lastSeen:f.now,position:{...PROVING_STATIONS[0].position}},send=(action,fields={})=>testingCommand(f.sim,other,f.environment,{action,requestId:'other-'+action,...fields},f.now,{database:f.database,walletId:otherWallet});await send('proving-setup',{itemId:'second-missile',profileId:'accuracy',targetId:'target-alpha'});other.position={...PROVING_STATIONS.find(station=>station.kind==='pad').position};await assert.rejects(send('proving-deploy',{sessionId:other.testing.session.id,padId:'proving-pad'}),/reserved by another test/);
 f.move('control');await f.send('proving-cancel',{sessionId:f.player.testing.session.id});await send('proving-deploy',{sessionId:other.testing.session.id,padId:'proving-pad'});assert.equal(other.testing.session.status,'deployed');assert.equal(f.player.testing.progress.completedTests,0);
});

test('recall safely returns only owned display copies and held models before testing',async t=>{
 const f=await fixture(t);f.move('setup');const actor={id:'my-display',spawned:true,ownerId:f.player.actorId,active:true,health:100,asset:{id:'crafted-missile',buildAssetId:'factory-training-missile'},holderId:'account:other'};f.sim.actors[actor.id]=actor;
 f.sim.actors.sibling={id:'sibling',spawned:true,ownerId:f.player.actorId,active:true,health:100,asset:{id:'another-crafted-missile',buildAssetId:'factory-training-missile'}};
 await assert.rejects(f.send('proving-recall',{itemId:'crafted-missile'}),/Another player is holding/);actor.holderId=f.player.actorId;f.player.heldId=actor.id;
 const recalled=await f.send('proving-recall',{itemId:'crafted-missile'});assert.deepEqual(recalled.recalledActorIds,[actor.id]);assert.equal(f.sim.actors[actor.id],undefined);assert.equal(f.player.heldId,null);assert.equal((await f.database.get(f.wallet)).items.length,2);
 assert.ok(f.sim.actors.sibling,'a separate model of the same design remains on display');
 await f.launch();f.move('setup');await assert.rejects(f.send('proving-recall',{itemId:'crafted-missile'}),/Cancel or finish/);await f.send('proving-cancel',{sessionId:f.player.testing.session.id});await f.send('proving-recall',{itemId:'crafted-missile'});
});

test('independent purchased models sharing a catalog SKU do not block another owner or get recalled together',async t=>{
 const f=await fixture(t),catalog=GAME_ECONOMY.find(item=>item.buildAssetId==='factory-training-missile'),itemId='economy:'+catalog.sku,other='account:independent-tester';
 await f.database.economyAction(f.wallet,'buy',catalog.sku,'personal-model-purchase');
 await f.database.transaction(data=>{data.users[other]={walletId:other,tokens:{MZK:1000},items:[],memory:{},revision:0};return {};});
 await f.database.economyAction(other,'buy',catalog.sku,'independent-model-purchase');
 const foreign={id:'independent-display',spawned:true,ownerId:other,active:true,health:100,asset:{id:itemId,sku:catalog.sku,buildAssetId:catalog.buildAssetId}};
 const authored={id:'public-display',active:true,health:100,asset:{id:catalog.id,sku:catalog.sku,buildAssetId:catalog.buildAssetId}};
 f.sim.actors[foreign.id]=foreign;f.sim.actors[authored.id]=authored;f.move('setup');
 await f.send('proving-setup',{itemId,profileId:'accuracy',targetId:'target-alpha'});
 assert.equal(f.player.testing.session.status,'configured','another wallet or the public showcase does not reserve this model');
 const mine={id:'personal-display',spawned:true,ownerId:f.player.actorId,active:true,health:100,asset:{id:catalog.id,sku:catalog.sku,buildAssetId:catalog.buildAssetId}};f.sim.actors[mine.id]=mine;
 await assert.rejects(f.send('proving-setup',{itemId,profileId:'accuracy',targetId:'target-alpha'}),/Recall the deployed or held/);
 const recalled=await f.send('proving-recall',{itemId});assert.deepEqual(recalled.recalledActorIds,[mine.id]);
 assert.equal(f.sim.actors[foreign.id],foreign);assert.equal(f.sim.actors[authored.id],authored);
 f.move('pad');await f.send('proving-deploy',{sessionId:f.player.testing.session.id,padId:'proving-pad'});
 assert.equal(f.player.testing.session.status,'deployed');assert.equal(f.sim.actors[foreign.id],foreign);
});

test('server timing drives visible phases, persists through restarts and settles every result exactly once',async t=>{
 const f=await fixture(t),first=await f.launch();const sessionId=f.player.testing.session.id,launchAt=f.player.testing.session.launchAt;
 assert.equal(first.testing.session.status,'countdown');f.tick(3999);await f.send('proving-status');assert.equal(f.player.testing.session.status,'countdown');f.tick(1);await f.send('proving-status');assert.equal(f.player.testing.session.status,'flight');
 const restored=new UserJsonDatabase(f.database.file),saved=await testingAccountState(restored,f.wallet,{now:f.now,environment:f.environment});assert.equal(saved.session.id,sessionId);assert.equal(saved.session.launchAt,launchAt);
 f.tick(8000);await f.send('proving-status');assert.equal(f.player.testing.session.status,'impact');f.tick(2000);const complete=await f.send('proving-status');assert.equal(complete.testing.session.status,'complete');assert.equal(complete.testing.session.result.score,100);assert.equal(complete.testing.session.result.rewardMzk,0);
 for(let repeat=0;repeat<3;repeat++)await f.send('proving-status');assert.equal(f.player.testing.progress.completedTests,1);assert.equal((await f.database.read()).transactions.filter(row=>row.type==='FACTORY_TEST_COMPLETE').length,1);
 const shared=publicTestingState(f.player.testing);assert.equal(shared.eligibleItems,undefined);assert.equal(shared.session.proofId,undefined);assert.equal(shared.session.itemLockKey,undefined);stepFactoryTesting(f.sim,f.environment,f.now);assert.equal(factoryTestingView(f.sim,f.now).sessions[0].session.status,'complete');assert.equal(publicTestingState(undefined),null);
});

test('only both canonical test profiles unlock the mountain hatch; custom maps cannot mint public clearance',async t=>{
 const custom=await fixture(t,{id:'custom-range',testing:{enabled:true,kind:'proving'}});await custom.complete('accuracy');await custom.complete('cargo');assert.equal(custom.player.testing.progress.completedTests,2);assert.equal(await hasCompoundClearance(custom.database,custom.wallet),false);custom.move('hatch');await assert.rejects(custom.send('proving-enter'),/both public/);
 const f=await fixture(t);await assert.rejects(assertCompoundAccess(f.database,f.wallet),/both public/);await f.complete('accuracy');assert.equal(await hasCompoundClearance(f.database,f.wallet),false);await f.complete('cargo');assert.equal(await hasCompoundClearance(f.database,f.wallet),true);assert.deepEqual((await assertCompoundAccess(f.database,f.wallet)),{compound:true,deep:false});
 f.move('setup');await assert.rejects(f.send('proving-enter'),/Walk to an active hatch/);f.move('hatch');const access=await f.send('proving-enter');assert.equal(access.destination,COMPOUND_ID);assert.deepEqual(access.travel.position,COMPOUND_GATE.entry);
});

test('compound containment is a timed server-owned symbol puzzle; deep access remains locked until solved',async t=>{
 const f=await fixture(t);await f.complete('accuracy');await f.complete('cargo');f.environment={id:COMPOUND_ID};f.move('containment');const start=await f.send('proving-core-start'),puzzle=start.testing.containment;
 await assert.rejects(f.send('proving-core-confirm',{puzzleId:puzzle.id,channels:{coolant:0,shield:0,power:0},solved:true}),/Match all three/);
 const blocked=constrainCompoundPosition(f.player,{x:0,y:.02,z:-25},{x:0,y:.02,z:-50},f.environment);assert.equal(blocked.z,-25.65);await assert.rejects(assertCompoundAccess(f.database,f.wallet,{deep:true}),/Stabilize containment/);
 for(const channel of ['coolant','shield','power']){f.tick(500);await f.send('proving-core-adjust',{puzzleId:puzzle.id,channel,delta:-1});}
 f.tick(600);const result=await f.send('proving-core-confirm',{puzzleId:puzzle.id});assert.equal(result.testing.containment.status,'solved');assert.equal(result.testing.clearance.deep,true);await f.send('proving-core-confirm',{puzzleId:puzzle.id});assert.equal((await f.database.read()).transactions.filter(row=>row.type==='FACTORY_CONTAINMENT_COMPLETE').length,1);
 f.move('deep-hatch');const enter=await f.send('proving-deep-enter');assert.deepEqual(enter.travel.position,COMPOUND_GATE.deepEntry);assert.equal((await assertCompoundAccess(f.database,f.wallet,{deep:true})).deep,true);assert.equal(constrainCompoundPosition(f.player,{x:0,y:.02,z:-25},{x:0,y:.02,z:-50},f.environment).z,-50);
 f.move('return');const back=await f.send('proving-return');assert.equal(back.destination,PROVING_ID);
});

test('edited stations and targets use placed transforms and deletion cancels an unlaunched reservation',async t=>{
 const objects=[{id:'prep',modelId:'testing-telemetry-terminal',position:{x:50,y:.02,z:50},rotation:{x:0,y:Math.PI/2,z:0},scale:{x:2,y:2,z:2},functionalSettings:{testingStation:'setup',testingApproach:{x:0,y:0,z:3.5}}},{id:'pad',modelId:'testing-launch-pad',position:{x:70,y:.02,z:50},functionalSettings:{testingStation:'pad'}},{id:'control',modelId:'testing-launch-console',position:{x:50,y:.02,z:70},functionalSettings:{testingStation:'control'}},{id:'target',modelId:'testing-range-target',position:{x:70,y:.02,z:0},functionalSettings:{testingTarget:'accuracy'}}],environment={id:'edited-range',builderScene:{sourceFactoryTesting:{enabled:true,kind:'proving',editableEquipment:true},objects}},f=await fixture(t,environment);
 const setup=testingStations(environment).find(station=>station.kind==='setup');assert.ok(Math.abs(setup.position.x-57)<1e-8);assert.equal(testingTargets(environment)[0].id,'testing-target:target');f.move('setup');await f.send('proving-setup',{itemId:'crafted-missile',profileId:'accuracy',targetId:'testing-target:target'});f.move('pad');await f.send('proving-deploy',{sessionId:f.player.testing.session.id,padId:'testing-instance:pad'});
 objects.find(object=>object.id==='pad').functionalSettings.active=false;await f.send('proving-status');assert.equal(f.player.testing.session.status,'cancelled');assert.match(f.player.testing.session.message,/pad changed/);environment.builderScene.objects=[];assert.deepEqual(testingStations(environment),[]);assert.deepEqual(testingTargets(environment),[]);
});
