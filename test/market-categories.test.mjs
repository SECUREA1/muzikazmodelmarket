import test from 'node:test';
import assert from 'node:assert/strict';
import {marketCategory,marketCategoryOptions} from '../public/js/market-categories.js';
import {GAME_ECONOMY,GAME_BUNDLES} from '../game-economy.mjs';

test('every game upgrade has a useful shopping category',()=>{
 for(const item of GAME_ECONOMY)assert.notEqual(marketCategory(item),'other',item.name+' needs a category');
 assert.equal(marketCategory({toolId:'jetpack',kind:'tool'}),'flight');
 assert.equal(marketCategory({toolId:'spray',kind:'tool'}),'tools');
 assert.equal(marketCategory({toolId:'laser',kind:'tool'}),'weapons');
 assert.equal(marketCategory({category:'Utility tools',toolId:'medkit',kind:'tool'}),'tools');
});

test('Backpack items and resale listings retain tool and material categorization',()=>{
 assert.equal(marketCategory({itemId:'economy:tool:jetpack',itemType:'game-upgrade'}),'flight');
 assert.equal(marketCategory({itemId:'economy:tool:repair-tool',itemType:'game-upgrade'}),'tools');
 assert.equal(marketCategory({itemId:'economy:tool:scanner',itemType:'game-upgrade'}),'tools');
 assert.equal(marketCategory({itemId:'economy:tool:medkit',itemType:'game-upgrade'}),'tools');
 assert.equal(marketCategory({itemId:'economy:tool:flamethrower',itemType:'game-upgrade'}),'weapons');
 assert.equal(marketCategory({itemId:'economy:material:wood',itemType:'game-upgrade'}),'materials');
 assert.equal(marketCategory({type:'rpg-consumable'}),'care');
 assert.equal(marketCategory({type:'land-deed'}),'lands');
 assert.equal(marketCategory({asset:{builder_category:'Furniture'}}),'furniture');
});

test('category options count all items once and keep stable navigation order',()=>{
 const categories=marketCategoryOptions(GAME_ECONOMY);
 assert.equal(categories.reduce((sum,category)=>sum+category.count,0),GAME_ECONOMY.length);
 assert.equal(categories[0].id,'weapons');assert.ok(categories.some(category=>category.id==='tools'));
 assert.deepEqual(marketCategoryOptions([]),[]);
 for(const bundle of GAME_BUNDLES)assert.notEqual(marketCategory(bundle),'other',bundle.category);
});
