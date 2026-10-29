import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const start=source.indexOf('  function renderPicker() {')+'  function renderPicker() {'.length;
const section=source.slice(start,source.indexOf('\n  function renderLibrary()',start));
const body=section.slice(0,section.lastIndexOf('}'));

function fixture(backpack){
 let pouchUpdates=0,mapUpdates=0,inventoryReads=0;
 const library={innerHTML:'<input data-world-search value="studio"><button data-world-view="list">List</button>',classList:{contains:name=>name==='backpack-panel'&&backpack,toggle(){}},querySelector:()=>null,querySelectorAll:()=>[]};
 const render=new Function('library','refreshPouchInventory','registry','syncEnvironmentSelect','gameEconomy','backpackRecords','BACKPACK_CATEGORIES','backpackCategory','backpackPieSlice','backpackIcon','backpackSelectionOpen','mobileBackpackQuery','readGameObject',body);
 return {library,run(){render(library,()=>pouchUpdates++,{all:()=>[]},()=>mapUpdates++,null,()=>{inventoryReads++;return [];},[['avatars','Avatars']],'avatars',()=>'',()=>'',false,{matches:false},()=>null);},counts:()=>({pouchUpdates,mapUpdates,inventoryReads})};
}

test('late inventory refresh preserves the open destination picker contents',()=>{
 const view=fixture(false),contents=view.library.innerHTML;
 view.run();view.run();
 assert.equal(view.library.innerHTML,contents,'refreshing inventory must not replace map search and movement-friendly controls');
 assert.deepEqual(view.counts(),{pouchUpdates:2,mapUpdates:2,inventoryReads:0},'pouch and destination data still refresh independently');
});

test('selecting Backpack still renders current inventory after a map was shown',()=>{
 const view=fixture(true);
 view.run();
 assert.match(view.library.innerHTML,/data-backpack-category="avatars"/);
 assert.match(view.library.innerHTML,/data-close-backpack/);
 assert.deepEqual(view.counts(),{pouchUpdates:1,mapUpdates:1,inventoryReads:1});
});
