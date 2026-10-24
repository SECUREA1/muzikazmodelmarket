import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {backpackPlacementModels} from '../public/js/builder-backpack-models.js';

test('legacy native purchases regain runtime defaults without rewriting inventory or ownership',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'legacy-native-market-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'users.json'),db=new UserJsonDatabase(file);
 const aircraft=GAME_ECONOMY.find(item=>item.buildAssetId==='diamond-da40'),quest=GAME_ECONOMY.find(item=>item.buildAssetId==='quest-scroll');
 const oldAircraft={id:'retained-aircraft-copy',economySku:aircraft.sku,name:'My aircraft',type:'game-upgrade',source:'member-market',acquiredAt:'2026-08-01T00:00:00.000Z',listing:{active:true,priceMzk:125},configuration:{prompt:'My custom boarding prompt',color:'#ff0000'},vehicleSettings:{speed:12}};
 const oldQuest={id:'retained-quest-copy',sku:quest.sku,type:'game-upgrade',source:'game-market',listing:{active:false},function_data:{prompt:'My quest prompt'},dialogueSettings:{text:'My saved dialogue'}};
 const ordinary={id:'ordinary-custom',type:'custom-item',name:'Unrelated item',configuration:{color:'#123456'}};
 await db.put('legacy-owner',{items:[oldAircraft,oldQuest,ordinary],tokens:{MZK:1200}});
 const before=await readFile(file,'utf8'),state=await db.get('legacy-owner'),view=await db.economy('legacy-owner');
 const owned=view.ownedAssets.find(item=>item.id===oldAircraft.id),guide=view.ownedAssets.find(item=>item.id===oldQuest.id);
 for(const field of ['id','type','source','acquiredAt','listing','configuration'])assert.deepEqual(owned[field],oldAircraft[field],field);
 assert.equal(owned.function_data.behavior,'vehicle');assert.equal(owned.vehicleSettings.mode,'fly');assert.equal(owned.vehicleSettings.speed,12);assert.deepEqual(owned.vehicleSettings.seat,aircraft.vehicleSettings.seat);
 assert.equal(guide.function_data.behavior,'quest');assert.equal(guide.function_data.prompt,'My quest prompt');assert.deepEqual(guide.questSettings,quest.questSettings);assert.equal(guide.dialogueSettings.text,'My saved dialogue');
 assert.deepEqual(view.ownedAssets.find(item=>item.id===ordinary.id),state.items.find(item=>item.id===ordinary.id));
 const placement=backpackPlacementModels({},view).find(item=>item.sourceId===oldAircraft.id);assert.ok(placement);assert.equal(placement.function_data.prompt,'My custom boarding prompt');assert.equal(placement.vehicleSettings.mode,'fly');
 assert.equal(view.balance,1200);assert.equal(view.items.find(item=>item.sku===aircraft.sku).owned,true);assert.equal(view.ownedAssets.length,state.items.length);
 assert.equal(await readFile(file,'utf8'),before,'view hydration must never write inventory, listings, or ownership');
 assert.deepEqual((await db.get('legacy-owner')).items,state.items);
 assert.equal((await db.economy('another-owner')).ownedAssets.some(item=>item.id===oldAircraft.id),false,'canonical defaults must never create ownership for another account');
});
