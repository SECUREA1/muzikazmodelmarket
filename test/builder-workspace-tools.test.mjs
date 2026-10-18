import test from 'node:test';
import assert from 'node:assert/strict';
import {sortBuilderItems,rememberBuilderItem,tuningSnapshot,createTuningHistory,finiteTuning} from '../public/js/builder-workspace-tools.js';
const items=[{id:'c',name:'Chair',type:'interior'},{id:'a',name:'Arcade',type:'interactive',ownedBuilder:true},{id:'b',name:'Brick',type:'props',custom:true}];
test('catalogue sorting is deterministic, filters collections and preserves source records',()=>{
 const before=structuredClone(items);assert.deepEqual(sortBuilderItems(items).map(m=>m.id),['a','b','c']);assert.deepEqual(sortBuilderItems(items,{sort:'name-desc'}).map(m=>m.id),['c','b','a']);assert.deepEqual(sortBuilderItems(items,{scope:'favorites',favorites:['c']}).map(m=>m.id),['c']);assert.deepEqual(sortBuilderItems(items,{scope:'backpack'}).map(m=>m.id),['a']);assert.deepEqual(sortBuilderItems(items,{scope:'custom'}).map(m=>m.id),['b']);assert.deepEqual(sortBuilderItems(items,{scope:'recent',recent:['b','a']}).map(m=>m.id),['b','a']);assert.deepEqual(items,before);
});
test('recently placed objects are deduplicated and bounded',()=>{
 assert.deepEqual(rememberBuilderItem(['a','b'],'b'),['b','a']);assert.equal(rememberBuilderItem(Array.from({length:70},(_,i)=>''+i),'new').length,60);
});
test('tuning undo and redo restore independent snapshots, guard selection and clear redo after a new edit',()=>{
 const object={position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},groundOffset:0},history=createTuningHistory(2),before=tuningSnapshot(object);object.position.x=.1;const after=tuningSnapshot(object);history.record('a',before,after);object.position.x=10;assert.equal(history.undo('other'),null);assert.deepEqual(history.undo('a'),before);assert.deepEqual(history.redo('a'),after);history.undo('a');history.record('a',before,{...after,groundOffset:.5});assert.equal(history.canRedo('a'),false);assert.equal(history.undo('a').groundOffset,0);
});
test('unchanged fields do not consume undo and invalid tuning values never become NaN',()=>{
 const h=createTuningHistory(),state={position:{x:0,y:0,z:0}};h.record('a',state,structuredClone(state));assert.equal(h.canUndo('a'),false);for(const v of ['',NaN,Infinity,'bad'])assert.equal(finiteTuning(v,0,50),null);assert.equal(finiteTuning(90,0,50),50);assert.equal(finiteTuning(-1,0,50),0);assert.equal(finiteTuning('.25',0,50),.25);
});

test('catalogue search includes IDs and gameplay uses without removing category filters',async()=>{
 const {libraryModels}=await import('../public/js/builder-library.js');const entries=[{id:'healing-unit',name:'Aid Station',type:'props',behavior:'heal'},{id:'odd-name',name:'Console',type:'props',function_data:{device:'arcade-slot-machine'}}];assert.equal(libraryModels(entries,'all','healing-unit')[0].name,'Aid Station');assert.equal(libraryModels(entries,'all','heal')[0].id,'healing-unit');assert.equal(libraryModels(entries,'all','arcade-slot-machine')[0].name,'Console');assert.equal(libraryModels(entries,'vehicles','heal').length,0);
});
