import test from 'node:test';
import assert from 'node:assert/strict';
import {factoryAddressOrderUrl,supplyAddressMatches,supplyAddressMarkup,supplyAddressRoute,deliveryObjectId} from '../public/js/world-supply-address-ui.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';

test('public supply links carry only receiving identity and optional canonical product identity',()=>{
 const id='address:plot%3Adeed-home:shop/one',url=new URL(factoryAddressOrderUrl(id,{itemId:'native:chair'}),'https://world.example/');
 assert.equal(url.pathname,'/model-explorer.html');assert.equal(url.searchParams.get('environment'),'world-item-factory');assert.equal(url.searchParams.get('supplyAddress'),id);assert.equal(url.searchParams.get('supplyItem'),'native:chair');
 assert.deepEqual([...url.searchParams.keys()],['environment','autoplay','supplyAddress','supplyItem']);
});

test('address cards show the actual public recipient and map coordinates without exposing account fields',()=>{
 const address={id:'address:city:shop',name:'Baker <shop>',addressLine:'12 Market Lane',mapId:'city',mapName:'City',owner:{kind:'member',name:'<Alice>',walletId:'private-wallet'},recipientId:'private-recipient',position:{x:12,y:0,z:-8},canOrder:true};
 const markup=supplyAddressMarkup(address);assert.match(markup,/Baker &lt;shop&gt;/);assert.match(markup,/Owner \/ recipient: &lt;Alice&gt;/);assert.match(markup,/12 Market Lane/);assert.match(markup,/X 12.0 · Y 0.0 · Z -8.0/);assert.doesNotMatch(markup,/private-wallet|private-recipient/);
 assert.equal(supplyAddressMatches(address,'alice market'),true);assert.equal(supplyAddressMatches(address,'unknown'),false);
});

test('an address-specific route never reuses a different store doorway on the same map',()=>{
 const first={addressId:'address:city:first',mapId:'city'},second={addressId:'address:city:second',mapId:'city'};
 assert.equal(supplyAddressRoute({deliveryRoutes:[first,second]},second.addressId),second);assert.equal(supplyAddressRoute({deliveryRoutes:[first]},second.addressId),null);
});

test('merchandise selection resolves the stable placed fixture identity through display wrappers',()=>{
 const fixture={userData:{builderObjectId:'building-owned-7'}},display={userData:{storeProductDisplay:true,storeProductIdentity:'native:chair'},parent:fixture},mesh={userData:{},parent:display};
 assert.equal(deliveryObjectId(mesh),'building-owned-7');assert.equal(deliveryObjectId({userData:{modelId:'general-store'}}),null,'a catalog model ID is not a physical address');
});

test('template store identities distinguish public layout stalls and placed mall scene stores',()=>{
 const layout={userData:{layout:'mega-mall'}},shop={userData:{deliveryAddressLocalId:'layout-shop-2'},parent:layout};
 assert.equal(deliveryObjectId(shop),'layout-shop-2');
 layout.parent={userData:{builderObjectId:'placed-mall-7'}};
 assert.equal(deliveryObjectId({userData:{storeProductDisplay:true},parent:shop}),'placed-mall-7/layout-shop-2');
});

test('rendered vendor, market and mall scenes expose the same stable per-store public identities as delivery',()=>{
 for(const [layout,count,last]of [['vendor-street',10,'layout-shop-4-east'],['market-square',10,'layout-shop-9'],['mega-mall',4,'layout-shop-3']]){
  const root=createBuilderModel('scene-'+layout),shops=[];root.traverse(node=>{if(node.userData.deliveryAddressLocalId)shops.push(node);});
  assert.equal(shops.length,count);assert.equal(deliveryObjectId(shops.at(-1)),last);
  root.userData.builderObjectId='activity-scene-7';root.position.set(20,0,40);root.rotation.y=Math.PI/2;root.scale.setScalar(2);
  assert.equal(deliveryObjectId(shops.at(-1)),'activity-scene-7/'+last,'moving, rotating and scaling the scene cannot change a store identity');
 }
});
