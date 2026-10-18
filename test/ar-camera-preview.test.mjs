import test from 'node:test';
import assert from 'node:assert/strict';
import {previewModelUrl,createCameraPreview} from '../public/js/ar-camera-preview.js';
import {downloadGameplayItem} from '../public/js/backpack-files.js';
test('preview accepts GLB queries and local upload blobs without opening downloadable USDZ or intents',()=>{
 assert.equal(previewModelUrl('/model.glb?version=2','https://example.com/'),'https://example.com/model.glb?version=2');assert.equal(previewModelUrl('blob:https://example.com/id'),'blob:https://example.com/id');
 for(const value of ['https://example.com/model.usdz','javascript:alert(1)','intent://model','data:model/gltf-binary,x'])assert.throws(()=>previewModelUrl(value));
});
class Element extends EventTarget{
 constructor(tag){super();this.tag=tag;this.children=[];this.attributes={};this.open=false;}
 append(...nodes){this.children.push(...nodes);}setAttribute(key,value){this.attributes[key]=value;}getAttribute(key){return this.attributes[key];}removeAttribute(key){delete this.attributes[key];}
 querySelector(tag){return this.children.find(child=>child.tag===tag)||this.children.map(child=>child.querySelector(tag)).find(Boolean);}
 showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}pause(){}async play(){}focus(){}
}
function fixture(capture){const document=new EventTarget();document.head=new Element('head');document.body=new Element('body');document.createElement=tag=>new Element(tag);document.activeElement=new Element('button');const window=new EventTarget(),camera=createCameraPreview({document,window,navigator:{mediaDevices:{getUserMedia:capture}}});return {document,window,camera};}
test('explicit camera preview displays the selected model and stops capture when closed',async()=>{
 let calls=0,stopped=false;const {document,camera}=fixture(async options=>{calls++;assert.equal(options.audio,false);assert.equal(options.video.facingMode.ideal,'environment');return {getTracks:()=>[{stop(){stopped=true;}}]};});assert.equal(calls,0);
 await camera.open({modelUrl:'https://example.com/character.glb',name:'Character'});const dialog=document.body.children[0];assert.equal(dialog.open,true);assert.equal(dialog.querySelector('model-viewer').getAttribute('src'),'https://example.com/character.glb');assert.ok(dialog.querySelector('video').srcObject);assert.equal(dialog.querySelector('model-viewer').getAttribute('ar'),undefined);
 camera.close();assert.equal(stopped,true);assert.equal(dialog.open,false);assert.equal(dialog.querySelector('video').srcObject,null);
});
test('closing while camera permission is pending releases the late stream',async()=>{
 let allow,stopped=false;const {camera}=fixture(()=>new Promise(resolve=>{allow=resolve;}));const opening=camera.open({modelUrl:'https://example.com/model.glb'});camera.close();allow({getTracks:()=>[{stop(){stopped=true;}}]});await opening;assert.equal(stopped,true);
});
test('camera refusal keeps a 3D preview and never opens another app or a download',async()=>{
 const {document,camera}=fixture(async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'});});await camera.open({modelUrl:'https://example.com/model.glb'});const dialog=document.body.children[0];assert.ok(dialog.querySelector('model-viewer').getAttribute('src'));assert.match(dialog.querySelector('footer').children[0].textContent,/permission was declined/);camera.close();
});
test('a denied ownership export creates no file, blob or download link',async()=>{
 const oldWindow=globalThis.window;let links=0;globalThis.window={fetch:async()=>({ok:false,status:403,json:async()=>({success:false,code:'ITEM_NOT_OWNED',message:'This item is not in your server Backpack.'})})};
 const oldCreate=URL.createObjectURL;URL.createObjectURL=()=>{links++;throw Error('Must not create a download');};
 try{await assert.rejects(downloadGameplayItem('unowned'),error=>error.code==='ITEM_NOT_OWNED');assert.equal(links,0);}finally{globalThis.window=oldWindow;URL.createObjectURL=oldCreate;}
});
