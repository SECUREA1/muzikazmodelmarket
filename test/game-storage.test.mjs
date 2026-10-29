import test from 'node:test';
import assert from 'node:assert/strict';
import {readGameJson,readGameArray,readGameObject,writeGameStorage,isGameRecord} from '../public/js/game-storage.js';

function fixture(records={}){
 const values=new Map(Object.entries(records)),writes=[];
 return {values,writes,getItem:key=>values.has(key)?values.get(key):null,setItem(key,value){writes.push([key,value]);values.set(key,value);}};
}

test('valid scoped game data survives without writes and missing keys get fresh defaults',()=>{
 const storage=fixture({rows:'["player","inventory"]',avatar:'{"id":"owned-avatar","modelUrl":"/public/avatar.glb"}',progress:'{"saved":42}'});
 assert.deepEqual(readGameArray('rows',{item:value=>typeof value==='string',storage}),['player','inventory']);
 assert.deepEqual(readGameObject('avatar',{nullable:true,storage}),{id:'owned-avatar',modelUrl:'/public/avatar.glb'});
 const first=readGameObject('missing',{storage});first.mutated=true;
 assert.deepEqual(readGameObject('missing',{storage}),{});assert.deepEqual(storage.writes,[]);
 assert.equal(storage.values.get('progress'),'{"saved":42}');
});

test('malformed JSON and wrong container types repair only the invalid key',()=>{
 for(const raw of ['undefined','<html>not game data</html>','null','{}','123','"rows"']){
  const storage=fixture({rows:raw,progress:'{"saved":42}'});
  assert.deepEqual(readGameArray('rows',{item:value=>typeof value==='string',storage}),[]);
  assert.equal(storage.values.get('rows'),'[]');assert.equal(storage.values.get('progress'),'{"saved":42}');
  assert.deepEqual(storage.writes,[['rows','[]']]);
 }
 for(const raw of ['undefined','null','[]','23']){
  const storage=fixture({records:raw});assert.deepEqual(readGameObject('records',{storage}),{});assert.equal(storage.values.get('records'),'{}');
 }
 const nullable=fixture({avatar:'[]'});assert.equal(readGameObject('avatar',{nullable:true,storage:nullable}),null);assert.equal(nullable.values.get('avatar'),'null');
});

test('collection validation retains good values and removes unusable entries before Set or inventory consumers',()=>{
 const storage=fixture({rows:'["inventory",null,4,{},"player"]',pack:'[{"id":"bat","name":"Bat"},null,[],"bad",{"name":"Missing identity"}]'});
 const rows=readGameArray('rows',{item:value=>typeof value==='string',storage});
 assert.deepEqual([...new Set(rows)],['inventory','player']);assert.equal(storage.values.get('rows'),'["inventory","player"]');
 assert.deepEqual(readGameArray('pack',{item:value=>isGameRecord(value)&&typeof value.id==='string',storage}),[{id:'bat',name:'Bat'}]);
 assert.equal(storage.values.get('pack'),'[{"id":"bat","name":"Bat"}]');
});

test('unavailable or full storage cannot throw during recovery and validation failures use the fallback',()=>{
 const unavailable={getItem(){throw new Error('Storage denied');},setItem(){throw new Error('Storage denied');}};
 assert.deepEqual(readGameArray('rows',{storage:unavailable}),[]);assert.equal(readGameObject('avatar',{nullable:true,storage:unavailable}),null);
 assert.equal(writeGameStorage('rows',[],{storage:unavailable}),false);
 const full={getItem:()=>'{bad',setItem(){throw new Error('Quota exceeded');}};
 assert.deepEqual(readGameObject('rows',{storage:full}),{});
 const storage=fixture({value:'{"old":true}'});assert.deepEqual(readGameJson('value',[],{validate(){throw new Error('Old shape');},storage}),[]);
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try{Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('SecurityError');}});assert.deepEqual(readGameArray('rows'),[]);}finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
