import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createImageProp,loadImageProp} from '../public/js/builder-image-prop.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const clean=root=>root?.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[])){material.map?.dispose();material.dispose();}});

test('an image template waits for the actual artwork before it can be cloned',async()=>{
 const gate=deferred(),urls=[],T={...THREE,TextureLoader:class{loadAsync(url){urls.push(url);return gate.promise;}}};
 let finished=false;const pending=loadImageProp(T,'http://image.test/item.png').then(root=>{finished=true;return root;});
 await Promise.resolve();assert.equal(finished,false);assert.deepEqual(urls,['http://image.test/item.png']);
 const texture=new THREE.Texture();gate.resolve(texture);const root=await pending;
 assert.equal(root.userData.imageStatus,'ready');assert.equal(root.children.find(node=>node.isMesh&&node.visible).material.map,texture);clean(root);
});

test('image request failures reject the template and allow a fresh retry',async()=>{
 let attempts=0;const texture=new THREE.Texture(),T={...THREE,TextureLoader:class{async loadAsync(){if(++attempts===1)throw Error('Image unavailable');return texture;}}};
 await assert.rejects(loadImageProp(T,'http://image.test/item.png'),/Image unavailable/);
 const root=await loadImageProp(T,'http://image.test/item.png');assert.equal(attempts,2);assert.equal(root.userData.imageStatus,'ready');clean(root);
});

test('timed-out image templates discard a late texture instead of caching a blank copy',async()=>{
 const gate=deferred(),T={...THREE,TextureLoader:class{loadAsync(){return gate.promise;}}},texture=new THREE.Texture();let disposals=0;texture.addEventListener('dispose',()=>disposals++);
 await assert.rejects(loadImageProp(T,'http://image.test/slow.png',{},5),/Image loading timed out/);
 gate.resolve(texture);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(disposals,1);
});

test('raster extrusion completes before the cached template becomes ready',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),pixels=new Uint8ClampedArray(64*64*4).fill(255);
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:pixels})})})}});
 const texture=new THREE.Texture({width:1,height:1}),T={...THREE,TextureLoader:class{async loadAsync(){return texture;}}};
 try{const root=await loadImageProp(T,'http://image.test/item.png',{extruded:true});let instances=0,panels=0;root.traverse(node=>{if(node.isInstancedMesh)instances+=node.count;if(node.geometry?.type==='PlaneGeometry')panels++;});assert.equal(root.userData.imageStatus,'ready');assert.equal(instances,4096);assert.equal(panels,0,'the preview clones the finished extrusion, not the provisional white panel');clean(root);}
 finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
});

test('member upload artwork follows the selected API without forwarding credentials to external images',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window'),requests=[],images=[],T={...THREE,TextureLoader:class{async loadAsync(url){images.push(url);return new THREE.Texture();}}};
 const api={ready:Promise.resolve(),url:path=>new URL(path,'https://api.test').href,async fetch(url){requests.push(url);return new Response('image bytes',{headers:{'content-type':'image/png'}});}};
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{href:'https://site.test/environment-builder.html'},MUZIKAZ_API:api}});
 try{const own=await loadImageProp(T,'/uploads/models/member.png'),external=await loadImageProp(T,'https://external.test/uploads/public.png');assert.deepEqual(requests,['https://api.test/uploads/models/member.png']);assert.match(images[0],/^blob:/);assert.equal(images[1],'https://external.test/uploads/public.png');clean(own);clean(external);}
 finally{if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;}
});

test('live world image props retain their synchronous root while reporting readiness',async()=>{
 const gate=deferred(),T={...THREE,TextureLoader:class{loadAsync(){return gate.promise;}}};let loaded;
 const root=createImageProp(T,'http://image.test/item.png',{}, {onLoad:value=>{loaded=value;}});assert.ok(root.isObject3D);assert.equal(root.userData.imageStatus,'loading');gate.resolve(new THREE.Texture());await gate.promise;await Promise.resolve();assert.equal(loaded,root);assert.equal(root.userData.imageStatus,'ready');clean(root);
});
