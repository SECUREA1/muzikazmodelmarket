import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {libraryModels,libraryCounts,catalogRecords,createPlacementSelection} from '../public/js/builder-library.js';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
import {INTERACTIVE_DEVICES} from '../public/js/interactive-devices.js';
import {ENTERABLE_BUILDINGS} from '../public/js/building-districts.js';
test('all interactive devices and buildings appear in their own categories with usable behaviors',async()=>{
 const manifest=JSON.parse(await readFile('public/models/backpack-assets.json','utf8')),models=manifest.assets.map(normalizeCatalogModel).filter(Boolean),interactive=libraryModels(models,'interactive'),arcade=libraryModels(models,'arcade'),buildings=libraryModels(models,'buildings');
 for(const id of Object.keys(INTERACTIVE_DEVICES)){const model=interactive.find(item=>item.buildAssetId===id);assert.ok(model,id);assert.equal(model.behavior,'interact');assert.equal(model.function_data.device,id);}
 assert.equal(arcade.length,15);for(const id of Object.keys(ENTERABLE_BUILDINGS))assert.ok(buildings.some(item=>item.buildAssetId===id),id);
 const counts=libraryCounts(models);assert.equal(counts.interactive,interactive.length);assert.equal(counts.all,libraryModels(models).length);
});
test('catalog aliases deduplicate without hiding custom variants or owned Backpack items',()=>{
 const models=[{id:'native',name:'Machine',buildAssetId:'blackjack-cabinet'},{id:'alias',name:'Alias',buildAssetId:'blackjack-cabinet'},{id:'owned',name:'Owned machine',buildAssetId:'blackjack-cabinet',ownedBuilder:true,category:'backpack'},{id:'drawn-a',name:'My drawing',custom:true},{id:'drawn-b',name:'My drawing',custom:true}];
 assert.equal(libraryModels(models).length,4);assert.equal(libraryModels(models,'backpack')[0].id,'owned');assert.equal(libraryModels(models,'custom').length,2);assert.equal(libraryModels(models,'arcade','machine').length,2);
});
test('wrapped API catalogs and custom gameplay configuration retain placeable metadata',()=>{
 const rows=[{id:'game',name:'Custom game',buildAssetId:'retro-snake-cabinet',builderCategory:'interactive',behavior:'interact',configuration:{depth:2},function_data:{device:'retro-snake-cabinet',behavior:'interact'}}];
 assert.equal(catalogRecords({success:true,data:{models:rows}}),rows);assert.equal(catalogRecords({assets:rows}),rows);assert.deepEqual(catalogRecords({success:false}),[]);const model=normalizeCatalogModel(rows[0],0);assert.equal(model.category,'interactive');assert.equal(model.function_data.device,'retro-snake-cabinet');assert.equal(model.function_data.behavior,'interact');
});
test('selection stays loading until ready, ignores superseded loads, and cannot reactivate after cancellation',async()=>{
 const resolvers=new Map(),states=[],selection=createPlacementSelection({load:model=>new Promise(resolve=>resolvers.set(model.id,resolve)),onState:state=>states.push(state)});
 const first=selection.select({id:'first'});assert.equal(states.at(-1).status,'loading');const second=selection.select({id:'second'});resolvers.get('first')({id:'old'});assert.equal(await first,null);assert.equal(states.at(-1).model.id,'second');resolvers.get('second')({id:'new'});assert.equal((await second).id,'new');assert.equal(states.at(-1).status,'ready');
 const third=selection.select({id:'third'});selection.cancel();resolvers.get('third')({id:'late'});assert.equal(await third,null);assert.equal(states.at(-1).status,'idle');
});
test('failed item loading reports a retryable error and can succeed on the next selection',async()=>{
 let fail=true;const states=[],selection=createPlacementSelection({load:async()=>{if(fail)throw Error('offline');return {mesh:true};},onState:state=>states.push(state)});
 assert.equal(await selection.select({id:'item'}),null);assert.equal(states.at(-1).status,'error');fail=false;assert.ok(await selection.select({id:'item'}));assert.equal(states.at(-1).status,'ready');
});
test('native starter items and catalogue copies share a tile while configured variants stay visible',()=>{
 const items=[{id:'frontier-tavern',name:'Tavern',procedural:true},{id:'catalog-tavern',name:'Tavern catalog',buildAssetId:'frontier-tavern'},{id:'custom-tavern',name:'Configured tavern',buildAssetId:'frontier-tavern',configuration:{color:'#f00'}}];assert.equal(libraryModels(items,'buildings').length,2);
});
