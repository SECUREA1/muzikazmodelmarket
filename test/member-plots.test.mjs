import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {memberPlotEnvironment} from '../member-plots.mjs';

test('deed-backed plots persist, retain a stable room, and follow the current deed holder',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'member-plots-'));
 try{
 const path=join(dir,'users.json'),db=new UserJsonDatabase(path);
 for(const wallet of ['plot-owner','plot-buyer'])await db.put(wallet,{tokens:{MZK:9000},items:[],memory:{profile:{displayName:wallet}}});
 const deed=await db.claimLand({walletId:'plot-owner',worldId:'volt-city',name:'Volt City',priceMzk:4000,requestId:'buy-plot'});
 assert.equal(deed.spaceId,'plot-deed-volt-city');assert.match(deed.playUrl,/environment=plot-deed-volt-city/);
 await db.claimLand({walletId:'plot-owner',worldId:'volt-city',name:'Volt City',priceMzk:4000,requestId:'buy-plot'});assert.equal((await db.get('plot-owner')).tokens.MZK,5000);
 await assert.rejects(db.claimLand({walletId:'plot-buyer',worldId:'volt-city',name:'Volt City',priceMzk:4000,requestId:'buy-plot'}),/another member/);
 await assert.rejects(db.configurePlot('plot-buyer',deed.id,{environmentId:'garden',name:'stolen'}),/deed holder/);
 await db.configurePlot('plot-owner',deed.id,{environmentId:'garden',name:'Our garden'});
 const reloaded=new UserJsonDatabase(path),record=(await reloaded.memberPlots())[0];assert.equal(record.hostedSpace.environmentId,'garden');
 const bases=[{id:'muzikaz-main',name:'Main',modelUrl:'/main.glb',visibility:'public'},{id:'garden',name:'Garden',modelUrl:'/garden.glb',visibility:'public',spawn:{x:20,y:1,z:30}}];
 const map=memberPlotEnvironment(record,bases);assert.equal(map.id,deed.spaceId);assert.equal(map.roomId,deed.spaceId);assert.equal(map.name,'Our garden');assert.equal(map.modelUrl,'/garden.glb');assert.equal(map.spawn.x,20);assert.equal(map.multiplayer,true);assert.deepEqual(map.aliases,[]);
 await db.listItem('plot-owner',deed.id,100);
 await db.trade({buyerId:'plot-buyer',sellerId:'plot-owner',itemId:deed.id,requestId:'buy-resale-plot',expectedPriceMzk:100});
 await assert.rejects(db.configurePlot('plot-owner',deed.id,{environmentId:'garden'}),/deed holder/);
 await db.configurePlot('plot-buyer',deed.id,{environmentId:'muzikaz-main',name:'New owner space'});
 const transferred=(await db.memberPlots())[0];assert.equal(transferred.ownerId,'plot-buyer');assert.equal(transferred.spaceId,deed.spaceId);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('older deeds gain a stable public space without exposing a private template',()=>{
 const deed={id:'deed-old',name:'Old plot',ownerId:'plot-owner'};
 const base={id:'muzikaz-main',name:'Main',modelUrl:'/main.glb',visibility:'public'};
 assert.equal(memberPlotEnvironment(deed,[base]).id,'plot-deed-old');
 assert.equal(memberPlotEnvironment({...deed,hostedSpace:{environmentId:'secret'}},[base,{id:'secret',visibility:'private',modelUrl:'/secret.glb'}]).modelUrl,'/main.glb');
});

test('binding a wallet keeps the same hosted plot under the member account',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'plot-wallet-link-'));
 try{const db=new UserJsonDatabase(join(dir,'users.json')),account={accountId:'plot-link',mzkBalance:6000,gameAssets:[],landAssets:[],bottleClaims:[]};
 await db.ensureAccount(account);const deed=await db.claimLand({walletId:'account:plot-link',worldId:'echo-gardens',name:'Echo Gardens',priceMzk:4000,requestId:'link-deed'});
 const wallet='0x'+'a'.repeat(40);await db.ensureAccount({...account,primaryEthereumWallet:wallet});
 assert.equal((await db.memberPlots())[0].ownerId,wallet);assert.equal((await db.get(wallet)).tokens.MZK,2000);
 const changed=await db.configurePlot(wallet,deed.id,{environmentId:'muzikaz-main',name:'Linked plot'});assert.equal(changed.spaceId,deed.spaceId);
 }finally{await rm(dir,{recursive:true,force:true});}
});
