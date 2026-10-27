import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_ECONOMY,GAME_BUNDLES,economyInventory,ownsEconomyItem} from '../game-economy.mjs';
import {SHIPPING_STOCK_ITEMS,SHIP_STOCK_TRADES,shippingStockQuantity} from '../public/js/shipping-market.js';
import {toolsPouchState} from '../public/js/tools-pouch-state.js';
import {GameEconomy} from '../public/js/game-economy-client.js';
import {marketCategory} from '../public/js/market-categories.js';
import {marketFacets,matchesMarketFilters} from '../public/js/market-facets.js';
import {validTool} from '../public/js/game-tool-rules.js';

test('delivered cargo is counted as port stock across the market and Tools pouch',()=>{
 const stock=SHIPPING_STOCK_ITEMS[0];
 const earned={...stock,id:'shipping-supply:'+stock.id,economySku:stock.sku,quantity:3,source:'shipping-delivery'};
 const state={items:[earned],memory:{},tokens:{MZK:0}};
 const catalog=economyInventory(state).find(item=>item.sku===stock.sku);
 assert.equal(catalog.owned,true);assert.equal(catalog.stock,3);
 assert.equal(catalog.priceMzk,0);assert.equal(catalog.earnedOnly,true);
 assert.equal(catalog.tradable,false);assert.equal(marketCategory(catalog),'shipping');
 assert.ok(marketFacets(catalog).uses.includes('shipping'));
 assert.equal(matchesMarketFilters(catalog,{uses:['trade'],query:'provisions'}),true);
 const client=new GameEconomy({inventory:{},announce(){},shop(){}});client.assets=[earned];
 const [asset]=client.ownedAssets();assert.equal(asset.type,'supplies');
 const pouch=toolsPouchState({records:[asset],economyItems:[catalog]});
 assert.equal(pouch.items[0].category,'supplies');assert.equal(pouch.items[0].disabled,false);
 assert.equal(pouch.items[0].actionLabel,'Exchange at shipping port');
 assert.match(pouch.items[0].status,/3 stock units/);assert.equal(pouch.items[0].active,false);
 assert.equal(validTool(stock.id),false);
 assert.equal(GAME_BUNDLES.some(bundle=>bundle.entries.some(entry=>entry.sku===stock.sku)),false);
});

test('empty stock has no ownership and cannot be consumed as a health supply',()=>{
 const stock=SHIPPING_STOCK_ITEMS[1],item={...stock,economySku:stock.sku,quantity:0};
 assert.equal(ownsEconomyItem({items:[item]},stock),false);
 assert.equal(shippingStockQuantity({items:[item,{...item,quantity:-1},{...item,quantity:Infinity}]},stock.id),0);
 const row=toolsPouchState({records:[item]}).items[0];
 assert.equal(row.category,'supplies');assert.equal(row.disabled,true);
 assert.match(row.status,/0 stock units/);assert.equal(row.actionLabel,'Exchange at shipping port');
});

test('port stock exchanges supply existing tools, building materials or a durable factory credit',()=>{
 for(const trade of SHIP_STOCK_TRADES){
  assert.ok(SHIPPING_STOCK_ITEMS.some(stock=>stock.id===trade.stockId));
  if(trade.productionCreditMzk){assert.equal(trade.id,'parts-production');assert.equal(trade.productionCreditMzk,20);assert.equal(trade.quantity,1);assert.equal(trade.cost,1);continue;}
  const target=GAME_ECONOMY.find(item=>item.sku===trade.sku);
  assert.ok(target,trade.sku);assert.ok(['tool','material'].includes(target.kind));
  assert.ok(Number.isSafeInteger(trade.quantity)&&trade.quantity>0);
  if(target.kind==='tool')assert.equal(validTool(target.toolId),true);
 }
 assert.ok(SHIP_STOCK_TRADES.some(trade=>trade.sku==='tool:fishing-pro-rod'));
 assert.ok(SHIP_STOCK_TRADES.some(trade=>trade.sku==='material:metal'));
});
