import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {previewDescriptor,previewModelSource,loadPreviewModel,disposePreviewModel} from '../public/js/market-item-preview.js';
import {auditProductPreviewCoverage} from '../scripts/audit-product-preview-coverage.mjs';

test('every catalog offer and native definition has an explicit, resolvable product presentation',async()=>{
 const report=await auditProductPreviewCoverage();assert.deepEqual(report.failures,[]);assert.equal(report.counts.offers,GAME_ECONOMY.length);assert.equal(report.counts.uniqueSkus,report.counts.offers);assert.equal(report.counts.nativeDefinitions,Object.keys(NATIVE_BUILDER_ITEMS).length);
 assert.equal(report.counts.offers,621);assert.equal(report.counts.nativeDefinitions,495);assert.equal(report.counts.nativeOffers,556);assert.equal(report.counts.uniqueNativeDesigns,551);assert.equal(report.counts.sources.layout,32);assert.equal(report.counts.sources.tool,24);assert.equal(report.counts.sources.material,130);assert.equal(report.counts.generatedRegistryAssets,44);
 assert.equal(report.counts.sources.image,5);assert.equal(report.counts.sources.card,5);assert.equal(report.counts.imageFiles,5);
});

test('generated recipes and editable vector drawings preserve their actual gameplay geometry route',async()=>{
 const records=[
  {assetId:'generated-fish',name:'Generated fish',generated:true,generator:'fish',color:'#66aabb'},
  {id:'drawing-1',name:'Vector drawing',custom:true,strokes:[{tool:'rectangle',points:[{x:120,y:90},{x:280,y:210}],width:18}],form:'solid',drawingSettings:{depth:.3,bevel:.02},color:'#aa8855'}
 ];
 for(const [index,record]of records.entries()){
  const descriptor=previewDescriptor(record);assert.equal(previewModelSource(descriptor),index?'drawing':'generated');assert.deepEqual(previewDescriptor(descriptor),descriptor);
  let root;try{({root}=await loadPreviewModel(descriptor));assert.ok(root?.isObject3D);assert.ok(root.children.length);if(!index){assert.equal(root.userData.generated,true);assert.equal(root.userData.generator,'fish');}}
  finally{disposePreviewModel(root);}
 }
});

function triangleGlb(){
 const vertices=new Float32Array([0,0,0,1,0,0,0,1,0]),json=JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:vertices.byteLength}],bufferViews:[{buffer:0,byteLength:vertices.byteLength}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]}),jsonBytes=Buffer.from(json),padded=Math.ceil(jsonBytes.length/4)*4,bytes=Buffer.alloc(12+8+padded+8+vertices.byteLength,0x20);
 bytes.write('glTF',0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded,12);bytes.writeUInt32LE(0x4e4f534a,16);jsonBytes.copy(bytes,20);bytes.writeUInt32LE(vertices.byteLength,20+padded);bytes.writeUInt32LE(0x004e4942,24+padded);Buffer.from(vertices.buffer).copy(bytes,28+padded);return bytes;
}

test('uploaded GLB previews resolve the selected authenticated service without exposing account headers to external hosts',async()=>{
 const previous=globalThis.window,requests=[],bytes=triangleGlb(),site='https://frontend.test/model-market.html';let discoveryResolved=false;
 globalThis.window={location:{href:site,origin:'https://frontend.test'},MUZIKAZ_API:{ready:Promise.resolve().then(()=>{discoveryResolved=true;}),url:path=>new URL(path,'https://api.test/').href,fetch:async(url,options)=>{assert.equal(discoveryResolved,true);requests.push({url,options,api:true});return new Response(bytes,{headers:{'Content-Type':'model/gltf-binary'}});}},fetch:async(url,options)=>{requests.push({url,options,api:false});return new Response(bytes,{headers:{'Content-Type':'model/gltf-binary'}});}};
 try{
  for(const url of ['/uploads/assets/owned-model.glb','https://cdn.test/public.glb']){const descriptor=previewDescriptor({name:'Authored model',modelUrl:url,targetHeight:2});let root;try{({root}=await loadPreviewModel(descriptor));assert.ok(root?.getObjectByProperty('isMesh',true));}finally{disposePreviewModel(root);}}
  assert.equal(requests[0].url,'https://api.test/uploads/assets/owned-model.glb');assert.equal(requests[0].api,true);assert.equal(requests[0].options.credentials,'include');assert.equal(requests[1].url,'https://cdn.test/public.glb');assert.equal(requests[1].api,false);assert.equal(requests[1].options.credentials,'same-origin');assert.equal(requests[1].options.headers,undefined);
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});

test('local upload URLs and drawing configuration survive normalization without changing the purchase record',()=>{
 const records=[{name:'Local model',modelUrl:'blob:https://frontend.test/local-model'},{name:'Painted drawing',renderKind:'image',imageUrl:'/uploads/assets/drawing.svg',configuration:{extruded:true,depth:35,depthMode:'relief',scale:1.4}},{asset:{id:'owned-model',name:'Owned drawing',strokes:[{tool:'circle',points:[{x:90,y:90},{x:140,y:140}]}],drawingSettings:{depth:.2},form:'lightweight'}}];
 for(const record of records){const before=JSON.stringify(record),descriptor=previewDescriptor(record);assert.deepEqual(previewDescriptor(descriptor),descriptor);assert.equal(JSON.stringify(record),before);}
 assert.equal(previewDescriptor(records[0]).model,'blob:https://frontend.test/local-model');assert.equal(previewModelSource(previewDescriptor(records[1])),'image');assert.deepEqual(previewDescriptor(records[1]).configuration,records[1].configuration);assert.equal(previewModelSource(previewDescriptor(records[2])),'drawing');
});
