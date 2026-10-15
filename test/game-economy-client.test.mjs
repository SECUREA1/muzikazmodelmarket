import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEconomy} from '../public/js/game-economy-client.js';
test('client gates locked upgrades, keeps basics free, and prevents duplicate use while paying',async()=>{
 let calls=0,shops=0,release;
 const client=new GameEconomy({inventory:{economyAction:async()=>{calls++;await new Promise(resolve=>release=resolve);return {balanceAfterMzk:98};}},announce(){},shop(){shops++;}});
 assert.equal((await client.use('material:studs')).ok,true);assert.equal(calls,0);
 assert.equal((await client.use('tool:scanner')).ok,false);assert.equal(shops,1);assert.equal(calls,0);
 client.items=[{sku:'tool:scanner',name:'Scanner',owned:true,useCostMzk:2}];
 const first=client.use('tool:scanner');assert.equal((await client.use('tool:scanner')).ok,false);assert.equal(calls,1);
 release();assert.equal((await first).balance,98);
 client.items=[];assert.equal((await client.use('tool:scanner')).ok,false,'selling an upgrade removes client access');
});
