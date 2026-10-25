import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEconomy} from '../public/js/game-economy-client.js';
test('client gates locked upgrades, keeps basics free, and prevents duplicate use while paying',async()=>{
 let calls=0,shops=0,release;
 const client=new GameEconomy({inventory:{economyAction:async()=>{calls++;await new Promise(resolve=>release=resolve);return {balanceAfterMzk:98};}},announce(){},shop(){shops++;}});
 assert.equal((await client.use('material:studs')).ok,true);assert.equal(calls,0);
 assert.equal((await client.use('tool:scanner')).ok,false);assert.equal(shops,1);assert.equal(calls,0);
 client.items=[{sku:'tool:scanner',name:'Scanner',owned:true,useCostMzk:2}];
 const first=client.use('tool:scanner');assert.equal((await client.use('tool:scanner')).ok,false);assert.equal(calls,1);
 release();assert.equal((await first).balance,98);
 client.items=[];assert.equal((await client.use('tool:scanner')).ok,false,'selling an upgrade removes client access');
});

test('placement resolves material and catalogue aliases to the same ownership SKU',()=>{
 const client=new GameEconomy({inventory:{},announce(){},shop(){}});client.items=[{kind:'material',id:'bench',materialId:'bench',sku:'material:bench',owned:false},{kind:'asset',id:'chair',buildAssetId:'armchair',sku:'backpack:chair',owned:false}];
 assert.equal(client.skuForAsset({id:'bench',buildAssetId:'bench'}),'material:bench');assert.equal(client.skuForAsset({id:'preview',materialId:'bench'}),'material:bench');assert.equal(client.skuForAsset({id:'copy',sourceId:'chair'}),'backpack:chair');assert.equal(client.owns(client.skuForAsset({buildAssetId:'armchair'})),false);
});

test('catalogue decoration preserves exact GLB and native variant purchase identities',()=>{
 const client=new GameEconomy({inventory:{},announce(){},shop(){}});
 client.items=[
  {kind:'asset',id:'avatar',sku:'model:avatar',modelUrl:'/avatar.glb',owned:true,useCostMzk:2},
  {kind:'asset',id:'companion',sku:'model:companion',modelUrl:'/avatar.glb',owned:false,priceMzk:600},
  {kind:'asset',id:'chair',sku:'native:chair',buildAssetId:'armchair',owned:true},
  {kind:'asset',id:'chair-variant',sku:'native:chair-variant',buildAssetId:'armchair',owned:false,priceMzk:200}
 ];
 function button(dataset){const badge={},classes=new Map();return {dataset,classes,badge,classList:{toggle:(name,value)=>classes.set(name,value)},closest:()=>null,querySelector:()=>badge};}
 const buttons=[
  button({placeBuildAsset:'catalog-companion',economySku:'model:companion'}),
  button({buildAsset:'armchair',economySku:'native:chair-variant'}),
  button({placeBuildAsset:'catalog-avatar',economySku:'model:avatar'}),
  button({buildAsset:'armchair'}),
  button({buildAsset:'catalog-unknown',economySku:'model:unknown'})
 ];
 const original=globalThis.document;
 globalThis.document={querySelector:()=>null,querySelectorAll:()=>buttons};
 try{
  client.decorate();client.decorate();
  assert.deepEqual(buttons.map(item=>item.dataset.economySku),['model:companion','native:chair-variant','model:avatar','native:chair','model:unknown']);
  assert.deepEqual(buttons.map(item=>item.classes.get('economy-locked')),[true,true,false,false,true]);
  assert.equal(buttons[0].badge.textContent,'🔒 600 MZK');
  assert.equal(buttons[1].badge.textContent,'🔒 200 MZK');
  assert.equal(buttons[2].badge.textContent,'2 MZK / use');
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});

test('catalogue click gate checks the exact decorated SKU before delegation',()=>{
 const shops=[],announcements=[],client=new GameEconomy({inventory:{},announce:value=>announcements.push(value),shop:sku=>shops.push(sku)});
 client.items=[{sku:'model:avatar',owned:true},{sku:'model:companion',owned:false,name:'Companion',priceMzk:600,useCostMzk:2}];
 let listener;client.install({addEventListener:(name,handler,capture)=>{assert.equal(name,'click');assert.equal(capture,true);listener=handler;}});
 const invoke=sku=>{const blocked=[];listener({target:{closest:()=>({dataset:{economySku:sku}})},preventDefault:()=>blocked.push('prevent'),stopImmediatePropagation:()=>blocked.push('stop')});return blocked;};
 assert.deepEqual(invoke('model:avatar'),[]);
 assert.deepEqual(invoke('model:companion'),['prevent','stop']);
 assert.deepEqual(shops,['model:companion']);assert.match(announcements[0],/Companion is locked/);
});
