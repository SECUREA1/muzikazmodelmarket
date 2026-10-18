import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {mainMarketEntries,mainMarketOptions,filterMainMarket} from '../public/js/main-market-filters.js';
const upgrade=id=>({...GAME_ECONOMY.find(item=>item.buildAssetId===id),source:'upgrade'});
test('main public catalogue exposes the complete item list with the detailed category counts',()=>{
 const items=GAME_ECONOMY.map(item=>({...item,id:'upgrade:'+item.sku,source:'upgrade'})),entries=mainMarketEntries(items);assert.equal(filterMainMarket(entries).length,items.length);const options=mainMarketOptions(entries);assert.equal(options.categories.reduce((sum,value)=>sum+value.count,0),items.length);
 for(const category of options.categories){const types=mainMarketOptions(entries,{category:category.id}).subcategories;assert.equal(types.reduce((sum,value)=>sum+value.count,0),category.count,category.label);}
 assert.equal(filterMainMarket(entries,{category:'arcade'}).length,15);assert.equal(filterMainMarket(entries,{category:'media',uses:['media']}).length,10);assert.ok(filterMainMarket(entries,{category:'buildings'}).length>=25);
});
test('main market wrappers classify models and builder items using actual metadata rather than source labels',()=>{
 const items=[{id:'model:avatar',name:'Avatar',category:'Models',source:'model',model:{assetType:'avatar',name:'Avatar'}},{id:'builder:video',name:'Screen',category:'Builder assets',source:'builder',asset:{name:'Screen',builder_category:'Interactive',buildAssetId:'shared-video-player',function_data:{device:'shared-video-player'}}},{id:'player:poker',itemId:'economy:backpack:backpack-video-poker-table',name:'Poker',category:'Player items',source:'player',itemType:'game-upgrade'}];const entries=mainMarketEntries(items);
 assert.equal(filterMainMarket(entries,{category:'avatars'})[0].item.id,'model:avatar');assert.equal(filterMainMarket(entries,{category:'media',subcategory:'video'})[0].item.id,'builder:video');assert.equal(filterMainMarket(entries,{category:'arcade',subcategory:'card-games'})[0].item.id,'player:poker');
});
test('source, category, item type, use cases and seller search combine without changing purchase identifiers',()=>{
 const machine=upgrade('blackjack-cabinet'),items=[machine,{id:'custom-sale',name:'Custom sign',source:'player',itemType:'custom-item',category:'Custom items',seller:'Artist'},{id:'land:volt',name:'Volt City deed',source:'land',category:'Land and deeds',worldId:'volt-city'}],entries=mainMarketEntries(items);
 const visible=filterMainMarket(entries,{source:'upgrade',category:'arcade',subcategory:'card-games',uses:['play'],query:'blackjack'});assert.equal(visible.length,1);assert.equal(visible[0].item,machine);assert.equal(filterMainMarket(entries,{source:'custom'})[0].item.id,'custom-sale');assert.equal(filterMainMarket(entries,{query:'artist'})[0].item.id,'custom-sale');assert.equal(filterMainMarket(entries,{source:'land',uses:['travel']})[0].item.worldId,'volt-city');assert.equal(filterMainMarket(entries,{source:'care'}).length,0);
});
test('main market pages mount the complete catalogue and its detailed controls',async()=>{
 for(const file of ['model-market.html','builder-market.html','index.html','members.html']){const html=await readFile(file,'utf8');assert.match(html,/data-shared-market-catalog/);assert.match(html,/public\/js\/shared-market-catalog.js/);}
 const source=await readFile('public/js/shared-market-catalog.js','utf8');for(const control of ['data-catalog-source','data-catalog-subcategory','data-catalog-use','data-catalog-category-toggle','data-catalog-reset'])assert.ok(source.includes(control),control);assert.match(source,/\/api\/market\/catalog/);
});
