import test from 'node:test';
import assert from 'node:assert/strict';
import {FORGE_TRADE_POLICIES,forgeTradeItem,forgeRouteView,forgeCommerceTarget} from '../public/js/forge-trade-policy.js';
import {FORGE_RECIPES} from '../public/js/forge-recipes.js';
import {FORGE_ITEMS} from '../public/js/forge-items.js';

test('forge trade desk points to the same priced native product in the workshop, market and 3D preview',()=>{
 for(const recipe of FORGE_RECIPES){
  const item=forgeTradeItem(recipe.id);
  assert.equal(item.sku,'native:'+recipe.buildAssetId);assert.equal(item.name,FORGE_ITEMS[recipe.buildAssetId].name);
  assert.equal(item.kitPriceMzk,recipe.costMzk);assert.equal(item.marketPriceMzk,FORGE_ITEMS[recipe.buildAssetId].priceMzk);
  assert.deepEqual(item.materials,recipe.materials);assert.notEqual(item.materials,recipe.materials);
  assert.equal(new URL(item.productUrl,'https://game.invalid/').searchParams.get('id'),'upgrade:'+item.sku);
  assert.match(item.image,new RegExp('/'+recipe.buildAssetId+'\\.svg\\?v='));
 }
 assert.equal(forgeTradeItem('__proto__'),null);
 assert.equal(FORGE_TRADE_POLICIES.length,6);assert.ok(FORGE_TRADE_POLICIES.every(Object.isFrozen));
});

test('visible route progress never turns a timer, matching SKU or sea-only receipt into delivered stock',()=>{
 assert.equal(forgeRouteView().phase,'kit');
 const job={id:'work-a',recipeId:FORGE_RECIPES[0].id,status:'processing',stage:'heat',readyAt:1};
 assert.equal(forgeRouteView({job}).phase,'work');assert.equal(job.status,'processing');
 Object.assign(job,{status:'collected',itemId:'forge-item:work-a'});
 assert.equal(forgeRouteView({job}).phase,'backpack');
 Object.assign(job,{exportedAt:2,exportLotId:'lot-a'});
 const supply={lots:[{id:'lot-a',quantity:1}],allocations:[{shipmentId:'ship-a',phase:'allocated',lots:[{lotId:'lot-a',quantity:1}]}],shipments:[{id:'ship-a',itemId:'native:'+FORGE_RECIPES[0].id,phase:'port-received',seaReceipt:{id:'sea-a'},destinationMapId:'public-commons',contractId:'route-a'}],stockReceipts:[{id:'other-stock',shipmentId:'other-ship',quantity:1,destinationMapId:'public-commons',lotAllocations:[{lotId:'lot-a',quantity:1}]}]};
 const view=forgeRouteView({job,supply});assert.equal(view.phase,'destination');assert.equal(view.delivered,false);assert.equal(view.references.stockReceiptId,null);
 supply.shipments[0].phase='delivered';assert.equal(forgeRouteView({job,supply}).delivered,false,'a phase label alone is not inventory confirmation');
 supply.allocations[0].phase='delivered';supply.stockReceipts.push({id:'stock-a',shipmentId:'ship-a',destinationMapId:'public-commons',quantity:1,lotAllocations:[{lotId:'lot-a',quantity:1}]});
 const delivered=forgeRouteView({job,supply});assert.equal(delivered.delivered,true);assert.equal(delivered.phase,'delivered');assert.equal(delivered.references.stockReceiptId,'stock-a');assert.ok(delivered.steps.every(step=>step.state==='complete'));
});

test('compact private presentation requires its exact lot link and verified destination receipt marker',()=>{
 const job={id:'work-a',status:'collected',itemId:'forge-item:work-a',exportedAt:1,exportLotId:'lot-a'},supply={lots:[{id:'lot-a',quantity:1}],shipments:[{id:'ship-a',phase:'delivered',lotIds:['other-lot'],stockConfirmed:true,stockReceiptId:'stock-a',destinationMapId:'public-commons'}]};
 assert.equal(forgeRouteView({job,supply}).delivered,false);
 supply.shipments[0].lotIds=['lot-a'];supply.shipments[0].stockConfirmed=false;
 assert.equal(forgeRouteView({job,supply}).delivered,false);
 supply.shipments[0].stockConfirmed=true;delete supply.shipments[0].stockReceiptId;
 assert.equal(forgeRouteView({job,supply}).delivered,false);
 supply.shipments[0].stockReceiptId='stock-a';assert.equal(forgeRouteView({job,supply}).delivered,true);
});

test('shipment cancellation distinguishes returned source stock from a receiving-port hold',()=>{
 const job={status:'collected',exportedAt:1,exportLotId:'lot-a'},supply={allocations:[{shipmentId:'ship-a',phase:'returned',lots:[{lotId:'lot-a',quantity:1}]}],shipments:[{id:'ship-a',phase:'cancelled'}]};
 const returned=forgeRouteView({job,supply});assert.equal(returned.phase,'warehouse');assert.equal(returned.portHeld,false);assert.equal(returned.delivered,false);
 supply.shipments[0].seaReceipt={id:'sea-a'};
 const held=forgeRouteView({job,supply});assert.equal(held.phase,'destination');assert.equal(held.portHeld,true);assert.equal(held.delivered,false);
 assert.equal(held.references.backpackItemId,null,'cancellation cannot fabricate a Backpack record');
});

test('a new selected recipe cannot redirect inspection of the previously sealed workpiece',()=>{
 const collected=FORGE_RECIPES[0],selected=FORGE_RECIPES[1],job={id:'old-work',recipeId:collected.id,status:'collected',exportedAt:1,exportLotId:'old-lot'};
 const supply={lots:[{id:'old-lot',quantity:1}],shipments:[{id:'old-shipment',lotIds:['old-lot'],phase:'queued'}]};
 const details={selectedRecipeId:selected.id,job,supply};
 assert.deepEqual(forgeCommerceTarget({...details,destination:'market'}),{sku:'native:'+selected.buildAssetId,itemId:'native:'+selected.buildAssetId});
 assert.deepEqual(forgeCommerceTarget({...details,destination:'supply'}),{sku:'native:'+collected.buildAssetId,itemId:'native:'+collected.buildAssetId,lotId:'old-lot',shipmentId:'old-shipment',section:'trace',sourceMapId:'factory',quantity:1});
});

test('partial multi-lot stock confirmation follows the selected lot receipt',()=>{
 const job={status:'collected',exportedAt:1,exportLotId:'lot-a'};
 const shipment={id:'ship-a',phase:'delivered',lotIds:['lot-a','lot-b'],stockConfirmed:false,stockReceiptId:null,lotReceipts:[{lotId:'lot-a',quantity:1,stockConfirmedQuantity:1,stockConfirmed:true,stockReceiptId:'receipt-a'},{lotId:'lot-b',quantity:1,stockConfirmedQuantity:0,stockConfirmed:false,stockReceiptId:null}]};
 const view=forgeRouteView({job,supply:{shipments:[shipment]}});
 assert.equal(view.delivered,true);assert.equal(view.references.stockReceiptId,'receipt-a');
 const other=forgeRouteView({job:{...job,exportLotId:'lot-b'},supply:{shipments:[{...shipment,stockConfirmed:true,stockReceiptId:'aggregate'}]}});
 assert.equal(other.delivered,false);assert.equal(other.references.stockReceiptId,null);
 const missing=forgeRouteView({job,supply:{shipments:[{...shipment,stockConfirmed:true,stockReceiptId:'aggregate',lotReceipts:[]}]}});
 assert.equal(missing.delivered,false,'an explicit empty per-lot receipt list cannot fall back to aggregate credit');
});
