import test from 'node:test';
import assert from 'node:assert/strict';
import {factoryInspectorMarkup} from '../public/js/world-supply-inspector.js';
import {worldFactoryPlan} from '../public/js/world-factory-recipes.js';
import {createFactoryProduction,advanceFactoryProduction} from '../world-factory-runtime.mjs';
import {supplyBuildPresentation} from '../public/js/world-supply-ui.js';

test('the scalable production inspector distinguishes a blueprint preview from recorded completed work',()=>{
 const item={sku:'native:inspector-console',name:'Console <test>',kind:'asset',buildAssetId:'factory-control-console'},plan={...worldFactoryPlan(item,2),itemId:item.sku,quantity:2};
 const preview=factoryInspectorMarkup({item:{...item,recipe:plan.recipe}});
 assert.match(preview,/viewBox="0 0 1000 115"/);assert.equal((preview.match(/data-inspect-stage=/g)||[]).length,4);
 assert.match(preview,/Console &lt;test&gt;/);assert.match(preview,/blueprint preview/);assert.match(preview,/Planned/);assert.doesNotMatch(preview,/verified stock receipts/);
 const job=createFactoryProduction(plan,{id:'inspector-batch',ownerId:'test-owner',now:1000});advanceFactoryProduction(job,job.readyAt);
 const output=factoryInspectorMarkup({item,job,stageId:'quality',trace:{lots:[{id:'production:inspector-batch',quantity:2,availableQuantity:0,packingReceipt:job.packingReceipt}],shipments:[{id:'inspector-shipment',destinationMapId:'world',quantity:2,phase:'delivered'}],stockReceipts:[{id:'stock:inspector-shipment',quantity:2,destinationMapId:'world'}]}});
 assert.match(output,/passed/);assert.match(output,/1 stock lots · 1 shipments · 1 verified stock receipts/);assert.match(output,/2 units credited to world/);assert.match(output,/Recorded production events/);
});

test('paused batch presentation stays frozen even while the local rendering clock advances',()=>{
 const job={phase:'paused',progress:37,remainingMs:8000,stages:[{name:'Assembly',phase:'paused'}],startedAt:1000,readyAt:10000};
 assert.deepEqual(supplyBuildPresentation(job,2000),supplyBuildPresentation(job,10000000));
 assert.equal(supplyBuildPresentation(job,10000000).progress,.37);
});
