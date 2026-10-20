import test from 'node:test';
import assert from 'node:assert/strict';
import {buyLockedItem} from '../public/js/item-unlock-prompt.js';
test('material checkout uses the agreed one-piece quote and existing settlement API',async()=>{
 let args;const receipt=await buyLockedItem({buyMaterials:async(...values)=>{args=values;return {ok:true};}},{sku:'material:gold',kind:'material',unitPriceMzk:50,basic:false});assert.deepEqual(args,['material:gold',1,50]);assert.equal(receipt.ok,true);
});
test('asset checkout uses the existing economy purchase flow and propagates failures',async()=>{
 let args;await buyLockedItem({economyAction:async(...values)=>{args=values;}},{sku:'backpack:chair',kind:'asset'});assert.deepEqual(args,['buy','backpack:chair']);
 await assert.rejects(buyLockedItem({economyAction:async()=>{throw Error('Insufficient MZK');}},{sku:'backpack:chair',kind:'asset'}),/Insufficient MZK/);
 await assert.rejects(buyLockedItem({},null),/marketplace/);
});
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('market link targets the exact SKU even when item names match; clearing the target restores all items',()=>{
 const source=readFileSync('public/js/in-game-market.js','utf8'),rows=[{textContent:'Chair',dataset:{}},{textContent:'Chair',dataset:{}}],fields=new Map();
 const context=vm.createContext({focusedSku:'backpack:chair-2',data:[{sku:'backpack:chair-1'},{sku:'backpack:chair-2'}],facetRows:[{},{}],selectedUses:new Set(),tab:'upgrades',categorizedTabs:new Set(['upgrades']),updateAdvancedFilters(){},body:{querySelectorAll:()=>rows},dialog:{querySelector:key=>{if(!fields.has(key))fields.set(key,{value:'',textContent:'',hidden:false});return fields.get(key);}}});
 const start=source.indexOf(' function filter(){');vm.runInContext(source.slice(start,source.indexOf(' function row(',start)),context);context.filter();assert.equal(rows[0].hidden,true);assert.ok(!rows[1].hidden);context.focusedSku='';context.filter();assert.ok(rows.every(row=>!row.hidden));
});
