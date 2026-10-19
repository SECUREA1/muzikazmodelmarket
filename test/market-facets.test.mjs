import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_ECONOMY,GAME_BUNDLES} from '../game-economy.mjs';
import {MARKET_USE_CASES,marketFacets,marketSubcategoryOptions,matchesMarketFilters} from '../public/js/market-facets.js';
import {marketCategory,marketCategoryOptions} from '../public/js/market-categories.js';
const item=id=>GAME_ECONOMY.find(item=>item.buildAssetId===id);
test('every catalogue item and bundle has a detailed subtype and valid use cases',()=>{
 for(const record of [...GAME_ECONOMY,...GAME_BUNDLES]){const facets=marketFacets(record);assert.ok(facets.subcategoryLabel,record.name);assert.ok(facets.uses.length>0,record.name);for(const use of facets.uses)assert.ok(MARKET_USE_CASES[use]);assert.equal(facets.category,marketCategory(record),record.name);}
});
test('gameplay, media and buildings break down into meaningful separate lists',()=>{
 for(const [id,category,subcategory,use]of [['blackjack-cabinet','arcade','card-games','play'],['retro-snake-cabinet','arcade','retro-games','play'],['memory-match-cabinet','arcade','puzzles','play'],['arcade-slot-machine','arcade','slots','play'],['shared-video-player','media','video','media'],['media-boombox','media','audio','media'],['frontier-tavern','buildings','hospitality','build'],['motor-garage','buildings','industrial','build']]){const facts=marketFacets(item(id));assert.equal(facts.category,category,id);assert.equal(facts.subcategory,subcategory,id);assert.ok(facts.uses.includes(use));}
});
test('owned and member-sale wrappers keep the same classification as catalogue items',()=>{
 for(const id of ['blackjack-cabinet','shared-video-player','frontier-tavern']){const record=item(id),expected=marketFacets(record);for(const wrapper of [{id:'owned-id',asset:record},{itemId:'economy:'+record.sku,itemType:'game-upgrade',name:record.name}]){const actual=marketFacets(wrapper);assert.equal(actual.category,expected.category);assert.equal(actual.subcategory,expected.subcategory);assert.equal(marketCategory(wrapper),expected.category);}}
});
test('subcategory counts cover each item once and use-case toggles combine with ownership and search',()=>{
 for(const category of marketCategoryOptions(GAME_ECONOMY)){const options=marketSubcategoryOptions(GAME_ECONOMY,category.id);assert.equal(options.reduce((sum,option)=>sum+option.count,0),category.count,category.label);}
 const cards={...item('blackjack-cabinet'),owned:true};assert.equal(matchesMarketFilters(cards,{category:'arcade',subcategory:'card-games',uses:['media','play'],ownership:'owned',query:'blackjack'}),true);assert.equal(matchesMarketFilters(cards,{uses:['media']}),false);assert.equal(matchesMarketFilters(cards,{ownership:'unowned'}),false);assert.equal(matchesMarketFilters(cards,{category:'media'}),false);assert.equal(matchesMarketFilters(cards),true);
});
test('materials, wearables and furniture have practical detailed types',()=>{
 for(const [record,expected]of [[{kind:'material',materialId:'wood',name:'Wood',sku:'material:wood'},'timber'],[{kind:'material',materialId:'copper',name:'Copper'},'metals'],[{kind:'material',materialId:'glass-wall',name:'Glass wall'},'structural'],[{type:'wearable',name:'Golden necklace'},'jewelry'],[{type:'wearable',name:'Baseball cap'},'headwear'],[{category:'Builder furniture',name:'Loft Bed'},'beds']])assert.equal(marketFacets(record).subcategory,expected,record.name);
});
