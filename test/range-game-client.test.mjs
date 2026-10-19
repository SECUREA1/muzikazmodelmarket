import test from 'node:test';
import assert from 'node:assert/strict';
import {createRangeGameClient} from '../public/js/range-game-client.js';

test('range client joins a waiting lobby, ignores stale snapshots and leaves without restarting',async t=>{
 const calls=[],accepted=[];let sequence=0;
 const api={roomSession:async()=>({csrfToken:'test'}),api:async(path,options)=>{const body=JSON.parse(options.body);calls.push({path,body});return {sequence:++sequence,started:body.action==='start',players:[]};}};
 const client=createRangeGameClient({roomId:'range/test',api,onSnapshot:snapshot=>accepted.push(snapshot)});t.after(()=>client.dispose());
 await client.command('join',{course:'precision'});
 assert.equal(client.joined,true);assert.equal(client.snapshot.started,false);
 assert.deepEqual(calls.map(call=>call.body.action),['join'],'joining never issues Start');
 assert.equal(calls[0].path,'/api/rooms/range%2Ftest/range');
 await client.command('start');assert.equal(client.snapshot.started,true);
 sequence=0;await client.command('watch');assert.equal(client.snapshot.started,true,'late snapshots cannot undo a started match');
 assert.equal(accepted.length,2);
 client.dispose();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.at(-1).body.action,'leave');assert.equal(client.joined,false);
});

test('range shots have one request in flight and CSRF retries reuse the action id',async t=>{
 let sessions=0,retries=0,release;
 const bodies=[],api={roomSession:async()=>({csrfToken:String(++sessions)}),api:async(_path,options)=>{
  const body=JSON.parse(options.body);bodies.push(body);
  if(body.action==='join')return {sequence:1};
  if(body.action==='shot'){
   if(!retries++)throw Object.assign(Error('expired'),{code:'CSRF_INVALID'});
   return new Promise(resolve=>{release=()=>resolve({sequence:2,result:{hit:true,points:100}});});
  }
  return {sequence:3};
 }};
 const client=createRangeGameClient({roomId:'firing-range',api});t.after(()=>client.dispose());
 await client.command('join');
 const first=client.shoot({x:0,y:1.55,z:5},{x:0,y:0,z:-1});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(await client.shoot({},{}),null,'rapid repeated taps do not duplicate a pending shot');
 assert.equal(sessions,2);assert.equal(bodies[1].requestId,bodies[2].requestId);
 release();assert.equal((await first).result.points,100);
});
