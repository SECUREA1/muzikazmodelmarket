import test from 'node:test';
import assert from 'node:assert/strict';
import {readJsonResponse} from '../public/js/json-response.js';
import {SharedGameInventory} from '../public/js/shared-game-inventory.js';
import {fetchEnvironmentList,fetchEnvironment} from '../public/js/environments/environment-api.js';

test('game JSON reads retain valid data and server error details',async()=>{
 for(const value of [{success:true,data:{items:[]}},[{id:'factory'}],{success:false,code:'CSRF_INVALID',message:'Refresh the session.'}])assert.deepEqual(await readJsonResponse(Response.json(value)),value);
});

test('HTML deployment errors and malformed game data have a retryable message instead of a JSON parser crash',async()=>{
 for(const response of [new Response('<!doctype html><title>Bad gateway</title>',{status:502,headers:{'content-type':'text/html'}}),new Response('undefined',{headers:{'content-type':'application/json'}}),Response.json(null),Response.json('not a map')]){
  await assert.rejects(readJsonResponse(response),error=>error.code==='INVALID_JSON_RESPONSE'&&error.status===response.status&&/try again/i.test(error.message)&&!/JSON\.parse|Unexpected token/i.test(error.message));
 }
 const aborted=new DOMException('Cancelled','AbortError');
 await assert.rejects(readJsonResponse({status:200,json:async()=>{throw aborted;}}),error=>error===aborted);
});

test('an invalid paid-action response never replays a manufacturing request',async()=>{
 const previous=globalThis.window,calls=[];
 try{
  globalThis.window={fetch:async(path,options)=>{calls.push({path,options});return new Response('<html>Restarting</html>',{status:503,headers:{'content-type':'text/html'}});}};
  await assert.rejects(new SharedGameInventory().api('/api/world-supply/produce',{method:'POST',body:JSON.stringify({itemId:'material:wood',quantity:10,requestId:'saved-retry-id'})}),{code:'INVALID_JSON_RESPONSE',status:503});
  assert.equal(calls.length,1);assert.equal(calls[0].options.retries,0);assert.equal(JSON.parse(calls[0].options.body).requestId,'saved-retry-id');
 }finally{globalThis.window=previous;}
});

test('a non-JSON registry response falls back to the authored map directory and individual lookups keep a useful error',async()=>{
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch,calls=[];
 try{
  globalThis.window={};globalThis.fetch=async path=>{calls.push(path);return path==='/public/models/environments/environments.json'?Response.json([{id:'world-item-factory'}]):new Response('<html>Service starting</html>',{headers:{'content-type':'text/html'}});};
  assert.deepEqual(await fetchEnvironmentList(),[{id:'world-item-factory'}]);assert.deepEqual(calls,['/api/environments','/public/models/environments/environments.json']);
  await assert.rejects(fetchEnvironment('world-item-factory'),error=>error.code==='INVALID_JSON_RESPONSE'&&/map server/.test(error.message));
 }finally{globalThis.window=previousWindow;globalThis.fetch=previousFetch;}
});
