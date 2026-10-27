import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {factoryProvingGroundsWorld} from '../factory-testing-world.mjs';
import {testingStations,testingTargets} from '../public/js/factory-test-config.js';
import {testingCommand,stepFactoryTesting,factoryTestingView} from '../server-factory-testing.mjs';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'range-dashboard-'));t.after(()=>rm(directory,{recursive:true,force:true}));const database=new UserJsonDatabase(join(directory,'users.json')),environment=factoryProvingGroundsWorld(),sim={players:{},actors:{}};let now=1000000,sequence=0;
 async function participant(name){const wallet='account:dashboard-'+name,itemId='model-'+name;await database.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:1000},items:[{id:itemId}],memory:{},revision:0};data.transactions.push({id:'craft-'+name,type:'FACTORY_ITEM_CREATED',walletId:wallet,itemId,recipeId:'training-missile',createdAt:new Date(1).toISOString()});return {};});const player=sim.players[wallet]={actorId:wallet,username:name,health:100,lastSeen:now,position:{x:0,y:.02,z:0}};return {player,wallet,itemId};}
 const move=(member,objectId)=>{const station=testingStations(environment).find(station=>station.objectId===objectId);assert.ok(station,objectId);member.player.position={...station.position};return station;};
 const send=(member,action,fields={})=>testingCommand(sim,member.player,environment,{action,requestId:'dashboard-command-'+ ++sequence,...fields},now,{database,walletId:member.wallet});
 const target=()=>testingTargets(environment).find(target=>target.profileId==='accuracy');
 const prepare=async(member,setupId='proving-vr-setup')=>{const setup=move(member,setupId);return send(member,'proving-setup',{stationId:setup.id,itemId:member.itemId,profileId:'accuracy',targetId:target().id});};
 return {database,environment,sim,participant,move,send,prepare,tick(ms){now+=ms;for(const member of Object.values(sim.players))member.lastSeen=now;stepFactoryTesting(sim,environment,now);},get now(){return now;}};
}

test('native raised preparation, launch and telemetry dashboards operate one authoritative shared-pad session',async t=>{
 const f=await fixture(t),member=await f.participant('alice');await f.prepare(member);const sessionId=member.player.testing.session.id,pad=f.move(member,'proving-pad');
 await f.send(member,'proving-deploy',{sessionId,padId:pad.id});const launch=f.move(member,'proving-vr-launch');assert.equal(launch.position.y,.74);await f.send(member,'proving-arm',{sessionId,stationId:launch.id});
 const telemetry=testingStations(f.environment).find(station=>station.objectId==='proving-vr-telemetry');await assert.rejects(f.send(member,'proving-launch',{sessionId,stationId:telemetry.id,aim:{x:0,y:0}}),/Move closer/);
 f.move(member,'proving-vr-telemetry');await f.send(member,'proving-launch',{sessionId,stationId:telemetry.id,aim:{x:.25,y:-.25}});assert.equal(member.player.testing.session.status,'countdown');
 f.tick(member.player.testing.session.endsAt-f.now);const result=await f.send(member,'proving-status');assert.equal(result.testing.session.id,sessionId);assert.equal(result.testing.session.status,'complete');assert.equal(result.testing.progress.completedTests,1);assert.equal(result.testing.session.result.score,90);
 const view=factoryTestingView(f.sim,f.now);assert.deepEqual(view.stations.filter(station=>station.testingDashboard).map(station=>station.testingDashboard).sort(),['launch','setup','telemetry']);assert.equal((await f.database.get(member.wallet)).items.length,1);assert.equal((await f.database.get(member.wallet)).tokens.MZK,1000);
});

test('dashboard operators retain pad exclusivity, and abort from telemetry releases pad and reusable-item locks',async t=>{
 const f=await fixture(t),alice=await f.participant('alice'),bob=await f.participant('bob');await f.prepare(alice);const aliceSession=alice.player.testing.session.id,pad=f.move(alice,'proving-pad');await f.send(alice,'proving-deploy',{sessionId:aliceSession,padId:pad.id});const launch=f.move(alice,'proving-vr-launch');await f.send(alice,'proving-arm',{sessionId:aliceSession,stationId:launch.id});await f.send(alice,'proving-launch',{sessionId:aliceSession,stationId:launch.id,aim:{x:0,y:0}});
 await f.prepare(bob,'proving-setup');f.move(bob,'proving-pad');await assert.rejects(f.send(bob,'proving-deploy',{sessionId:bob.player.testing.session.id,padId:pad.id}),/reserved by another test/);
 f.move(alice,'proving-vr-telemetry');await f.send(alice,'proving-cancel',{sessionId:aliceSession});assert.equal(alice.player.testing.session.status,'cancelled');assert.equal(alice.player.testing.progress.completedTests,0);
 await f.send(bob,'proving-deploy',{sessionId:bob.player.testing.session.id,padId:pad.id});assert.equal(bob.player.testing.session.status,'deployed');const store=(await f.database.read()).factoryTesting;assert.ok(Object.values(store.padLocks).every(lock=>lock.sessionId!==aliceSession));assert.ok(Object.values(store.itemLocks).every(lock=>lock.sessionId!==aliceSession));
});

test('dashboard actions reject remote elevation, inactive stations and stale ids while original controls remain usable',async t=>{
 const f=await fixture(t),member=await f.participant('alice'),setup=f.move(member,'proving-vr-setup');member.player.position.y+=20;await assert.rejects(f.send(member,'proving-setup',{stationId:setup.id,itemId:member.itemId,profileId:'accuracy',targetId:testingTargets(f.environment)[0].id}),/Move closer/);
 await f.prepare(member);const sessionId=member.player.testing.session.id,pad=f.move(member,'proving-pad');await f.send(member,'proving-deploy',{sessionId,padId:pad.id});const launch=f.move(member,'proving-vr-launch'),object=f.environment.builderScene.objects.find(object=>object.id==='proving-vr-launch');object.functionalSettings.active=false;
 await assert.rejects(f.send(member,'proving-arm',{sessionId,stationId:launch.id}),/active control/);assert.equal(member.player.testing.session.status,'deployed');const original=f.move(member,'proving-control');await f.send(member,'proving-arm',{sessionId,stationId:original.id});assert.equal(member.player.testing.session.status,'armed');
 object.functionalSettings.active=true;object.position.x+=30;member.player.position={...launch.position};await assert.rejects(f.send(member,'proving-launch',{sessionId,stationId:launch.id,aim:{x:0,y:0}}),/Move closer/);assert.equal(member.player.testing.session.status,'armed');
});
