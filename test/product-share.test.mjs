import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {productReference,productShareUrl,shareProduct,resolveSharedProduct,loadPublicProductCatalog} from '../public/js/product-share.js';
import {productArtwork,productPrice,productFacts} from '../public/js/product-page.js';

const response=rows=>({ok:true,json:async()=>({success:true,data:rows})});
const publicRows=[
 {id:'upgrade:backpack:builder-portal-door',sku:'backpack:builder-portal-door',source:'upgrade',buildAssetId:'portal-door',name:'Portal'},
 {id:'upgrade:backpack:one-chair',sku:'backpack:one-chair',source:'upgrade',buildAssetId:'chair',name:'Chair'},
 {id:'upgrade:backpack:another-chair',sku:'backpack:another-chair',source:'upgrade',buildAssetId:'chair',name:'Chair alias'},
 {id:'player:account:seller:unique-copy',source:'player',sellerId:'account:seller',itemId:'unique-copy',name:'Owned copy'},
 {id:'builder:listing-1',source:'builder',name:'Listed creation',asset:{buildAssetId:'portal-door'}},
 {id:'model:repository-1',source:'model',name:'Repository model'},
 {id:'native-map:commons',source:'native-map',name:'Commons'},
 {id:'land:plot-1',source:'land',name:'Plot'},
 {id:'bundle-canonical',source:'bundle',name:'Kit'},
 {id:'care:elixir',source:'care',name:'Elixir'},
 {id:'builder:unlisted',source:'builder',listing_status:'unlisted'},
 {id:'model:private',source:'model',visibility:'private'}
];

test('product links preserve exact public listing and economy identities without embedding asset data',()=>{
 for(const record of publicRows.slice(0,10))assert.equal(productReference(record),record.id);
 assert.equal(productReference({sellerId:'account:seller',itemId:'unique-copy',sku:'backpack:one-chair'}),'player:account:seller:unique-copy');
 assert.equal(productReference({listing_id:'listing-1',asset:{id:'private-asset',glb_url:'/uploads/raw.glb'}}),'builder:listing-1');
 assert.equal(productReference({id:'builder-chair',sku:'backpack:one-chair',buildAssetId:'chair'}),'upgrade:backpack:one-chair');
 const link=productShareUrl({sku:'backpack:one-chair',buildAssetId:'chair',modelUrl:'/uploads/private.glb',accountToken:'secret',drawingData:'data:image/png;base64,AA=='},'https://example.test/game/model-market.html?token=secret#private');
 const parsed=new URL(link);assert.equal(parsed.pathname,'/game/product.html');assert.deepEqual([...parsed.searchParams],[['id','upgrade:backpack:one-chair']]);assert.equal(parsed.hash,'');
 assert.doesNotMatch(link,/secret|uploads|data:image|private|drawing|useItem|checkout/);
 const credentialed=new URL(productShareUrl(publicRows[0],'https://member:secret@example.test/game.html'));
 assert.equal(credentialed.username,'');assert.equal(credentialed.password,'');
 for(const record of [{modelUrl:'/uploads/private.glb'},{id:'blob:private'},{visibility:'private',sku:'native:secret'},{listing_status:'sold',listing_id:'old'},'https://example.test/a.glb','data:text/plain,secret','blob:temporary','{"id":"private"}'])assert.equal(productShareUrl(record,'https://example.test/'),null);
});

test('shared products resolve from one public catalog request and bare native identities reject aliases',async()=>{
 const calls=[],request=async(path,options)=>{calls.push({path,options});return response(publicRows);};
 for(const record of publicRows.slice(0,10))assert.equal(await resolveSharedProduct(productReference(record),{request}),record);
 assert.equal(await resolveSharedProduct('portal-door',{request}),publicRows[0]);
 assert.equal(await resolveSharedProduct('chair',{request}),null,'a bare model cannot choose between historic owned SKUs');
 assert.equal(await resolveSharedProduct({sku:'backpack:another-chair',buildAssetId:'chair'},{request}),publicRows[2]);
 assert.equal(await resolveSharedProduct('builder:unlisted',{request}),null);
 assert.equal(await resolveSharedProduct('model:private',{request}),null);
 assert.equal(await resolveSharedProduct('player:account:seller:missing-copy',{request}),null,'removed member copies do not resolve to their underlying native offer');
 assert.deepEqual(await loadPublicProductCatalog({request}),publicRows.slice(0,10),'store displays reuse the same filtered public response');
 assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/market/catalog');assert.equal(calls[0].options.cache,'no-store');
});

test('failed catalog loads can retry, invalid references do not fetch and cancellation does not cancel shared consumers',async()=>{
 let attempts=0;const retry=async()=>{attempts++;return attempts===1?{ok:false,json:async()=>({success:false,message:'Market temporarily unavailable'})}:response(publicRows);};
 await assert.rejects(resolveSharedProduct(publicRows[0].id,{request:retry}),/temporarily unavailable/);
 assert.equal(await resolveSharedProduct(publicRows[0].id,{request:retry}),publicRows[0]);assert.equal(attempts,2);
 const invalid=async()=>{throw Error('Invalid reference fetched the network');};
 assert.equal(await resolveSharedProduct('javascript:alert(1)',{request:invalid}),null);
 const already=new AbortController();already.abort();await assert.rejects(resolveSharedProduct('portal-door',{request:invalid,signal:already.signal}),{name:'AbortError'});
 let complete,count=0;const request=()=>{count++;return new Promise(resolve=>complete=resolve);},controller=new AbortController();
 const first=resolveSharedProduct('portal-door',{request,signal:controller.signal}),second=resolveSharedProduct('portal-door',{request});
 controller.abort();await assert.rejects(first,{name:'AbortError'});complete(response(publicRows));assert.equal(await second,publicRows[0]);assert.equal(count,1);
});

test('sharing supports native share, truthful clipboard confirmation, cancel and selectable-link fallback',async()=>{
 const record=publicRows[0],base='https://example.test/model-market.html',shared=[];
 const native=await shareProduct(record,{base,navigator:{share:async payload=>shared.push(payload)},clipboard:{writeText:()=>assert.fail('native share should not copy')}});
 assert.equal(native.method,'share');assert.deepEqual(shared,[{title:'Portal',url:native.url}]);
 const canceled=await shareProduct(record,{base,navigator:{share:async()=>{const error=new Error('Canceled');error.name='AbortError';throw error;}},clipboard:{writeText:()=>assert.fail('cancel should not copy')}});
 assert.equal(canceled.canceled,true);
 const copied=[],clip=await shareProduct(record,{base,navigator:{},clipboard:{writeText:async value=>copied.push(value)}});assert.equal(clip.method,'clipboard');assert.deepEqual(copied,[clip.url]);
 const rejected=await shareProduct(record,{base,navigator:{},clipboard:{writeText:async()=>{throw Error('Not allowed');}}});assert.equal(rejected.method,'link');assert.ok(rejected.url);
 const absent=await shareProduct(record,{base,navigator:{},clipboard:null});assert.equal(absent.method,'link');assert.ok(absent.url);
 assert.equal((await shareProduct({visibility:'private',id:'model:private'},{base,navigator:{}})).method,'unavailable');
});

test('product details display accurate prices and public artwork while staying lightweight until preview is requested',async()=>{
 assert.equal(productPrice({source:'model',priceUsd:5}),'$5.00 USD');assert.equal(productPrice({basic:true}),'Included in the basic kit');assert.equal(productPrice({earnedOnly:true}),'Earn in game');assert.equal(productPrice({source:'native-map'}),'Public template · free');
 assert.match(productPrice({priceMzk:50}),/50 MZK/);assert.equal(productPrice({}),'See current price in the market');
 assert.equal(productArtwork({thumbnailUrl:'javascript:alert(1)'}),'');assert.equal(productArtwork({thumbnailUrl:'blob:ephemeral'}),'');
 assert.match(productArtwork({asset:{thumbnail_url:'/public/images/native-upgrades/portal-door.svg'}}),/portal-door\.svg$/);
 assert.deepEqual(productFacts({source:'builder',asset:{builder_category:'Furniture'},seller:'Builder'}),[['Category','Furniture'],['Collection','Builder listing'],['Seller','Builder']]);
 const source=await readFile(new URL('../public/js/product-page.js',import.meta.url),'utf8'),page=await readFile(new URL('../product.html',import.meta.url),'utf8');
 assert.match(source,/loadPreview=\(\)=>import\('\.\/product-preview\.js'\)/);assert.doesNotMatch(source,/setInterval|getUserMedia|requestSession|useItem|cart|checkout|method:\s*['"]POST/);
 assert.match(page,/api-connection\.js/);assert.match(page,/data-product-preview="3d"/);assert.match(page,/data-product-preview="ar"/);assert.match(page,/data-product-copy-link hidden/);assert.doesNotMatch(page,/three\.module|model-viewer|product-preview\.js/);
});
