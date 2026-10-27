import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameModelLoader,loadGameModel} from '../public/js/game-model-loader.js';
import {resolveModelAssetUrl} from '../public/js/model-asset-url.js';

const vertices = new Float32Array([0,0,0,1,0,0,0,1,0]);
function triangle(uri) {
  return {asset:{version:'2.0'},buffers:[{byteLength:vertices.byteLength,...(uri ? {uri} : {})}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:vertices.byteLength}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],
    meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
}
function binaryTriangle(document = triangle()) {
  const json = new TextEncoder().encode(JSON.stringify(document)), length = Math.ceil(json.byteLength/4)*4;
  const bytes = new Uint8Array(28+length+vertices.byteLength), view = new DataView(bytes.buffer);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,bytes.byteLength,true);
  view.setUint32(12,length,true);view.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+length);bytes.set(json,20);
  view.setUint32(20+length,vertices.byteLength,true);view.setUint32(24+length,0x004e4942,true);
  bytes.set(new Uint8Array(vertices.buffer),28+length);return bytes;
}
async function browser(run, overrides = {}) {
  const previous = new Map(['window','fetch','ProgressEvent'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const nativeFetch = globalThis.fetch;
  const win = {location:new URL('https://site.test/model-explorer.html'),...overrides};
  Object.defineProperty(globalThis,'window',{configurable:true,value:win});
  if (overrides.fetch) globalThis.fetch = overrides.fetch;
  globalThis.ProgressEvent ||= class { constructor(type,fields) {this.type=type;Object.assign(this,fields);} };
  try { return await run(win,nativeFetch); }
  finally {for (const [key,descriptor] of previous) if (descriptor) Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}
function binaryResponse() {return new Response(binaryTriangle(),{headers:{'Content-Type':'model/gltf-binary','Content-Length':String(binaryTriangle().byteLength)}});}

test('repository assets use their frontend release while persistent uploads track API discovery',async()=>{
  await browser(win=>{
    win.MUZIKAZ_API={base:'https://api-a.test'};
    assert.equal(resolveModelAssetUrl('public/models/a.glb'),'https://site.test/public/models/a.glb');
    assert.equal(resolveModelAssetUrl('/uploads/assets/owned.glb'),'https://api-a.test/uploads/assets/owned.glb');
    win.MUZIKAZ_API.base='https://api-b.test';
    assert.equal(resolveModelAssetUrl('https://site.test/uploads/assets/owned.glb?v=2'),'https://api-b.test/uploads/assets/owned.glb?v=2');
    assert.equal(resolveModelAssetUrl('https://creator.test/uploads/assets/original.glb'),'https://creator.test/uploads/assets/original.glb');
    win.location=new URL('https://site.test/release/model-explorer.html');
    assert.equal(resolveModelAssetUrl('uploads/assets/owned.glb'),'https://api-b.test/uploads/assets/owned.glb');
    assert.equal(resolveModelAssetUrl('public/models/a.glb'),'https://site.test/release/public/models/a.glb');
  });
});

test('a real uploaded GLB waits for API discovery and loads through the authenticated transport',async()=>{
  await browser(async win=>{
    const calls=[],progress=[];let complete;
    win.MUZIKAZ_API={base:'https://site.test',ready:new Promise(resolve=>{complete=resolve;}),fetch:async(url,options)=>{calls.push({url,options});return binaryResponse();}};
    win.fetch=()=>{throw Error('Private upload bypassed account transport');};
    const loading=loadGameModel(createGameModelLoader(),'/uploads/assets/triangle.glb',{onProgress:event=>progress.push(event.loaded)});
    await Promise.resolve();assert.equal(calls.length,0);
    win.MUZIKAZ_API.base='https://api.test';complete();
    const gltf=await loading;
    assert.equal(calls[0].url,'https://api.test/uploads/assets/triangle.glb');
    assert.equal(gltf.scene.children[0].geometry.attributes.position.count,3);
    assert.ok(progress.at(-1)>0);
    const again=await createGameModelLoader().loadAsync('/uploads/assets/triangle.glb');
    assert.equal(again.scene.children[0].geometry.attributes.position.getX(1),1,'normal loadAsync consumers use the same transport');
  });
});

test('external glTF buffers remain relative to their model host and receive no member bearer',async()=>{
  const calls=[];
  await browser(async win=>{
    win.MUZIKAZ_API={base:'https://api.test',fetch:()=>{throw Error('External models must not receive member transport');}};
    const loader=createGameModelLoader();loader.setRequestHeader({Authorization:'Bearer member-session'});
    const gltf=await loadGameModel(loader,'https://creator.test/models/triangle.gltf?revision=4');
    assert.equal(gltf.scene.children[0].geometry.attributes.position.count,3);
    assert.deepEqual(calls.map(call=>call.url),['https://creator.test/models/triangle.gltf?revision=4','https://creator.test/models/buffers/triangle.bin']);
    assert.ok(calls.every(call=>!call.headers.has('Authorization')));
  },{fetch:async(url,options)=>{
    const headers=new Headers(url instanceof Request ? url.headers : options?.headers);
    url=String(url instanceof Request ? url.url : url);calls.push({url,options,headers});
    if(url.endsWith('.bin'))return new Response(vertices.buffer,{headers:{'Content-Type':'application/octet-stream'}});
    return Response.json(triangle('buffers/triangle.bin'));
  }});
});

test('absolute uploads wait for discovery while external upload hosts retain their own transport',async()=>{
  await browser(async win=>{
    const calls=[];let complete;
    win.MUZIKAZ_API={base:'https://site.test',ready:new Promise(resolve=>{complete=resolve;}),fetch:async url=>{calls.push(['member',url]);return binaryResponse();}};
    win.fetch=async(url,options)=>{calls.push(['external',url,options]);return binaryResponse();};
    const loading=loadGameModel(createGameModelLoader(),'https://api.test/uploads/models/triangle.glb');
    await Promise.resolve();assert.equal(calls.length,0,'saved service URLs must not race host discovery');
    win.MUZIKAZ_API.base='https://api.test';complete();await loading;
    await loadGameModel(createGameModelLoader(),'https://creator.test/uploads/models/triangle.glb');
    assert.deepEqual(calls.map(call=>call.slice(0,2)),[['member','https://api.test/uploads/models/triangle.glb'],['external','https://creator.test/uploads/models/triangle.glb']]);
    assert.equal(calls[1][2].credentials,'same-origin');
    assert.equal(new Headers(calls[1][2].headers).has('Authorization'),false);
  });
});

test('scene preparation failures reach the loader error callback', {timeout:1000}, async()=>{
  await browser(async win=>{
    win.fetch=async()=>binaryResponse();
    const error=await new Promise(resolve=>createGameModelLoader().load('/public/models/triangle.glb',()=>{throw Error('Scene preparation failed');},undefined,resolve));
    assert.equal(error.message,'Scene preparation failed');
  });
});

test('private relative glTF buffers use account transport without exposing credentials to Three resources',async()=>{
  const apiCalls=[],nativeCalls=[],nativeFetch=globalThis.fetch;
  await browser(async win=>{
    for (const format of ['gltf','glb']) {
      apiCalls.length=0;nativeCalls.length=0;
      win.MUZIKAZ_API={base:'https://api.test',ready:Promise.resolve(),fetch:async url=>{
        apiCalls.push(url);
        if(url.endsWith('.bin'))return new Response(vertices.buffer);
        const document=triangle('../assets/triangle.bin');
        return format==='glb'?new Response(binaryTriangle(document)):Response.json(document);
      }};
      const gltf=await loadGameModel(createGameModelLoader(),'/uploads/assets/model.'+format);
      assert.equal(gltf.scene.children[0].geometry.attributes.position.getY(2),1);
      assert.deepEqual(apiCalls,['https://api.test/uploads/assets/model.'+format,'https://api.test/uploads/assets/triangle.bin']);
      assert.ok(nativeCalls.length>0&&nativeCalls.every(call=>call.url.startsWith('blob:')));
      assert.ok(nativeCalls.every(call=>!new Headers(call.options?.headers).has('Authorization')));
      await assert.rejects(()=>nativeFetch(nativeCalls[0].url),TypeError,'temporary resource URLs are released after parsing');
    }
  },{fetch:async(url,options)=>{
    url=String(url instanceof Request?url.url:url);nativeCalls.push({url,options});return nativeFetch(url,options);
  }});
});

test('HTML/model HTTP errors and cancellation are reported before exposing a broken scene',async()=>{
  await browser(async win=>{
    win.fetch=async()=>new Response('<html>deploying</html>',{headers:{'Content-Type':'text/html'}});
    await assert.rejects(()=>loadGameModel(createGameModelLoader(),'/public/models/a.glb'),{code:'INVALID_MODEL_RESPONSE'});
    win.fetch=async()=>Response.json({message:'Model not found'},{status:404});
    await assert.rejects(()=>loadGameModel(createGameModelLoader(),'/public/models/a.glb'),{status:404,message:'Model not found'});
    const cancelled=new AbortController();cancelled.abort();
    win.fetch=()=>{throw Error('Cancelled model must not be fetched');};
    await assert.rejects(()=>loadGameModel(createGameModelLoader(),'/public/models/a.glb',{signal:cancelled.signal}),{name:'AbortError'});
    win.MUZIKAZ_API={base:'https://api.test',ready:new Promise(()=>{})};
    const selecting=new AbortController(),pending=loadGameModel(createGameModelLoader(),'/uploads/assets/a.glb',{signal:selecting.signal});
    selecting.abort();await assert.rejects(()=>pending,{name:'AbortError'});
    delete win.MUZIKAZ_API;
    win.fetch=async()=>binaryResponse();const late=new AbortController();let disposed=0;
    await assert.rejects(()=>loadGameModel({parseAsync:async()=>{late.abort();return {scene:{traverse:visit=>visit({geometry:{dispose(){disposed++;}},material:{dispose(){disposed++;}}})}};}},'/public/models/a.glb',{signal:late.signal}),{name:'AbortError'});
    assert.equal(disposed,2,'a scene completed after cancellation is disposed');
  });
});
