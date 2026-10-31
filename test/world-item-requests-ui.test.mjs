import test from 'node:test';
import assert from 'node:assert/strict';
import {filterWorldItemRequests,worldItemRequestView,worldItemRequestCard,worldItemAICallCard,worldItemCallPage} from '../public/js/world-item-requests-ui.js';

const request={id:'request:lantern',itemId:'native:forge-lantern',itemName:'Emberglass Lantern',quantity:3,rewardMzk:600,phase:'claimed',claimedByMe:true,canFulfill:true,canCancel:true,source:'any',destinationMapId:'shop-map',address:{id:'address:shop-map:stall',name:'Lantern store',mapName:'Copper Quay'},requesterName:'Mara',deliveredQuantity:0,committedQuantity:0,fulfillableQuantity:3,shipmentIds:[],lotIds:[]};

test('request progress needs complete receiving quantity and cannot infer completion from production or sea timers',()=>{
 for(const phase of ['claimed','shipping','onward','partial']){
  const view=worldItemRequestView({...request,phase,readyAt:1,seaReceipt:{id:'sea-only'},deliveredQuantity:2});
  assert.equal(view.complete,false);assert.equal(view.deliveredQuantity,2);
 }
 const inconsistent=worldItemRequestView({...request,phase:'delivered',deliveredQuantity:2});
 assert.equal(inconsistent.complete,false);assert.equal(inconsistent.phase,'attention');
 const completed=worldItemRequestView({...request,phase:'delivered',deliveredQuantity:3,canClaim:true,canCancel:true,canFulfill:true});
 assert.equal(completed.complete,true);assert.equal(completed.canClaim,false);assert.equal(completed.canCancel,false);assert.equal(completed.canFulfill,false);assert.equal(completed.canMake,false);
});

test('world request filtering combines maker ownership, receiving map, progress and canonical item search',()=>{
 const rows=[request,{...request,id:'open',phase:'open',mine:true,claimedByMe:false,itemName:'Gate',itemId:'native:forge-iron-gate'},{...request,id:'finished',phase:'delivered',claimedByMe:false,deliveredQuantity:3,destinationMapId:'another-map'}];
 assert.deepEqual(filterWorldItemRequests(rows,{scope:'mine',search:'copper forge-lantern',mapId:'shop-map'}).map(row=>row.id),[request.id]);
 assert.deepEqual(filterWorldItemRequests(rows,{phase:'open'}).map(row=>row.id),['open']);
 assert.deepEqual(filterWorldItemRequests(rows,{phase:'delivered',mapId:'another-map'}).map(row=>row.id),['finished']);
 assert.equal(filterWorldItemRequests(rows,{scope:'mine',search:'nothing'}).length,0);
});

test('only the assigned maker gets source-compatible making controls and exact freight receipt references',()=>{
 const handMade=worldItemRequestCard({...request,source:'forge',shipmentIds:['shipment-a'],lotIds:['lot-a']});
 assert.match(handMade,/Forge by hand/);assert.doesNotMatch(handMade,/Make at World Item Factory/);assert.match(handMade,/Inspect exact freight receipts/);
 const factory=worldItemRequestCard({...request,source:'factory'});assert.match(factory,/Make at World Item Factory/);assert.doesNotMatch(factory,/Forge by hand/);
 const otherMaker=worldItemRequestCard({...request,claimedByMe:false,canFulfill:false,canCancel:false});assert.doesNotMatch(otherMaker,/data-request-action="(?:forge|factory|fulfill|cancel)"/);
 assert.deepEqual(worldItemRequestView({...request,shipmentIds:['shipment-a'],lotIds:['lot-a']}).reference,{shipmentId:'shipment-a',lotId:'lot-a'});
});

test('AI restock calls remain explicitly unfunded and offer review instead of a mutation or minted reward',()=>{
 const markup=worldItemAICallCard({id:'call:a',itemId:'native:forge-lantern',itemName:'Lantern',quantity:2,currentStock:0,address:request.address,reason:'The shop is out of lanterns.'});
 assert.match(markup,/AI RESTOCK CALL · UNFUNDED/);assert.match(markup,/Review & fund this call/);assert.match(markup,/data-request-action="select-call"/);assert.doesNotMatch(markup,/data-request-action="(?:create|claim|fulfill)"/);
});

test('stock calls beyond the first twelve remain reachable and map/item filters include calls without funded requests',()=>{
 const calls=Array.from({length:29},(_,index)=>({id:'call:'+index,itemId:index===27?'native:forge-lantern':'native:forge-dagger',itemName:index===27?'Lantern':'Dagger',mapId:index>23?'remote-harbor':'forge',mapName:index>23?'Remote Harbor':'Emberfall',addressName:'Shop '+index,contact:index===27?'Mara':'Quartermaster'}));
 const first=worldItemCallPage(calls),second=worldItemCallPage(calls,{page:1}),last=worldItemCallPage(calls,{page:2});
 assert.equal(first.calls.length,12);assert.equal(second.calls.length,12);assert.equal(last.calls.length,5);
 assert.deepEqual([...first.calls,...second.calls,...last.calls].map(call=>call.id),calls.map(call=>call.id),'every matching call can be reached through page controls');
 const filtered=worldItemCallPage(calls,{search:'lantern mara',mapId:'remote-harbor',page:7});
 assert.equal(filtered.total,1);assert.equal(filtered.page,0);assert.equal(filtered.calls[0].id,'call:27');
 assert.equal(worldItemCallPage(calls,{mapId:'missing-map'}).total,0);
});

test('dispatch controls count only the maker’s completed eligible item stock and allow partial batches',()=>{
 const noStock=worldItemRequestCard(request,{completedOwnedLots:[]});
 assert.match(noStock,/data-request-action="fulfill"[^>]* disabled/);assert.match(noStock,/Your completed, sealed stock: 0 available units/);
 const completedOwnedLots=[{itemId:'native:forge-lantern',availableQuantity:1,source:'forge'},{itemId:'native:forge-lantern',availableQuantity:4,source:'factory'},{itemId:'native:forge-dagger',availableQuantity:20,source:'forge'}];
 const handMade=worldItemRequestCard({...request,source:'forge'},{completedOwnedLots});
 assert.match(handMade,/Dispatch 1 completed owned unit/);assert.match(handMade,/Your completed, sealed stock: 1 available units/);
 const factory=worldItemRequestCard({...request,source:'factory'},{completedOwnedLots});assert.match(factory,/Dispatch 3 completed owned units/);
});

test('authored member and address names render as text rather than executable markup',()=>{
 const markup=worldItemRequestCard({...request,itemName:'<img src=x onerror=alert(1)>',requesterName:'<script>alert(2)</script>',address:{...request.address,name:'" onmouseover="alert(3)'}});
 assert.doesNotMatch(markup,/<script>|<img src=x/);assert.match(markup,/&lt;script&gt;/);assert.match(markup,/&quot; onmouseover=&quot;/);
});
test('per-request completed stock remains dispatchable when the bounded global lot list omits its item',()=>{
 const request={id:'older-lot-request',itemId:'native:forge-lantern',itemName:'Lantern',phase:'claimed',source:'forge',quantity:2,committedQuantity:0,deliveredQuantity:0,fulfillableQuantity:2,completedQuantity:2,claimedByMe:true,canFulfill:true};
 const card=worldItemRequestCard(request,{completedOwnedLots:[{id:'unrelated',itemId:'native:forge-dagger',availableQuantity:100,source:'forge'}]});
 assert.match(card,/Dispatch 2 completed owned units/);
 assert.doesNotMatch(card,/data-request-action="fulfill"[^>]*disabled/);
 const empty=worldItemRequestCard({...request,completedQuantity:0},{completedOwnedLots:[{itemId:request.itemId,availableQuantity:20,source:'forge'}]});
 assert.match(empty,/data-request-action="fulfill"[^>]*disabled/,'the authoritative zero also overrides an outdated list');
});
