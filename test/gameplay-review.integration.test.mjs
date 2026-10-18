import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';

test('two players publish, enter and play the same builder scene through the running server',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gameplay-review-'));
 const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'payments.json')},stdio:'ignore'});
 const base=`http://127.0.0.1:${port}`;
 async function request(path,{headers={},body,method=body?'POST':'GET',status=200}={}){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});const payload=await response.json();
  assert.equal(response.status,status,JSON.stringify(payload));return {data:payload.data,response};
 }
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(child.exitCode!==null)throw Error('Review server stopped');await pause(50);}
  async function guest(){const {response}=await request('/api/access/guest',{body:{},status:201});const cookie=response.headers.get('set-cookie').split(';')[0];const {data}=await request('/api/market/session',{headers:{cookie}});return {cookie,'X-CSRF-Token':data.csrfToken};}
  const a=await guest(),b=await guest();
  const scene={id:'review-playable-map',name:'Review playable courtyard',layout:'courtyard',mapSize:50,gameplay:{multiplayer:true},objects:[
   {id:'review-seat',modelId:'park-bench',position:{x:8,y:0,z:8},rotation:{x:0,y:.4,z:0},scale:{x:1.2,y:1.2,z:1.2},functionalSettings:{behavior:'seat'}},
   {id:'review-arcade',modelId:'tic-tac-toe-cabinet',position:{x:5,y:0,z:5},functionalSettings:{behavior:'interact',device:'commons-arcade'}}
  ]};
  const published=await request('/api/custom-maps',{headers:a,body:{scene},status:201});
  assert.match(published.data.playUrl,/mode=multiplayer/);assert.equal(published.data.builderScene.layout,'courtyard');
  assert.deepEqual(published.data.builderScene.objects.map(o=>o.id),scene.objects.map(o=>o.id));
  const endpoint='/api/rooms/'+scene.id+'/gameplay';
  const command=async(headers,action,fields={})=>(await request(endpoint,{headers,body:{action,requestId:crypto.randomUUID(),...fields}})).data;
  const joinedA=await command(a,'join'),joinedB=await command(b,'join');
  assert.notEqual(joinedA.selfId,joinedB.selfId);assert.equal(Object.keys(joinedB.players).length,2);
  assert.ok(joinedB.actors['review-seat']);assert.ok(joinedB.actors['review-arcade']);
  const before=joinedB.players[joinedA.selfId].position;
  await command(a,'input',{inputEpoch:joinedA.result.inputEpoch,inputSequence:1,input:{side:1}});await pause(250);
  await command(a,'input',{inputEpoch:joinedA.result.inputEpoch,inputSequence:2,input:{}});
  const viewA=await command(a,'input',{inputEpoch:joinedA.result.inputEpoch,inputSequence:3,input:{}});
  const viewB=await command(b,'input',{inputEpoch:joinedB.result.inputEpoch,inputSequence:1,input:{}});
  assert.ok(Math.hypot(viewA.players[joinedA.selfId].position.x-before.x,viewA.players[joinedA.selfId].position.z-before.z)>.05);
  assert.deepEqual(viewB.players[joinedA.selfId].position,viewA.players[joinedA.selfId].position);
  const shot=await command(a,'fire',{tool:'laser',direction:[0,0,-1]});
  assert.ok(shot.events.some(e=>e.actorId===joinedA.selfId&&e.action==='fire'));
  const spectator=await command(b,'input',{inputEpoch:joinedB.result.inputEpoch,inputSequence:2,input:{}});
  assert.ok(spectator.events.some(e=>e.actorId===joinedA.selfId&&e.action==='fire'));
  await request('/api/custom-maps',{headers:b,body:{scene},status:409});
  const saved=(await request('/api/custom-maps')).data.find(map=>map.id===scene.id);
  assert.ok(saved);assert.equal(saved.builderScene.layout,'courtyard');
 }finally{
  if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;}
  await rm(dir,{recursive:true,force:true});
 }
});
