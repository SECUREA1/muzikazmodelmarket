import test from 'node:test';
import assert from 'node:assert/strict';
import {marketItemPreview,previewDescriptor,safePreviewUrl,previewModelSource,loadPreviewModel,disposePreviewModel} from '../public/js/market-item-preview.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
test('market records preserve artwork and model identity across listing formats',()=>{
 assert.equal(previewDescriptor({itemName:'Member prop',modelUrl:'/owned.glb',thumbnailUrl:'/art.svg'}).model,'/owned.glb');
 assert.equal(previewDescriptor({asset:{name:'Builder prop',glb_url:'/builder.glb',thumbnail_url:'/builder.png'}}).image,'/builder.png');
 assert.equal(previewDescriptor({model:{name:'Store prop',modelUrl:'/store.glb'}}).model,'/store.glb');
 assert.equal(previewDescriptor({name:'Custom drawing',modelUrl:'/drawing.svg'}).image,'/drawing.svg');
 assert.equal(previewDescriptor({thumbnailUrl:'brand_name_tagline.png',modelUrl:'/exact.glb'}).image,'');
 assert.equal(previewDescriptor({function_data:{buildAssetId:'sofa'}}).buildAssetId,'sofa');
});
test('catalog entries always have accessible visuals and distinguish illustrations from actual artwork',()=>{
 for(const item of GAME_ECONOMY){const html=marketItemPreview(item);assert.match(html,/data-item-preview=/);assert.match(html,/role="img"/);assert.match(html,/<figcaption>/);}
 assert.match(marketItemPreview({name:'Logic script',category:'SCRIPTS'}),/Illustration · SCRIPTS/);
 const bundle=marketItemPreview({name:'Furniture bundle',entries:[{name:'Sofa',quantity:2},{name:'Lamp',quantity:1}]});assert.match(bundle,/2 × Sofa/);assert.match(bundle,/1 × Lamp/);
});
test('builder previews use the same material, native and GLB sources as placement',async()=>{
 const native=previewDescriptor({name:'Native hero',buildAssetId:'hero-spawn',modelUrl:'/reference.glb',thumbnailUrl:'/generic.svg'});
 assert.equal(previewModelSource(native),'native');
 assert.equal(previewModelSource(previewDescriptor({materialId:'wood',buildAssetId:'material:wood'})),'material');
 assert.equal(previewModelSource(previewDescriptor({modelUrl:'/authored.glb'})),'glb');
 assert.match(marketItemPreview(native,{preferModel:true}),/data-preview-prefer-model="true"/);
 assert.doesNotMatch(marketItemPreview(native),/data-preview-prefer-model/);
 const {root}=await loadPreviewModel(native);assert.ok(root);assert.ok(root.children.length);disposePreviewModel(root);
 await assert.rejects(loadPreviewModel(previewDescriptor({buildAssetId:'missing-native',modelUrl:'/unrelated.glb'})),/No visual model/);
});
test('untrusted preview metadata cannot execute scripts or inject markup',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,evil','//evil.test/a','https:\\evil.test','\u0000https://evil.test'])assert.equal(safePreviewUrl(url),'');
 assert.equal(safePreviewUrl('public/images/tree.svg'),'public/images/tree.svg');assert.equal(safePreviewUrl('https://cdn.test/model.glb'),'https://cdn.test/model.glb');
 const html=marketItemPreview({name:'<img src=x onerror=alert(1)>',thumbnailUrl:'javascript:alert(1)'});assert.doesNotMatch(html,/<img src=x/);assert.equal(previewDescriptor({thumbnailUrl:'javascript:alert(1)'}).image,'');
});

test('member sale listings retain exact visual metadata for buyers',async()=>{
 const {UserJsonDatabase}=await import('../user-json-database.mjs'),{mkdtemp,rm}=await import('node:fs/promises'),{join}=await import('node:path'),{tmpdir}=await import('node:os');
 const dir=await mkdtemp(join(tmpdir(),'market-visuals-'));
 try{const db=new UserJsonDatabase(join(dir,'users.json'));await db.put('seller',{tokens:{MZK:100},items:[{id:'chair',name:'Chair',type:'props',thumbnail_url:'/chair.svg',modelUrl:'/chair.glb',buildAssetId:'sofa',listing:{active:true,priceMzk:50}}]});const [listing]=await db.marketListings();assert.equal(listing.thumbnailUrl,'/chair.svg');assert.equal(listing.modelUrl,'/chair.glb');assert.equal(listing.buildAssetId,'sofa');assert.equal(previewDescriptor(listing).name,'Chair');}
 finally{await rm(dir,{recursive:true,force:true});}
});
