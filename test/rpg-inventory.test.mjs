import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
test('RPG supplies debit shared MZK, trade ownership and consume once with trusted effects',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rpg-'));try{
 const db=new UserJsonDatabase(join(dir,'users.json'));
 await db.put('alice',{tokens:{MZK:100},items:[]});await db.put('bob',{tokens:{MZK:100},items:[]});
 await Promise.all([db.rpgAction('alice','buy','ion-health-vial','purchase-1'),db.rpgAction('alice','buy','ion-health-vial','purchase-1')]);
 let state=await db.rpgState('alice');assert.equal(state.balance,75);assert.equal(state.items.length,1);const item=state.items[0];
 await db.listItem('alice',item.id,10,true);await db.trade({buyerId:'bob',sellerId:'alice',itemId:item.id,requestId:'trade-1',expectedPriceMzk:10});
 await assert.rejects(db.rpgAction('alice','use',item.id,'use-a'),/Owned RPG/);
 await db.recordRpgTelemetry('bob',{health:10,world:'arena'});
 await db.rpgAction('bob','use',item.id,'use-b');await db.rpgAction('bob','use',item.id,'use-b');
 state=await db.rpgState('bob');assert.equal(state.stats.health,45);assert.equal(state.items.length,0);assert.equal(state.history[0].world,'arena');
 await assert.rejects(db.rpgAction('bob','use',item.id,'use-c'),/Owned RPG/);
 await assert.rejects(db.rpgAction('bob','buy','ioncore-survival-pack','expensive'),/Insufficient/);
 await db.put('bob',{items:[{id:item.id,type:'rpg-consumable',catalogId:'core-medkit'}]});assert.equal((await db.rpgState('bob')).items.length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
