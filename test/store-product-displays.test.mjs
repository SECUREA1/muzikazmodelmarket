import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createStoreProductDisplays,storeDisplayProducts,storeDisplaySlots,storeProductIdentity,storeProductLabel,STORE_DISPLAY_LIMITS} from '../public/js/store-product-displays.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const plinth=(x=0)=>{const root=new T.Group();root.userData.modelId='material:display-plinth';root.position.x=x;return root;};
function source(){
 const root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(2,4,6),new T.MeshStandardMaterial({color:0x56afc6}));
 root.position.set(10,-3,5);mesh.position.set(2,1,-1);mesh.userData={builderRoot:root,mediaScreen:true,device:'screen',builderObjectId:'real-device'};root.userData={builderObjectId:'real-actor',interactiveDevice:'market-atm'};root.add(mesh,new T.PointLight(0xffffff,3));return root;
}
const records=[
 {id:'native-offer',sku:'native:chest',buildAssetId:'treasure-chest',priceMzk:50,name:'Native chest'},
 {id:'upload-offer',asset:{id:'upload-asset',name:'Uploaded sculpture',glb_url:'/uploads/sculpture.glb'},price_mzk:90},
 {id:'generated-offer',name:'Generated piece',generated:true,generator:{kind:'crystal'},priceMzk:70}
];

test('physical product selection preserves sale identities while deduplicating aliases and showing model sources',()=>{
 const alias={...records[0],id:'same-chest',sku:'another:chest',name:'Alias chest'};
 const products=storeDisplayProducts([records[0],alias,records[1],records[2]]);
 assert.equal(products.length,3);assert.deepEqual(products.map(item=>item.record),records);
 assert.deepEqual(products.map(item=>item.identity),['native:chest','upload-offer','generated-offer']);
 assert.equal(products[1].item.model,'/uploads/sculpture.glb');assert.deepEqual(products[2].item.generator,{kind:'crystal'});
 assert.deepEqual(storeProductLabel(records[1]),{name:'Uploaded sculpture',price:'90 MZK'});assert.equal(storeProductLabel({name:'Unpriced',priceMzk:0}).price,'View current offer');assert.equal(storeProductLabel({basic:true}).price,'Basic kit · free');
 assert.notEqual(storeProductIdentity({sellerId:'alice',itemId:'same-item'}),storeProductIdentity({sellerId:'bob',itemId:'same-item'}));assert.equal(storeProductIdentity({listing_id:'listing-7'}),'builder:listing-7');
});

test('different product-card content retains distinct offers and cached templates',async()=>{
 const cards=[{id:'harbor-deed',name:'Harbor plot',category:'Land deeds'},{id:'forest-deed',name:'Forest plot',category:'Land deeds'}],selected=storeDisplayProducts(cards);
 assert.equal(selected.length,2);assert.notEqual(selected[0].key,selected[1].key);
 const bundles=storeDisplayProducts([{id:'food-kit',name:'Supply kit',entries:[{name:'Carrot',quantity:2}]},{id:'fish-kit',name:'Supply kit',entries:[{name:'Fish',quantity:2}]}]);assert.equal(bundles.length,2);assert.notEqual(bundles[0].key,bundles[1].key);
 const hosts=[plinth(),plinth(2)],loaded=[];
 const manager=createStoreProductDisplays({THREE:T,getRoots:()=>hosts,getPosition:()=>new T.Vector3(),loadProducts:async()=>cards,loadModel:async item=>{loaded.push(item.name);const root=source();root.name=item.name;return {root};},disposeModel:()=>{}});
 manager.update(.5);await flush();manager.update(.5);await flush();assert.deepEqual(loaded,cards.map(card=>card.name));assert.equal(manager.snapshot().cachedSources,2);assert.equal(manager.snapshot().active,2);
 for(const [index,host]of hosts.entries())assert.ok(host.getObjectByName('STORE_PRODUCT_DISPLAY').getObjectByName(cards[index].name));manager.dispose();
});

test('nearby native, uploaded and generated merchandise fits its shelf and remains a cosmetic copy',async()=>{
 const roots=[plinth(),plinth(2),plinth(4)],sources=[],disposed=[],seen=[];
 const manager=createStoreProductDisplays({THREE:T,getRoots:()=>roots,getPosition:()=>new T.Vector3(),loadProducts:async()=>records,loadModel:async item=>{seen.push(item);const root=source();sources.push(root);return {root,THREE:T};},disposeModel:root=>disposed.push(root)});
 manager.update(.5);await flush();manager.update(.5);await flush();
 assert.equal(manager.snapshot().active,3);assert.equal(seen.length,3);
 for(const [index,host]of roots.entries()){
  host.updateMatrixWorld(true);const display=host.getObjectByName('STORE_PRODUCT_DISPLAY'),model=display.children[0],bounds=new T.Box3().setFromObject(model,true),size=bounds.getSize(new T.Vector3());
  assert.ok(size.x<=.940001&&size.y<=1.200001&&size.z<=.940001);assert.ok(Math.abs(bounds.min.y-.605)<1e-6);assert.ok(Math.abs(bounds.getCenter(new T.Vector3()).x-host.position.x)<1e-6);
  display.traverse(node=>{assert.equal(node.userData.collisionDisabled,true);assert.equal(node.userData.collider,false);assert.equal(node.userData.builderObjectId,undefined);assert.equal(node.userData.mediaScreen,undefined);assert.equal(node.userData.interactiveDevice,undefined);assert.equal(node.isLight,undefined);});
  assert.equal(manager.productFor(model.children[0]),records[index]);
 }
 for(const root of sources){assert.equal(root.userData.builderObjectId,'real-actor');assert.equal(root.children[0].userData.builderRoot,root);assert.ok(root.children[1].isLight);}
 manager.dispose();assert.equal(disposed.length,3);assert.ok(roots.every(root=>!root.getObjectByName('STORE_PRODUCT_DISPLAY')));
});

test('display loads are lazy, bounded, shared between slots and reused after walking away',async()=>{
 const host=plinth(),hosts=[host,plinth(2),plinth(4)],position=new T.Vector3(500,0,0),selected=[],disposed=[];let fetches=0,loads=0;
 const manager=createStoreProductDisplays({THREE:T,getRoots:()=>hosts,getPosition:()=>position,loadProducts:async()=>{fetches++;return [records[0],{...records[0],id:'alias',sku:'alias'}];},loadModel:async()=>{loads++;return {root:source()};},disposeModel:root=>disposed.push(root),onSelect:record=>selected.push(record)});
 manager.update(.5);await flush();assert.equal(fetches,0);assert.equal(loads,0);
 position.set(0,0,0);manager.update(.5);await flush();manager.update(.5);await flush();assert.equal(fetches,1);assert.equal(loads,1);assert.equal(manager.snapshot().active,3);
 const display=host.getObjectByName('STORE_PRODUCT_DISPLAY');assert.equal(manager.select(display.children[0]),true);assert.deepEqual(selected,[records[0]]);assert.equal(selected[0].priceMzk,50);
 const raycaster=new T.Raycaster(new T.Vector3(0,1,-3),new T.Vector3(0,0,1));raycaster.intersectObjects=()=>assert.fail('merchandise triangles must not be raycast');
 const hit=manager.pick(raycaster);assert.equal(hit.product,records[0]);assert.ok(hit.distance>2&&hit.distance<3);assert.equal(manager.pick(raycaster,1),null);
 position.set(100,0,0);manager.update(.5);assert.equal(manager.snapshot().active,0);
 position.set(0,0,0);manager.update(.5);await flush();assert.equal(loads,1);assert.equal(fetches,1);assert.equal(manager.snapshot().active,3);
 manager.dispose();assert.equal(disposed.length,1,'shared source is released once after all copies');
});

test('the six-slot, two-request budget cancels queued work and disposes late models on world exit',async()=>{
 const hosts=Array.from({length:12},(_,i)=>plinth(i)),pending=[],disposed=[];
 const manager=createStoreProductDisplays({THREE:T,maxDisplays:100,getRoots:()=>hosts,getPosition:()=>new T.Vector3(),loadProducts:async()=>Array.from({length:12},(_,i)=>({...records[0],id:'offer-'+i,buildAssetId:'native-'+i})),loadModel:(item,{signal})=>new Promise(resolve=>pending.push({resolve,signal})),disposeModel:root=>disposed.push(root)});
 manager.update(.5);await flush();manager.update(.5);await flush();
 assert.equal(pending.length,STORE_DISPLAY_LIMITS.concurrentLoads);assert.equal(manager.snapshot().pending,2);assert.equal(manager.snapshot().queued,4);assert.equal(manager.snapshot().fixtures.filter(item=>item.status==='loading').length,6);
 manager.dispose();assert.ok(pending.every(item=>item.signal.aborted));for(const item of pending)item.resolve({root:source()});await flush();await flush();
 assert.equal(disposed.length,2);assert.equal(pending.length,2,'queued distant displays never start loading');assert.ok(hosts.every(host=>!host.getObjectByName('STORE_PRODUCT_DISPLAY')));
});

test('market fixture anchors keep the original terminal roles and restore produce when displays leave',async()=>{
 const stall=createBuilderModel('market-stall'),atm=createBuilderModel('market-atm'),slots=storeDisplaySlots(T,atm),screen=atm.getObjectByName('DEVICE_SCREEN');
 assert.equal(slots.length,1);assert.ok(Math.abs(slots[0].position[2]+slots[0].size[2]/2+.27)<1e-9);assert.ok(screen.userData.mediaScreen);const device=atm.userData.interactiveDevice;
 const fruit=[];stall.traverse(node=>{if(node.name==='MARKET_PRODUCE')fruit.push(node);});assert.ok(fruit.length);
 const manager=createStoreProductDisplays({THREE:T,getRoots:()=>[stall],getPosition:()=>new T.Vector3(),loadProducts:async()=>[records[0]],loadModel:async()=>({root:source()}),disposeModel:()=>{}});
 manager.update(.5);await flush();manager.update(.5);await flush();assert.equal(manager.snapshot().active,3);assert.ok(fruit.every(node=>node.visible===false));
 const cardHit=manager.pick(new T.Raycaster(new T.Vector3(0,1.195,-3),new T.Vector3(0,0,1)));assert.ok(cardHit.point.z<-.9275,'the label proxy is in front of the solid basket rim for world occlusion checks');
 manager.dispose();assert.ok(fruit.every(node=>node.visible));assert.equal(atm.userData.interactiveDevice,device);assert.ok(screen.userData.mediaScreen);
});

test('placed retail scene templates expose their shop fixtures without putting merchandise in the road',async()=>{
 const scene=createBuilderModel('scene-vendor-street'),manager=createStoreProductDisplays({THREE:T,getRoots:()=>[scene],getPosition:()=>new T.Vector3(),loadProducts:async()=>[]});
 manager.update(.5);await flush();assert.equal(manager.snapshot().fixtures.length,10);
 const land=scene.children.find(node=>node.userData.layout==='vendor-street'),slots=storeDisplaySlots(T,land);assert.equal(slots.length,10);
 for(const slot of slots){slot.parent.updateWorldMatrix(true,false);const point=slot.parent.localToWorld(new T.Vector3().fromArray(slot.position));assert.ok(Math.abs(point.x)>11,'the vendor road remains clear');}
 manager.dispose();
});

test('walking away releases copy-owned skinning and instance buffers while retaining the cached geometry',async()=>{
 const host=plinth(),position=new T.Vector3(),root=new T.Group(),geometry=new T.BoxGeometry(1,1,1),material=new T.MeshStandardMaterial(),count=geometry.attributes.position.count;
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(count*4),4));const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 const skin=new T.SkinnedMesh(geometry,material),bone=new T.Bone();skin.add(bone);skin.bind(new T.Skeleton([bone]));root.add(skin);
 const instances=new T.InstancedMesh(geometry,material,1);instances.setMatrixAt(0,new T.Matrix4().makeTranslation(1,0,0));root.add(instances);
 let sharedGeometryDisposals=0,sourceInstanceDisposals=0,copyInstanceDisposals=0,copySkeletonDisposals=0;geometry.addEventListener('dispose',()=>sharedGeometryDisposals++);instances.addEventListener('dispose',()=>sourceInstanceDisposals++);
 const manager=createStoreProductDisplays({THREE:T,getRoots:()=>[host],getPosition:()=>position,loadProducts:async()=>[records[0]],loadModel:async()=>({root}),disposeModel:()=>{}});
 manager.update(.5);await flush();manager.update(.5);await flush();assert.equal(manager.snapshot().active,1);
 host.getObjectByName('STORE_PRODUCT_DISPLAY').traverse(node=>{if(node.isInstancedMesh)node.addEventListener('dispose',()=>copyInstanceDisposals++);if(node.isSkinnedMesh){assert.notEqual(node.skeleton,skin.skeleton);node.skeleton.dispose=()=>copySkeletonDisposals++;}});
 position.set(100,0,0);manager.update(.5);assert.equal(copyInstanceDisposals,1);assert.equal(copySkeletonDisposals,1);assert.equal(sharedGeometryDisposals,0);assert.equal(sourceInstanceDisposals,0);assert.equal(manager.snapshot().cachedSources,1);manager.dispose();
});

test('one-sided uploaded fronts face the customer without changing the authored source',async()=>{
 const host=plinth(),root=new T.Group(),front=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshStandardMaterial());front.name='UPLOAD_FRONT';front.position.y=.5;root.add(front);
 const manager=createStoreProductDisplays({THREE:T,getRoots:()=>[host],getPosition:()=>new T.Vector3(),loadProducts:async()=>[records[1]],loadModel:async()=>({root}),disposeModel:()=>{}});
 manager.update(.5);await flush();manager.update(.5);await flush();host.updateMatrixWorld(true);
 const displayed=host.getObjectByName('STORE_PRODUCT_DISPLAY').getObjectByName('UPLOAD_FRONT'),normal=new T.Vector3(0,0,1).applyNormalMatrix(new T.Matrix3().getNormalMatrix(displayed.matrixWorld));
 assert.ok(normal.z<-.99,'the one-sided GLTF front is visible from the -Z shop aisle');assert.equal(root.rotation.y,0);assert.equal(front.material.side,T.FrontSide);manager.dispose();
});
