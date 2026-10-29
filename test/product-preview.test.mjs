import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductPreview,getProductPreviewState} from '../public/js/product-preview.js';

class Element extends EventTarget{
 constructor(tag){super();this.tag=tag;this.children=[];this.attributes={};this.dataset={};this.open=false;this.hidden=false;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(key,value){this.attributes[key]=value;}
 getAttribute(key){return this.attributes[key];}
 querySelector(tag){return this.children.find(child=>child.tag===tag)||this.children.map(child=>child.querySelector(tag)).find(Boolean);}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent(new Event('close'));}
 pause(){}async play(){}focus(){this.focused=true;}
}
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({loadModel=async()=>({root:{userData:{previewPresentation:'actual-model'}}}),capture=async()=>({getTracks:()=>[]}),xr}={}){
 const document=new EventTarget();document.head=new Element('head');document.body=new Element('body');document.createElement=tag=>new Element(tag);document.activeElement=new Element('button');
 const window=new EventTarget(),records=[],runtimes=[];let active=0,peak=0,captures=0;
 const navigator={mediaDevices:{getUserMedia:async options=>{captures++;return capture(options);}},xr,userActivation:{isActive:true}};
 const preview=createProductPreview({document,window,navigator,loadModel:async(record,options)=>{records.push({record,options});return loadModel(record,options);},createRuntime:async callbacks=>{
  active++;peak=Math.max(peak,active);let disposed=false,presentation;
  const runtime={renderer:{},root:null,disposedRoots:[],present(value){this.root=value.root;presentation=value.root.userData.previewPresentation;},getPresentation:()=>presentation,setScale(){},setViewMode(mode){this.mode=mode;},pause(){},resume(){},disposeLoaded(value){this.disposedRoots.push(value.root);},dispose(){if(disposed)return;disposed=true;active--;this.disposed=true;},async startXR(session){this.session=session;session.addEventListener('end',callbacks.onXREnd,{once:true});callbacks.onXRState('ar-scanning');},place:()=>true};runtimes.push(runtime);return runtime;
 }});
 return {document,window,navigator,preview,records,runtimes,get captures(){return captures;},get active(){return active;},get peak(){return peak;},status:()=>document.body.children[0].querySelector('footer').querySelector('p').textContent};
}

test('product preview is lazy and 3D opening requests no camera or XR permission',async()=>{
 const f=fixture();assert.equal(f.runtimes.length,0);assert.equal(f.captures,0);assert.equal(getProductPreviewState().mode,'closed');
 await f.preview.open({buildAssetId:'portal-door',name:'Glowing portal'});
 assert.equal(f.preview.getState().mode,'3d');assert.equal(f.captures,0);assert.equal(f.records[0].record.buildAssetId,'portal-door');assert.ok(f.records[0].options.signal instanceof AbortSignal);assert.equal(f.records[0].options.renderer,f.runtimes[0].renderer);
 await f.preview.open({materialId:'brick',name:'Brick'});assert.equal(f.runtimes[0].disposed,true);assert.equal(f.peak,1);
 await f.preview.close();assert.equal(f.active,0);
});

test('closing an unresolved model load aborts it and disposes the late result',async()=>{
 const loading=deferred(),root={userData:{}};const f=fixture({loadModel:()=>loading.promise});const opening=f.preview.open({modelUrl:'/uploads/models/item.glb'});await tick();
 await f.preview.close();assert.equal(f.records[0].options.signal.aborted,true);loading.resolve({root});await opening;
 assert.equal(f.preview.getState().mode,'closed');assert.deepEqual(f.runtimes[0].disposedRoots,[root]);assert.equal(f.active,0);
});

test('a new product supersedes pending model work without opening two active previews',async()=>{
 const first=deferred(),lateRoot={userData:{}};let n=0;const f=fixture({loadModel:()=>++n===1?first.promise:Promise.resolve({root:{userData:{}}})});const opening=f.preview.open({name:'First'});await tick();
 await f.preview.open({name:'Second'});first.resolve({root:lateRoot});await opening;
 assert.equal(f.preview.getState().name,'Second');assert.equal(f.preview.getState().mode,'3d');assert.equal(f.peak,1);assert.equal(f.records[0].options.signal.aborted,true);assert.deepEqual(f.runtimes[0].disposedRoots,[lateRoot]);await f.preview.close();
});

test('unsupported AR uses an honestly labelled camera overlay and releases late capture',async()=>{
 let stopped=0;const f=fixture({capture:async options=>{assert.equal(options.audio,false);return {getTracks:()=>[{stop(){stopped++;}}]};}});
 await f.preview.open({name:'Item'},{mode:'ar'});assert.equal(f.captures,1);assert.equal(f.preview.getState().mode,'camera-preview');assert.match(f.status(),/not world-tracked/);await f.preview.close();assert.equal(stopped,1);
 const permission=deferred(),pending=fixture({capture:()=>permission.promise});await pending.preview.open({name:'Another item'});const camera=pending.preview.startCamera();await tick();await pending.preview.close();permission.resolve({getTracks:()=>[{stop(){stopped++;}}]});await camera;assert.equal(stopped,2);assert.equal(pending.preview.getState().mode,'closed');
});

test('supported AR requires hit-test and ends its session before a replacement preview',async()=>{
 let ended=0,requested=0;const session=new EventTarget();session.end=async()=>{ended++;session.dispatchEvent(new Event('end'));};
 const f=fixture({xr:{isSessionSupported:async()=>true,async requestSession(mode,options){requested++;assert.equal(mode,'immersive-ar');assert.deepEqual(options.requiredFeatures,['hit-test']);assert.ok(options.domOverlay.root);return session;}}});
 await f.preview.open({name:'Item'});assert.equal(requested,0);await f.preview.startAR();assert.equal(f.preview.getState().mode,'ar-scanning');assert.equal(requested,1);
 await f.preview.open({name:'Replacement'});assert.equal(ended,1);assert.equal(f.peak,1);assert.equal(f.preview.getState().mode,'3d');await f.preview.close();
});

test('closing a pending XR request ends the late session and never attaches it',async()=>{
 const pending=deferred();let ended=0;const f=fixture({xr:{isSessionSupported:async()=>true,requestSession:()=>pending.promise}});
 await f.preview.open({name:'Item'});const starting=f.preview.startAR();await tick();await f.preview.close();pending.resolve({end:async()=>{ended++;}});await starting;
 assert.equal(ended,1);assert.equal(f.runtimes[0].session,undefined);assert.equal(f.preview.getState().mode,'closed');
});

test('camera refusal and artwork fallback never claim surface placement or an authored model',async()=>{
 const f=fixture({loadModel:async()=>({root:{userData:{previewPresentation:'product-card'}}}),capture:async()=>{throw Object.assign(Error('Denied'),{name:'NotAllowedError'});}});
 await f.preview.open({name:'Artwork'});assert.equal(f.preview.getState().presentation,'product-card');assert.match(f.status(),/no 3D model/);
 await f.preview.startCamera();assert.equal(f.preview.getState().mode,'3d');assert.match(f.status(),/permission was declined/);await f.preview.close();
});


test('only the owning product row can conditionally close the current preview',async()=>{
 const f=fixture(),ownerA={},ownerB={};await f.preview.open({id:'native-a',name:'First'},{owner:ownerA});assert.equal(f.preview.getState().recordId,'native-a');
 await f.preview.open({id:'native-b',name:'Second'},{owner:ownerB});await f.preview.close({owner:ownerA});assert.equal(f.preview.getState().mode,'3d');assert.equal(f.preview.getState().id,'native-b');assert.equal(f.preview.getState().owner,ownerB);
 const dialog=f.document.body.children[0];assert.equal(dialog.getAttribute('data-product-preview'),'');assert.equal(dialog.getAttribute('data-render-gameplay'),'suspend');await f.preview.close({owner:ownerB});assert.equal(f.preview.getState().mode,'closed');
});


test('concurrent AR actions issue only one immersive-session request',async()=>{
 const request=deferred();let requests=0;const f=fixture({xr:{isSessionSupported:async()=>true,requestSession:()=>{requests++;return request.promise;}}});
 await f.preview.open({name:'Item'});const first=f.preview.startAR(),second=f.preview.startAR();await tick();assert.equal(requests,1);await f.preview.close();request.resolve({end:async()=>{}});await Promise.all([first,second]);
});
