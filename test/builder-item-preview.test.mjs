import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {mountBuilderItemPreview} from '../public/js/builder-item-preview.js';

function fixture(options){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 const control=()=>({dataset:{},disabled:false,hidden:false,addEventListener(){}}),controls=new Map();
 for(const selector of ['h3','[data-preview-size]','[data-preview-status]','[data-preview-place]','[data-preview-drag]','[data-preview-retry]','[data-preview-back]'])controls.set(selector,control());
 const canvas={width:320,height:240,dataset:{},getContext:()=>({clearRect(){},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})};controls.set('canvas',canvas);
 const element={dataset:{},setAttribute(){},querySelector:selector=>controls.get(selector),querySelectorAll:()=>[control(),control()]};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>element}});
 let currentTarget=null;const renderer={getRenderTarget:()=>currentTarget,setRenderTarget:target=>{currentTarget=target;},getViewport:v=>v.set(0,0,800,600),setViewport(){},getScissor:v=>v.set(0,0,800,600),setScissor(){},getScissorTest:()=>false,setScissorTest(){},getClearColor:color=>color.set(0),getClearAlpha:()=>1,setClearColor(){},clear(){},render(){},readRenderTargetPixels(){}};
 const preview=mountBuilderItemPreview({THREE,renderer,onPlace(){},onBack(){},...options});
 return {preview,element,canvas,close(){preview.dispose();if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}};
}

test('changing an instanced artwork preview releases clone buffers while retaining its cached template',async()=>{
 const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial(),template=new THREE.InstancedMesh(geometry,material,1);template.setMatrixAt(0,new THREE.Matrix4());
 let templateDisposals=0,geometryDisposals=0,materialDisposals=0,cloneDisposals=0;
 template.addEventListener('dispose',()=>templateDisposals++);geometry.addEventListener('dispose',()=>geometryDisposals++);material.addEventListener('dispose',()=>materialDisposals++);
 const f=fixture({load:async()=>template,clone:root=>{const clone=root.clone();clone.addEventListener('dispose',()=>cloneDisposals++);return clone;}});
 try{await f.preview.show({id:'first',name:'First artwork'});await f.preview.show({id:'second',name:'Second artwork'});assert.equal(cloneDisposals,1);assert.equal(f.canvas.dataset.modelId,'second');f.preview.dispose();assert.equal(cloneDisposals,2);assert.equal(templateDisposals,0);assert.equal(geometryDisposals,0);assert.equal(materialDisposals,0);}
 finally{f.close();template.dispose();geometry.dispose();material.dispose();}
});

test('a slow earlier selection cannot replace the item that is currently displayed',async()=>{
 let release;const delayed=new Promise(resolve=>{release=resolve;}),template=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()),cloned=[];
 const f=fixture({load:model=>model.id==='slow'?delayed:Promise.resolve(template),clone:(root,model)=>{cloned.push(model.id);return root.clone();}});
 try{const first=f.preview.show({id:'slow',name:'Slow item'});await f.preview.show({id:'latest',name:'Latest item'});release(template);await first;assert.equal(f.canvas.dataset.modelId,'latest');assert.deepEqual(cloned,['latest']);assert.equal(f.element.dataset.previewState,'ready');}
 finally{f.close();template.geometry.dispose();template.material.dispose();}
});
