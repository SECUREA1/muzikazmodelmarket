import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {nativeBuilderItem} from '../public/js/native-builder-items.js';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const avatarHelpers=source.slice(source.indexOf('const isNativeAvatar='),source.indexOf('async function clearAvatarProfile('));
const start=source.indexOf('async function designatedAvatar('),end=source.indexOf('\nfunction assetType(',start);
function fixture({profiles=[],selected=null,account={accountId:'player',selectedAvatarId:'starter-avatar'},avatars=[]}={}){
 const calls=[],starter={id:'starter-avatar',modelUrl:'/public/models/starter.glb',eligible:true};
 const context=vm.createContext({nativeBuilderItem,STARTER_AVATAR:starter,readAvatarProfiles:async()=>profiles,validatedAvatar:async(actor,id)=>{calls.push(['validate',actor.id,id]);return selected;},loadoutCodeStore:{getAccount:async id=>{calls.push(['account',id]);return account;}},backpackFor:async value=>{calls.push(['backpack',value.accountId]);return {avatars,selectedAvatarId:value.selectedAvatarId};},approvedAvatarUrl:value=>value?.startsWith('/public/models/')});
 vm.runInContext(avatarHelpers+source.slice(start,end),context);
 return {calls,starter,resolve:(proof={session:{accountId:'player'}},known=null)=>context.designatedAvatar({}, {id:'wallet'},proof,known)};
}

test('starter selection avoids full Backpack and world-directory scans on movement refresh',async()=>{
 for(const selectedAvatarId of ['starter-avatar',null,undefined]){
  const f=fixture({account:{accountId:'player',selectedAvatarId}});
  assert.equal(await f.resolve(),f.starter);
  assert.deepEqual(f.calls,[['account','player']]);
 }
});

test('a freshly authenticated account snapshot is reused only for its matching account',async()=>{
 const f=fixture();assert.equal(await f.resolve({session:{accountId:'player'}},{accountId:'player',selectedAvatarId:'starter-avatar'}),f.starter);assert.deepEqual(f.calls,[]);
 await f.resolve({session:{accountId:'player'}},{accountId:'other',selectedAvatarId:'starter-avatar'});assert.deepEqual(f.calls,[['account','player']]);
 assert.equal(await f.resolve(null),null);
});

test('custom profile ownership validation keeps priority over the starter fallback',async()=>{
 const selected={id:'owned-avatar',modelUrl:'/public/models/owned.glb'},f=fixture({profiles:[{userId:'wallet',assetId:'owned-avatar'}],selected});
 assert.equal(await f.resolve(),selected);assert.deepEqual(f.calls,[['validate','wallet','owned-avatar']]);
 const invalid=fixture({profiles:[{userId:'wallet',assetId:'not-owned'}]});assert.equal(await invalid.resolve(),invalid.starter);assert.equal(invalid.calls[0][0],'validate');
});

test('nonstarter selections retain Backpack eligibility and approved URL checks',async()=>{
 for(const [eligible,modelUrl,accepted] of [[true,'/public/models/owned.glb',true],[false,'/public/models/owned.glb',false],[true,'javascript:bad',false]]){
  const avatar={id:'owned',eligible,modelUrl},f=fixture({account:{accountId:'player',selectedAvatarId:'owned'},avatars:[avatar]});
  assert.equal(await f.resolve(),accepted?avatar:null);assert.ok(f.calls.some(call=>call[0]==='backpack'));
 }
});

function composedFixture({profileId=null,selectedAvatarId='paid-avatar'}={}){
 const calls={worlds:0,orders:0,deliveries:[],ensure:0,get:0,accounts:0};
 const account={accountId:'player',primaryEthereumWallet:'wallet',selectedAvatarId,gameAssets:['Starter Avatar'],purchasedAssets:[]};
 const state={walletId:'wallet',memory:{account:{accountId:'player'}},tokens:{MZK:12000},items:[{id:'paid-avatar',name:'Paid avatar',assetType:'avatar',modelUrl:'/public/models/owned.glb'}]};
 const starter={id:'starter-avatar',name:'Starter Avatar',modelUrl:'/public/models/starter.glb',eligible:true};
 const models=[{id:'owned',name:'Owned model',assetType:'avatar',modelUrl:'/public/models/owned.glb'},{id:'unowned',name:'Unowned model',assetType:'avatar',modelUrl:'/public/models/unowned.glb'},{id:'private',assetType:'avatar',modelUrl:'/public/models/private.glb',visibility:'private'}];
 const context=vm.createContext({nativeBuilderItem,STARTER_AVATAR:starter,JSON,createHash:()=>({update(){return this;},digest(){return 'test-hash';}}),plotSpaceId:()=>'',plotPlayUrl:()=>'',
  repositoryModelManifest:'models',publicAvatarManifest:'fallback',readFile:async path=>{assert.equal(path,'models');return JSON.stringify({models});},combinedEnvironments:async()=>{calls.worlds++;return [{id:'world',name:'Public world',modelUrl:'/public/models/world.glb'}];},
  userDatabase:{ensureAccount:async()=>{calls.ensure++;return state;},get:async()=>{calls.get++;return state;}},paymentOrderStore:{records:async()=>{calls.orders++;return [{orderId:'paid-order',memberAccountId:'player',purchaseType:'MARKETPLACE',paymentStatus:'PAID'}];}},deliverVerifiedStoreOrder:async order=>calls.deliveries.push(order.orderId),
  readAvatarProfiles:async()=>profileId?[{userId:'wallet',assetId:profileId}]:[],readAssets:async()=>[{id:'uploaded',title:'Owned upload',ownerId:'wallet',category:'avatar',publicUrl:'/uploads/assets/owned.glb'},{id:'foreign-upload',title:'Foreign upload',ownerId:'other',category:'avatar',publicUrl:'/uploads/assets/foreign.glb'}],readModels:async()=>[],
  isGlbAvatar:asset=>asset.category==='avatar'&&asset.publicUrl.endsWith('.glb'),loadoutCodeStore:{getAccount:async id=>{calls.accounts++;assert.equal(id,'player');return account;}},cleanText:(value,fallback)=>String(value||fallback)});
 const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
 vm.runInContext(avatarHelpers+section('function publicModelUrl(','async function deliverVerifiedStoreOrder(')+section('async function backpackFor(','\nfunction throttleAccess(')+section('async function readPublicAvatars(','\nfunction assetType('),context);
 return {context,calls,account,state,starter,resolve:(known=account,materialized=state)=>context.designatedAvatar({}, {id:'wallet'},{session:{accountId:'player'}},known,materialized)};
}

test('model-only catalog preserves model records while normal catalog still includes worlds',async()=>{
 const f=composedFixture(),full=await f.context.repositoryGameCatalog();assert.equal(f.calls.worlds,1);
 const models=await f.context.repositoryGameCatalog({includeEnvironments:false});assert.equal(f.calls.worlds,1,'avatar models do not synchronize the world directory');
 assert.deepEqual(models,full.filter(item=>item.assetType!=='environment'));
 assert.ok(models.every(item=>item.id!=='repository-private'));
});

test('paid avatar identity reads owned models without fulfillment, world synchronization or duplicate account writes',async()=>{
 const f=composedFixture(),avatar=await f.resolve();
 assert.equal(avatar.id,'paid-avatar');assert.equal(avatar.modelUrl,'/public/models/owned.glb');
 assert.equal(f.calls.worlds,0);assert.equal(f.calls.orders,0);assert.equal(f.calls.ensure,0);assert.equal(f.calls.accounts,0);
 const normal=await f.context.backpackFor(f.account);
 assert.ok(normal.avatars.some(item=>item.id===avatar.id&&item.eligible));
 assert.equal(f.calls.orders,1,'normal Backpack requests still reconcile purchases');assert.deepEqual(f.calls.deliveries,['paid-order']);assert.equal(f.calls.worlds,1);assert.equal(f.calls.ensure,1);
});

test('custom avatar profiles retain ownership validation without loading world definitions',async()=>{
 for(const profileId of ['uploaded','unowned','foreign-upload']){
  const f=composedFixture({profileId,selectedAvatarId:'starter-avatar'}),avatar=await f.resolve();
  assert.equal(avatar.id,profileId==='uploaded'?'uploaded':'starter-avatar');
  assert.equal(f.calls.worlds,0);assert.equal(f.calls.orders,0);assert.equal(f.calls.ensure,0);assert.equal(f.calls.get,0);
 }
});

test('a wallet state from another account cannot grant an unowned profile avatar',async()=>{
 const f=composedFixture({profileId:'unowned',selectedAvatarId:'starter-avatar'}),foreign={walletId:'wallet',memory:{account:{accountId:'other'}},items:[{id:'forged',assetType:'avatar',modelUrl:'/public/models/unowned.glb'}]};
 const avatar=await f.resolve(f.account,foreign);assert.equal(avatar.id,'starter-avatar');assert.equal(f.calls.get,1,'ownership comes from the canonical wallet when supplied state is not account-bound');assert.equal(f.calls.worlds,0);
 const foreignWallet={...f.state,walletId:'other-wallet'};
 const pack=await f.context.backpackFor(f.account,{includeEnvironments:false,synchronizeOrders:false,walletState:foreignWallet});assert.equal(pack.selectedAvatarId,'starter-avatar');assert.equal(f.calls.ensure,1,'a state from another wallet is not reused');
});
