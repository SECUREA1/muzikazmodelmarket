import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogSupplyMetadata,catalogSupplyLabel,createCatalogSupplyIndex} from '../public/js/catalog-supply.js';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
import {createBuildingCatalog} from '../public/js/in-game-building-catalog.js';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';

test('Builder keeps depleted local supply distinct from world reserve and personal material credits',()=>{
 const raw={id:'wood',sku:'material:wood',materialId:'wood',buildAssetId:'material:wood',
  worldStock:1000,availableStock:0,supplyItemId:'material:wood',supplyMapId:'island-market',stock:7};
 const items=createBuildingCatalog([raw]),wood=items.find(item=>item.id==='material:wood');
 assert.equal(wood.availableStock,0);assert.equal(wood.worldStock,1000);
 assert.equal(wood.stock,7,'personal prepaid pieces are not warehouse supply');
 assert.equal(wood.supplyMapId,'island-market');assert.equal(wood.supplyItemId,'material:wood');
 assert.equal(catalogSupplyLabel(wood),'0 available at this map');
 assert.equal(wood.owned,false,'supply availability does not unlock an item');
 assert.equal(raw.availableStock,0);
});

test('native and GLB catalog normalization retain server supply identities without replacing authored functions',()=>{
 const metadata={worldStock:14,availableStock:3,supplyItemId:'backpack:builder-sofa',supplyMapId:'factory-yard'};
 const sofa=normalizeCatalogModel({id:'supplied-sofa',buildAssetId:'sofa',...metadata,function_data:{behavior:'seat',seatOffset:[0,.2,0]}});
 assert.deepEqual(catalogSupplyMetadata(sofa),metadata);assert.equal(sofa.function_data.behavior,'seat');
 const native=createBuildingCatalog([{sku:'backpack:builder-sofa',buildAssetId:'sofa',...metadata}]).find(item=>item.id==='sofa');
 assert.deepEqual(catalogSupplyMetadata(native),metadata);assert.equal(native.behavior,NATIVE_BUILDER_ITEMS.sofa.behavior);
 const glb=createBuildingCatalog([{id:'authored',sku:'repository:authored',modelUrl:'/public/models/avatars/DAX.glb',...metadata}]).find(item=>item.economySku==='repository:authored');
 assert.deepEqual(catalogSupplyMetadata(glb),metadata);
 assert.equal(glb.modelUrl,'/public/models/avatars/DAX.glb');
});

test('editor attaches shared live counts through existing native, material and encoded model aliases without minting ownership',()=>{
 const maps=[{id:'shipping-map',name:'Shipping warehouse',count:2}];
 const records=[
  {sku:'native:sofa',buildAssetId:'sofa',availableStock:0,worldStock:0,supplyItemId:'native:sofa',owned:true,basic:true,nativeMaps:maps},
  {sku:'material:metal',materialId:'metal',availableStock:32,worldStock:32,supplyItemId:'material:metal'},
  {id:'model:original',source:'model',model:{id:'original',modelUrl:'/public/models/A%20B.glb'},availableStock:9,worldStock:9,supplyItemId:'repository:original'}
 ];
 const attach=createCatalogSupplyIndex(records),sofa={id:'sofa',procedural:true,behavior:'seat'},result=attach(sofa);
 assert.equal(result.availableStock,0);assert.equal(result.supplyItemId,'native:sofa');
 assert.deepEqual(result.nativeMaps,maps);assert.equal(result.owned,undefined);assert.equal(result.basic,undefined);
 assert.deepEqual(sofa,{id:'sofa',procedural:true,behavior:'seat'},'native source remains unchanged');
 assert.equal(attach({id:'material:metal',procedural:true}).availableStock,32);
 assert.equal(attach({id:'legacy-model',modelUrl:'public/models/A B.glb?v=2'}).availableStock,9);
 assert.equal(attach({id:'original'}).supplyItemId,'repository:original');
 const custom={id:'unrelated',modelUrl:'/uploads/private.glb'};assert.equal(attach(custom),custom,'unrelated custom items get no invented stock');
});

test('an explicit SKU selects its exact server supply record and unknown or invalid counts are never shown as zero',()=>{
 const attach=createCatalogSupplyIndex([
  {sku:'native:shared',buildAssetId:'shared',availableStock:8,worldStock:8},
  {sku:'native:selected',buildAssetId:'shared',availableStock:0,worldStock:8,supplyMapId:'selected-map'}
 ]);
 assert.equal(attach({buildAssetId:'shared',economySku:'native:selected'}).availableStock,0);
 assert.equal(catalogSupplyLabel({}),'');assert.equal(catalogSupplyLabel({availableStock:-1}),'');
 assert.equal(catalogSupplyLabel({availableStock:Infinity}),'');
 assert.equal(catalogSupplyLabel({worldStock:0}),'0 in world stock');
 assert.deepEqual(catalogSupplyMetadata({worldStock:1.5,availableStock:'0',stock:99,owned:true}),{});
});
