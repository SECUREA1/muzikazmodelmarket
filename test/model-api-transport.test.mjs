import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchPublishedModels,fetchPublishedModel,uploadModelFiles,uploadEnvironment as uploadModelEnvironment,publishModel,parseResponse,apiUrl,absoluteUrl} from '../public/js/model-api.js';
import {uploadEnvironment,deleteEnvironment} from '../public/js/environments/environment-api.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const values=entries=>({getItem:key=>entries[key]||null});
function globals(value){
 const before=new Map();
 for(const [key,item]of Object.entries(value)){before.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:item});}
 return ()=>{for(const [key,old]of before)if(old)Object.defineProperty(globalThis,key,old);else delete globalThis[key];};
}

test('published model requests use the discovered member API rather than an early static-origin snapshot',async()=>{
 let connected;const ready=new Promise(resolve=>{connected=resolve;}),calls=[];
 const browser={location:new URL('https://site.test/model-explorer.html'),MUZIKAZ_API_BASE:'https://site.test',fetch:()=>{throw Error('Raw frontend fetch bypassed member transport');}};
 browser.MUZIKAZ_API={base:'https://site.test',ready,url:path=>new URL(path,browser.MUZIKAZ_API.base).href,async fetch(path,options){await ready;calls.push({url:this.url(path),options});return json({success:true,data:path==='/api/models'?[{id:'live-model',modelUrl:'/uploads/assets/model.glb'}]:{id:'model/a'}});}};
 const restore=globals({window:browser});
 try{
  const pending=fetchPublishedModels();assert.equal(calls.length,0);
  browser.MUZIKAZ_API.base='https://api.test';connected();
  assert.equal((await pending)[0].id,'live-model');
  assert.equal((await fetchPublishedModel('model/a')).id,'model/a');
  assert.deepEqual(calls.map(call=>call.url),['https://api.test/api/models','https://api.test/api/models/model%2Fa']);
  assert.equal(apiUrl('/api/models'),'https://api.test/api/models');
  assert.equal(absoluteUrl('/uploads/assets/model.glb'),'https://api.test/uploads/assets/model.glb');
  assert.equal(absoluteUrl('/public/models/avatars/DAX.glb'),'https://site.test/public/models/avatars/DAX.glb');
 }finally{restore();}
});

test('uploads and publishing preserve land gating and the persistent admin credential through member transport',async()=>{
 const calls=[],body=new FormData();body.append('name','Exact source');
 const browser={location:new URL('https://site.test/'),localStorage:values({muzikazAdminToken:'persistent-admin',muzikazUserId:'creator'}),sessionStorage:values({}),MUZIKAZLandAccess:{uploadHeaders:()=>({'x-muzikaz-land-asset':'existing-deed'})},MUZIKAZ_API:{async fetch(path,options){calls.push({path,options});return json({success:true,data:{id:'saved'}});}}};
 const restore=globals({window:browser});
 try{
  await uploadModelFiles(body);await uploadModelEnvironment(body);await publishModel({id:'saved',modelUrl:'/uploads/assets/model.glb'});
  assert.deepEqual(calls.map(call=>call.path),['/api/models/upload','/api/environments/upload','/api/models']);
  assert.ok(calls.every(call=>call.options.method==='POST'));
  assert.ok(calls.every(call=>call.options.headers['x-admin-token']==='persistent-admin'));
  assert.equal(calls[0].options.body,body);assert.equal(calls[1].options.body,body);
  assert.equal(calls[0].options.headers['x-muzikaz-land-asset'],'existing-deed');
  delete browser.MUZIKAZLandAccess;
  await assert.rejects(uploadModelFiles(body),/Backpack access/);assert.equal(calls.length,3);
 }finally{restore();}
});

test('model response failures retain actionable API codes and never treat an HTML deployment response as a model catalog',async()=>{
 await assert.rejects(parseResponse(json({success:false,code:'ADMIN_REQUIRED',message:'Administrator sign-in required'},403)),error=>error.status===403&&error.code==='ADMIN_REQUIRED');
 await assert.rejects(parseResponse(new Response('<html>Temporarily unavailable</html>',{status:503,headers:{'Content-Type':'text/html'}})),error=>error.code==='INVALID_JSON_RESPONSE'&&error.status===503);
 const aborted=Object.assign(Error('Cancelled'),{name:'AbortError'});
 await assert.rejects(parseResponse({status:200,ok:true,headers:new Headers(),json:async()=>{throw aborted;}}),error=>error===aborted);
});

test('environment upload waits for service discovery and uses its final URL, account and admin credentials',async()=>{
 let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;}),requests=[],progress=[];
 const browser={location:new URL('https://site.test/'),localStorage:values({muzikazAdminToken:'admin'}),sessionStorage:values({}),MUZIKAZLandAccess:{uploadHeaders:()=>({'x-muzikaz-land-asset':'deed'})}};
 browser.MUZIKAZ_API={base:'https://site.test',ready,url:path=>new URL(path,browser.MUZIKAZ_API.base).href,getSessionToken:()=> 'member-session'};
 class Xhr{
  constructor(){this.upload={};this.headers={};requests.push(this);}
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(key,value){this.headers[key]=value;}
  send(body){this.body=body;this.upload.onprogress({lengthComputable:true,loaded:5,total:10});this.status=201;this.response={success:true,data:{id:'map-1',modelUrl:'/uploads/environments/map.glb'}};queueMicrotask(()=>this.onload());}
 }
 const restore=globals({window:browser,XMLHttpRequest:Xhr});
 try{
  const form=new FormData(),pending=uploadEnvironment(form,value=>progress.push(value));assert.equal(requests.length,0);
  browser.MUZIKAZ_API.base='https://api.test';resolveReady();
  assert.equal((await pending).id,'map-1');
  const request=requests[0];assert.equal(request.url,'https://api.test/api/environments/upload');assert.equal(request.method,'POST');assert.equal(request.withCredentials,true);assert.equal(request.body,form);
  assert.deepEqual(request.headers,{Authorization:'Bearer member-session','x-muzikaz-land-asset':'deed','x-admin-token':'admin'});assert.deepEqual(progress,[50]);
 }finally{restore();}
});

test('invalid upload JSON and failed map deletion surface the actual API failure',async()=>{
 const browser={location:new URL('https://site.test/'),MUZIKAZLandAccess:{uploadHeaders:()=>({})},MUZIKAZ_API:{url:path=>'https://api.test'+path,fetch:async()=>json({success:false,code:'ADMIN_REQUIRED',message:'Sign in as admin'},403)}};
 class Xhr{constructor(){this.upload={};}open(){}setRequestHeader(){}send(){this.status=201;this.response=null;queueMicrotask(()=>this.onload());}}
 const restore=globals({window:browser,XMLHttpRequest:Xhr});
 try{
  await assert.rejects(uploadEnvironment(new FormData()),error=>error.code==='INVALID_JSON_RESPONSE');
  await assert.rejects(deleteEnvironment('map-1'),error=>error.code==='ADMIN_REQUIRED'&&error.status===403);
 }finally{restore();}
});
