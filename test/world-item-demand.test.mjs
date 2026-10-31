import test from 'node:test';
import assert from 'node:assert/strict';
import {worldItemDemandCalls} from '../world-item-demand.mjs';
import {deliveryAddressId,mapDeliveryAddresses} from '../world-delivery-addresses.mjs';

const catalog=[
 {supplyId:'native:forge-damascus-blade',buildAssetId:'forge-damascus-blade',name:'Stormfold Damascus Blade'},
 {supplyId:'native:forge-lantern',buildAssetId:'forge-lantern',name:'Emberglass Lantern'},
 {supplyId:'native:forge-pickaxe',buildAssetId:'forge-pickaxe',name:'Deepvein Pickaxe'},
 {supplyId:'tool:repair-tool',sku:'tool:repair-tool',name:'Repair Tool'},
 {supplyId:'blueprint:private-design',name:'Private secret design',privateFactoryBlueprint:true}
];
function fixture(){
 const map={id:'public-forge',name:'Forge Market',visibility:'public',playable:true,ownerId:'muzikaz',category:'Forge & metallurgy',spawn:{x:0,y:0,z:0},builderScene:{objects:[
  {id:'shop',modelId:'market-atm',name:'Metalwork shop',position:{x:4,y:0,z:4},functionalSettings:{device:'market-atm',storeProductIds:['forge-lantern','forge-damascus-blade','missing-design','blueprint:private-design']}},
  {id:'decor',modelId:'material:display-plinth',position:{x:5,y:0,z:4},functionalSettings:{storeProductIds:['forge-pickaxe']}}
 ]}};
 const data={users:{},landDeeds:{},worldSupply:{maps:{'public-forge':{stock:{'native:forge-lantern':1}}},factoryStock:{'native:forge-damascus-blade':0},production:{incomplete:{phase:'building',itemId:'native:forge-damascus-blade',quantity:99}}}};
 const rooms={'public-forge':{simulation:{actors:{smith:{id:'smith',name:'Brann Emberhand',active:true,health:100,position:{x:1,y:0,z:1},resident:{isAI:true,forge:true,name:'Brann Emberhand',role:'Master smith'}}}}}};
 return {data,maps:[map],rooms,catalog};
}

test('world calls use real addresses and canonical items while leaving stock, production and wallets untouched',()=>{
 const input=fixture(),before=structuredClone(input),calls=worldItemDemandCalls(input);
 assert.ok(calls.some(call=>call.kind==='shop'));assert.ok(calls.some(call=>call.kind==='ai'));
 assert.equal(new Set(calls.map(call=>call.id)).size,calls.length);
 for(const call of calls){
  const address=mapDeliveryAddresses(input.data,input.maps[0],input.rooms['public-forge']).find(row=>row.id===call.addressId);
  assert.ok(address);assert.equal(call.addressRevision,address.revision);assert.equal(call.mapId,'public-forge');assert.equal(call.funded,false);
  assert.equal(call.stockScope,'map');assert.ok(catalog.some(item=>item.supplyId===call.itemId&&!item.privateFactoryBlueprint));
  assert.equal(call.shortfall,call.targetQuantity-call.currentStock);assert.equal(call.quantity,call.shortfall);
 }
 const lantern=calls.find(call=>call.kind==='shop'&&call.itemId==='native:forge-lantern');assert.equal(lantern.currentStock,1);assert.equal(lantern.quantity,1);assert.equal(lantern.source,'forge');
 assert.deepEqual(input,before,'suggestions cannot mutate or finish production, seed stock, or grant MZK');
 assert.deepEqual(worldItemDemandCalls(input),calls,'same authoritative world state produces stable calls');
});

test('shared destination stock closes every fulfilled deficit, without claiming empty per-store inventory',()=>{
 const input=fixture();input.data.worldSupply.maps['public-forge'].stock={'native:forge-lantern':2,'native:forge-damascus-blade':2};
 assert.deepEqual(worldItemDemandCalls(input),[]);
 input.data.worldSupply.maps['public-forge'].stock['native:forge-damascus-blade']=0;
 const calls=worldItemDemandCalls(input);assert.ok(calls.length);assert.ok(calls.every(call=>call.itemId==='native:forge-damascus-blade'));
 assert.ok(calls.every(call=>call.stockLabel==='Shared receiving map stock'));
});

test('only live server residents create AI calls; hidden stores, private maps and private blueprints stay out',()=>{
 const input=fixture();input.maps[0].builderScene.actors=[{id:'fake-authored-ai',resident:{isAI:true,name:'Fake actor'}}];
 const actor=input.rooms['public-forge'].simulation.actors.smith;actor.active=false;
 assert.ok(worldItemDemandCalls(input).every(call=>call.kind!=='ai'));
 delete input.rooms['public-forge'];assert.ok(worldItemDemandCalls(input).every(call=>call.kind!=='ai'));
 input.maps[0].builderScene.objects[0].visible=false;
 assert.deepEqual(worldItemDemandCalls(input),[]);
 input.maps[0].visibility='private';assert.deepEqual(worldItemDemandCalls(input),[]);
});

test('deed calls belong to the current deed holder and sanitize public contact labels',()=>{
 const owner='account:alice-secret',other='account:bob-secret',data={users:{[owner]:{items:[{id:'deed-a',type:'land-deed'}],memory:{profile:{displayName:'<Alice>\nOwner'}}},[other]:{items:[]}},landDeeds:{a:{id:'deed-a',status:'active',ownerId:owner,name:'Workshop deed'}}};
 const maps=[{id:'plot-deed-a',name:'Workshop',visibility:'public',ownerId:owner,builderScene:{objects:[]},spawn:{x:0,y:0,z:0}}];
 const own=worldItemDemandCalls({data,maps,catalog,walletId:owner});assert.equal(own.length,1);assert.equal(own[0].kind,'deed');assert.equal(own[0].addressId,deliveryAddressId(maps[0].id,'entrance'));assert.equal(own[0].contact,'AliceOwner');
 assert.deepEqual(worldItemDemandCalls({data,maps,catalog,walletId:other}),[]);assert.deepEqual(worldItemDemandCalls({data,maps,catalog}),[]);
 assert.ok(!JSON.stringify(own).includes(owner));assert.ok(!JSON.stringify(own).includes(other));
});

test('calls are bounded and an existing funded call is not offered for funding a second time',()=>{
 const input=fixture(),first=worldItemDemandCalls(input)[0];
 input.data.worldSupply.itemRequests={funded:{originCallId:first.id,phase:'open'}};
 assert.ok(!worldItemDemandCalls(input).some(call=>call.id===first.id));
 const maps=Array.from({length:80},(_,index)=>({...input.maps[0],id:'map-'+index}));
 const bounded=worldItemDemandCalls({...input,maps,limit:7,perMap:1});assert.equal(bounded.length,7);assert.equal(new Set(bounded.map(call=>call.mapId)).size,7);
 assert.deepEqual(worldItemDemandCalls({...input,limit:0}),[]);
});

test('funded but unfinished maker requests reduce the deficit without counting them as delivered inventory',()=>{
 const input=fixture();input.data.worldSupply.itemRequests={blade:{id:'blade',destinationMapId:'public-forge',itemId:'native:forge-damascus-blade',quantity:2,deliveredQuantity:0,phase:'attention'},lantern:{id:'lantern',destinationMapId:'public-forge',itemId:'native:forge-lantern',quantity:1,deliveredQuantity:0,phase:'open'}};
 assert.deepEqual(worldItemDemandCalls(input),[],'a funded pending order already covers these map deficits');
 input.data.worldSupply.itemRequests.blade.phase='cancelled';
 const calls=worldItemDemandCalls(input);assert.ok(calls.length);assert.ok(calls.every(call=>call.itemId==='native:forge-damascus-blade'&&call.currentStock===0&&call.pendingQuantity===0));
 input.data.worldSupply.itemRequests.blade={...input.data.worldSupply.itemRequests.blade,phase:'shipping',quantity:1};
 const partial=worldItemDemandCalls(input);assert.ok(partial.every(call=>call.quantity===1&&call.currentStock===0&&call.pendingQuantity===1));
});

test('an AI resident walking through its normal routine keeps its home receiving call stable',()=>{
 const input=fixture(),actor=input.rooms['public-forge'].simulation.actors.smith;actor.resident.home={...actor.position};
 const original=worldItemDemandCalls(input).find(call=>call.kind==='ai');
 actor.position={x:4,y:0,z:4};
 assert.deepEqual(worldItemDemandCalls(input).find(call=>call.kind==='ai'),original);
});

test('the current map remains visible beyond the global board limits without changing call identities',()=>{
 const input=fixture(),currentMap=input.maps[0];currentMap.id='zz-current-forge';
 input.rooms[currentMap.id]=input.rooms['public-forge'];delete input.rooms['public-forge'];
 const earlierMaps=Array.from({length:100},(_,index)=>({...currentMap,id:'map-'+String(index).padStart(3,'0')}));
 const options={...input,maps:[...earlierMaps,currentMap]},before=structuredClone(options);
 assert.ok(worldItemDemandCalls(options).every(call=>call.mapId!==currentMap.id),'earlier stocked facilities fill the ordinary 48-call board');
 const expected=worldItemDemandCalls({...input,maps:[currentMap]}),preferred=worldItemDemandCalls({...options,mapId:currentMap.id});
 assert.deepEqual(preferred.filter(call=>call.mapId===currentMap.id),expected,'the current map keeps the exact same canonical calls');
 assert.equal(preferred[0].mapId,currentMap.id);assert.equal(preferred.length,48);assert.ok(preferred.some(call=>call.kind==='ai'&&call.mapId===currentMap.id));
 assert.deepEqual(worldItemDemandCalls({...options,preferredMapId:currentMap.id}),preferred);assert.deepEqual(options,before);
 const beyondMapLimit=Array.from({length:300},(_,index)=>({...currentMap,id:'map-'+String(index).padStart(3,'0')}));
 assert.equal(worldItemDemandCalls({...options,maps:[...beyondMapLimit,currentMap],mapId:currentMap.id,limit:1})[0].mapId,currentMap.id,'map priority precedes the 256-map scan bound too');
});
