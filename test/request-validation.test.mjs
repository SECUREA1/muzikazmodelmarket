import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readJsonInput,memberWalletPatch} from '../request-validation.mjs';
const request = value => Readable.from([Buffer.from(value)]);
test('JSON requests reject malformed, oversized, non-object and dangerous nested input',async()=>{
 for(const input of ['null','[]','5','{','{"memory":{"__proto__":{"admin":true}}}','{"items":{"constructor":{}}}','{"amountMzk":1e999}']) await assert.rejects(readJsonInput(request(input)),{statusCode:400});
 await assert.rejects(readJsonInput(request('{"name":"long"}'),5),{statusCode:413});
 await assert.rejects(readJsonInput(request('{"a":'.repeat(35)+'{}'+'}'.repeat(35))),{statusCode:400});
 assert.deepEqual(await readJsonInput(request('{"sku":"tool:jetpack"}')),{sku:'tool:jetpack'});
});
test('member wallet writes accept only display name and normalized player preferences',()=>{
 const normalize = () => ({sound:false});
 for(const input of [{tokens:{MZK:100}},{items:[]},{memory:{account:null}},{memory:{backpack:{items:[]}}},{memory:{ioncoreRpg:{health:999}}},{memory:{memberRewards:{}}},{memory:{profile:{username:'admin'}}},{memory:[]}]) assert.throws(()=>memberWalletPatch(input,normalize),{statusCode:403});
 assert.deepEqual(memberWalletPatch({memory:{profile:{displayName:' Player '},playerSettings:{admin:true}}},normalize),{memory:{profile:{displayName:'Player'},playerSettings:{sound:false}}});
});

test('trades reject replay under another buyer or item and reject fractional MZK',async t=>{
 const {UserJsonDatabase}=await import('../user-json-database.mjs');
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'input-protection-'));t.after(()=>rm(dir,{recursive:true,force:true}));const db=new UserJsonDatabase(join(dir,'users.json'));
 await db.put('seller',{tokens:{MZK:0},items:[{id:'item-one',name:'One'},{id:'item-two',name:'Two'}]});
 await db.put('buyer',{tokens:{MZK:100}});await db.put('another',{tokens:{MZK:100}});
 assert.throws(()=>db.listItem('seller','item-one',2.5));
 assert.throws(()=>db.spendGameplay('buyer',{amountMzk:2.5,requestId:'fraction'}));
 await db.listItem('seller','item-one',10);
 const input={buyerId:'buyer',sellerId:'seller',itemId:'item-one',requestId:'trade-once'};
 const receipt=await db.trade(input);assert.equal((await db.trade(input)).id,receipt.id);
 await assert.rejects(db.trade({...input,buyerId:'another'}),{statusCode:409});
 await assert.rejects(db.trade({...input,itemId:'item-two'}),{statusCode:409});
 assert.equal((await db.get('buyer')).tokens.MZK,90);assert.equal((await db.get('another')).tokens.MZK,100);
});
