import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {NATIVE_BUILDER_ITEMS,nativeBuilderItem} from '../public/js/native-builder-items.js';
import {BUILDER_MODEL_INFO} from '../public/js/builder-models-3d.js';
import {BUILDING_MATERIALS} from '../public/js/building-materials.js';
import {ARCADE_PARTS} from '../public/js/arcade-rules.js';
import {HOCKEY_ITEMS} from '../public/js/hockey-models.js';

test('shared native metadata covers renderer, sports and building material definitions',()=>{
 for(const id of [...Object.keys(BUILDER_MODEL_INFO),...HOCKEY_ITEMS.map(item=>item.id),...ARCADE_PARTS.map(item=>'arcade-part-'+item.id),...BUILDING_MATERIALS.map(item=>'material:'+item.id)]){
  const item=nativeBuilderItem(id);assert.ok(item,id);assert.equal(item.buildAssetId,id);assert.ok(item.name,id);assert.equal(item.function_data.behavior,item.behavior,id);
 }
 assert.equal(new Set(Object.values(NATIVE_BUILDER_ITEMS).map(item=>item.id)).size,Object.keys(NATIVE_BUILDER_ITEMS).length);
 assert.equal(nativeBuilderItem('unknown-model'),null);
});

test('native defaults retain authored interactions, quest roles, aircraft and wearable metadata',()=>{
 for(const [id,behavior]of [['portal-door','door'],['quest-scroll','quest'],['treasure-chest','pickup'],['emerald-slime','hostile'],['camp-log-bench','seat']])assert.equal(nativeBuilderItem(id).function_data.behavior,behavior,id);
 assert.equal(nativeBuilderItem('forest-ranger').type,'avatar');assert.equal(nativeBuilderItem('forest-ranger').category,'characters');
 const aircraft=nativeBuilderItem('corsair-aircraft');assert.equal(aircraft.vehicleSettings.mode,'fly');assert.ok(aircraft.vehicleSettings.seat);assert.ok(aircraft.vehicleSettings.cockpit);assert.equal(aircraft.vehicleSettings.speed,29);
 assert.equal(nativeBuilderItem('harbor-yacht').vehicleSettings.mode,'boat');
 assert.equal(nativeBuilderItem('camp-activity-board').function_data.quest.requiredItems.length,2);
 assert.equal(nativeBuilderItem('basketball-jersey-home').attachment.socket,'torso');
 assert.equal(nativeBuilderItem('emerald-slime').aiSettings.type,'hostile');
 assert.equal(nativeBuilderItem('radio-console').function_data.device,'radio-console');
 assert.equal(nativeBuilderItem('world-resident').type,'avatar');assert.equal(nativeBuilderItem('world-resident').function_data.behavior,'talk');
});

test('editor placement preserves independent authored runtime settings',async()=>{
 const source=await readFile(new URL('../environment-builder.js',import.meta.url),'utf8');
 const make=source.slice(source.indexOf('function makeObject('),source.indexOf('\nconst generatedWorlds='));
 const model={...structuredClone(nativeBuilderItem('forest-ranger')),movementSettings:{speed:4,patrolRadius:12},aiSettings:{type:'patrol',detectionRange:15},questSettings:{id:'trail-quest',requiredItems:['badge']},dialogueSettings:{text:'Find a badge.'},avatarSettings:{bodyColor:'#abcdef'},environmentSettings:{gravity:7},vehicleSettings:{mode:'fly',seat:[1,2,3]},animationState:{clip:'wave',speed:2}};
 const context=vm.createContext({structuredClone,modelFor:()=>model,uid:()=> 'placed',terrainHeight:()=>4,colors:['#fff'],defaultAvatarLook:()=>({hat:'none'})});
 vm.runInContext(make+'\nglobalThis.placed=makeObject("forest-ranger",2,3);',context);
 const placed=context.placed;
 for(const key of ['movementSettings','aiSettings','questSettings','dialogueSettings','environmentSettings','vehicleSettings'])assert.equal(JSON.stringify(placed[key]),JSON.stringify(model[key]),key);
 assert.equal(placed.animationState.clip,'wave');assert.equal(placed.animationState.speed,2);assert.equal(placed.avatarSettings.bodyColor,'#abcdef');assert.equal(placed.functionalSettings.behavior,'quest');
 placed.questSettings.requiredItems.push('another');placed.vehicleSettings.seat[0]=99;
 assert.equal(model.questSettings.requiredItems.length,1);assert.equal(model.vehicleSettings.seat[0],1);
});
