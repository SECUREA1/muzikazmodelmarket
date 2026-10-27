import test from 'node:test';
import assert from 'node:assert/strict';
import {PRISON_PACKETS,PRISON_SUPPLY_ITEMS,PRISON_SUPPLY_CAPACITY,purchasePrisonPacket,usePrisonItem,prisonPacketRequirement,prisonSupplyCounts} from '../public/js/prison-packets.js';

const player=changes=>({role:'prisoner',tokens:30,health:50,energy:40,morale:60,inventory:['wire'],completed:[],caughtUntil:0,...changes});

test('prison packets debit canonical recreation-token prices and carry only legitimate supplies',()=>{
 const p=player(),result=purchasePrisonPacket(p,'canteen',{now:1000,cost:0,tokens:10000,items:{keycard:1}});
 assert.equal(result.ok,true);assert.equal(p.tokens,26);assert.equal(p.supplies.snack,1);assert.equal(p.supplies.water,1);assert.deepEqual(p.inventory,['wire']);
 assert.ok(PRISON_PACKETS.length>=3);
 for(const packet of PRISON_PACKETS)for(const id of Object.keys(packet.items)){assert.ok(PRISON_SUPPLY_ITEMS[id]);assert.ok(!['wire','map','keycard','pass'].includes(id));}
});

test('unknown packets, missing requirements, funds and duplicate clicks cannot mutate supply state',()=>{
 for(const [p,id,pattern]of [[player(),'__proto__',/available/],[player(),'workshop',/workshop/],[player(),'guard-duty',/guard/],[player({tokens:3}),'canteen',/4 recreation/],[player({tokens:'100'}),'canteen',/4 recreation/]]){
  const before=structuredClone(p);assert.match(purchasePrisonPacket(p,id,{now:1000}).message,pattern);assert.deepEqual(p,before);
 }
 const p=player();assert.equal(purchasePrisonPacket(p,'canteen',{now:1000}).ok,true);const before=structuredClone(p);
 assert.equal(purchasePrisonPacket(p,'canteen',{now:1000}).ok,false);assert.deepEqual(p,before);
 assert.equal(purchasePrisonPacket(player({completed:['work']}),'workshop',{now:1000}).ok,true);
 assert.equal(purchasePrisonPacket(player({role:'guard'}),'guard-duty',{now:1000}).ok,true);
 assert.equal(prisonPacketRequirement(player({completed:['work']}),'workshop'),null);
});

test('finite pouch and per-item limits reject whole purchases without spending tokens',()=>{
 const p=player({supplies:{snack:4,water:0}}),before=structuredClone(p);
 assert.equal(purchasePrisonPacket(p,'canteen',{now:1000}).ok,false);assert.deepEqual(p,before);
 p.supplies={snack:2,water:3,juice:3};assert.equal(Object.values(p.supplies).reduce((sum,n)=>sum+n,0),PRISON_SUPPLY_CAPACITY);
 const full=structuredClone(p);assert.equal(purchasePrisonPacket(p,'canteen',{now:2000}).ok,false);assert.deepEqual(p,full);
});

test('consumables use fixed bounded effects and a shared server cooldown without creating currency',()=>{
 const p=player({health:96,energy:95,morale:99,supplies:{snack:1,water:1,juice:0,'first-aid':1}}),tokens=p.tokens;
 const snack=usePrisonItem(p,'snack',{now:1000,effects:{energy:999},tokens:999});
 assert.equal(snack.ok,true);assert.deepEqual(snack.effects,{energy:5,morale:1});assert.equal(p.energy,100);assert.equal(p.morale,100);assert.equal(p.supplies.snack,0);assert.equal(p.tokens,tokens);
 const before=structuredClone(p);assert.equal(usePrisonItem(p,'water',{now:1001}).ok,false);assert.deepEqual(p,before);
 assert.equal(usePrisonItem(p,'first-aid',{now:11000}).ok,true);assert.equal(p.health,100);assert.equal(p.supplies['first-aid'],0);assert.equal(p.tokens,tokens);
 const full=structuredClone(p);assert.equal(usePrisonItem(p,'water',{now:22000}).ok,false);assert.deepEqual(p,full);
});

test('unowned items, invalid clocks, detention and completed escapes cannot consume or buy supplies',()=>{
 for(const p of [player({caughtUntil:5000}),player({escaped:true}),player({role:'forged'})]){
  p.supplies={water:1};const before=structuredClone(p);assert.equal(purchasePrisonPacket(p,'canteen',{now:1000}).ok,false);assert.equal(usePrisonItem(p,'water',{now:1000}).ok,false);assert.deepEqual(p,before);
 }
 const p=player({supplies:{water:1}}),before=structuredClone(p);
 for(const id of ['__proto__','wire','first-aid'])assert.equal(usePrisonItem(p,id,{now:1000}).ok,false);
 assert.equal(usePrisonItem(p,'water',{now:NaN}).ok,false);assert.equal(purchasePrisonPacket(p,'canteen',{now:-1}).ok,false);assert.deepEqual(p,before);
 assert.deepEqual(prisonSupplyCounts({supplies:{water:-4,snack:2,pass:100}}),{snack:2,water:0,juice:0,'first-aid':0});
});
