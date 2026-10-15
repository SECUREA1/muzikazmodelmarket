import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {connectAuthoritativeRoom} from '../public/js/authoritative-room-client.js';
test('room client projects confirmed snapshots and stops actions after connection loss',async()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document;let unavailable=false,sequence=0;const requests=[],rendered=[],statuses=[];
 globalThis.document={hidden:false};
 globalThis.window={fetch:async(path,options)=>{
  requests.push({path,body:options.body&&JSON.parse(options.body)});
  if(unavailable)throw Error('offline');
  if(path==='/api/market/session')return {ok:true,json:async()=>({data:{csrfToken:'proof',account:{accountId:'test'}}})};
  return {ok:true,json:async()=>({data:{authoritative:true,selfId:'account:test',sequence:++sequence,players:{},objects:{},actors:{}}})};
 }};
 const client=connectAuthoritativeRoom({roomId:'shared',input:()=>({forward:1}),render:state=>rendered.push(state),onStatus:message=>statuses.push(message)});
 try{await pause(40);assert.equal(client.ready,true);await client.send('interact');assert.ok(rendered.every(state=>state.authoritative));assert.ok(requests.some(request=>request.body?.action==='interact'));const count=rendered.length;unavailable=true;await assert.rejects(client.object({id:'unconfirmed',revision:0,object:{}}),/offline/);assert.equal(rendered.length,count);await pause(180);assert.equal(client.ready,false);assert.ok(statuses.some(message=>message.includes('Server connection required')));await assert.rejects(client.object({id:'offline-item'}),/Waiting for the server/);client.stop();await assert.rejects(client.send('interact'),/Room closed/);}finally{client.stop();globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
