import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {worldRadioCalls} from '../server-world-radio.mjs';

const now=100000;
const world=(id,extra={})=>({id,name:'World '+id,visibility:'public',playable:true,multiplayer:true,...extra});
function room(extra={}){return {simulation:{liveDispatch:{id:'dispatch-1',questId:'supply',title:'Supply run',mode:'foot',at:90000,expires:180000},players:{},...extra}};}
function leader(extra={}){return {username:'Rescuer',health:100,lastSeen:now,position:{x:1,y:0,z:2},vehicleMission:{instanceId:'mission-1',questId:'rescue',title:'Rescue crew',status:'active',shared:true,mode:'boat',startedAt:95000,deadline:200000,helpRequestedAt:99000,helpExpires:189000,checkpoints:[{name:'Stranded crew',actorId:'crew'}],index:0,team:{p:{role:'leader'}}},...extra};}

test('world radio aggregates actionable jobs from separate public maps, with player help first',()=>{
 const rooms={harbor:room({players:{p:leader()},actors:{crew:{position:{x:40,y:0,z:60}}}}),airport:room()};
 const calls=worldRadioCalls(rooms,[world('harbor'),world('airport')],now);
 assert.equal(calls.length,3);assert.equal(calls[0].type,'player');
 assert.equal(calls[0].worldId,'harbor');assert.equal(calls[0].teamId,'mission-1');assert.equal(calls[0].leaderId,'p');assert.equal(calls[0].at,99000);assert.equal(calls[0].expires,189000);assert.deepEqual(calls[0].position,{x:40,y:0,z:60});
 assert.deepEqual(new Set(calls.filter(call=>call.type==='ai').map(call=>call.worldId)),new Set(['harbor','airport']));
 assert.equal(new Set(calls.map(call=>call.id)).size,3,'dispatch ids are scoped to their world');
 assert.deepEqual(worldRadioCalls(rooms,[world('harbor'),world('airport')],now),calls,'polling preserves call ids');
});

test('private, unlisted, non-playable and solo maps never broadcast',()=>{
 const maps=[world('private',{visibility:'private',publicDestination:true}),world('unlisted',{visibility:'unlisted'}),world('unknown',{visibility:undefined}),world('disabled',{playable:false}),world('solo',{multiplayer:false}),world('unshared',{sharedWorld:false}),world('builder-solo',{builderScene:{gameplay:{multiplayer:false}}})];
 const rooms=Object.fromEntries(maps.map(map=>[map.id,room({players:{p:leader()}})]));
 assert.deepEqual(worldRadioCalls(rooms,maps,now),[]);
});

test('expired AI offers and local private conversations are not projected',()=>{
 const rooms={a:room({liveDispatch:{id:'old',questId:'rescue',expires:now},transportRadio:[{id:1,speaker:'Private contact',text:'Secret',recipients:['p']}]})};
 assert.deepEqual(worldRadioCalls(rooms,[world('a')],now),[]);
 rooms.a.simulation.liveDispatch.expires=now+1000;
 const [call]=worldRadioCalls(rooms,[world('a')],now);assert.equal(call.type,'ai');assert.ok(!JSON.stringify(call).includes('Secret'));
});

test('ended, full, stale, defeated, travelling and AI leaders cannot advertise help',()=>{
 const cases=[p=>p.lastSeen=now-15000,p=>p.health=0,p=>p.replacedByRoom='elsewhere',p=>p.basketballAI=true,p=>p.isAI=true,p=>p.vehicleMission.status='completed',p=>p.vehicleMission.shared=false,p=>p.vehicleMission.teamLeader='other',p=>p.vehicleMission.siteWork=true,p=>p.vehicleMission.deadline=now,p=>p.vehicleMission.helpExpires=now,p=>p.vehicleMission.team={p:{},a:{},b:{},c:{}}];
 for(const mutate of cases){const p=leader();mutate(p);assert.deepEqual(worldRadioCalls({a:room({liveDispatch:null,players:{p}})},[world('a')],now),[]);}
});

test('help calls follow moving targets without leaking actor records',()=>{
 const p=leader(),sim=room({liveDispatch:null,players:{p},actors:{crew:{position:{x:70,z:80},secret:'local-only'}}}),maps=[world('a')];
 const [first]=worldRadioCalls({a:sim},maps,now);assert.deepEqual(first.position,{x:70,y:0,z:80});assert.ok(!JSON.stringify(first).includes('local-only'));
 delete sim.simulation.actors.crew;
 assert.deepEqual(worldRadioCalls({a:sim},maps,now)[0].position,p.position);
});

test('the world feed is bounded and keeps recent player requests ahead of AI jobs',()=>{
 const maps=Array.from({length:30},(_,i)=>world('w'+i)),rooms=Object.fromEntries(maps.map((map,i)=>[map.id,room({players:{p:leader({vehicleMission:{...leader().vehicleMission,helpRequestedAt:now-i}})}})]));
 const calls=worldRadioCalls(rooms,maps,now);assert.equal(calls.length,24);assert.ok(calls.every(call=>call.type==='player'));assert.equal(calls[0].worldId,'w0');assert.equal(calls.at(-1).worldId,'w23');
});

test('the public world radio API projects jobs without broadcasting room conversations',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'world-radio-api-')),previous={...process.env},at=Date.now();
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json'),MUZIKAZ_CUSTOM_MAPS_FILE:join(dir,'custom-maps.json'),MUZIKAZ_ENVIRONMENT_DATA_FILE:join(dir,'environments.json')});
 try{
  const airport=room({liveDispatch:{id:'fresh-flight',questId:'air-recovery',title:'Search flight',mode:'aircraft',at,expires:at+90000},transportRadio:[{id:1,text:'Private conversation',recipients:['p']}]});
  await writeFile(join(dir,'shared-rooms.json'),JSON.stringify({'muzikaz-airport':airport}));
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8'),source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server};').replace(/\nsnapshotServer\(\)\.catch[^\n]+/,'').replace(/\nbackgroundJob\(\(\)=>snapshotServer\(\)\);/,'');
  const filename=join(dir,'server-handler.mjs');await writeFile(filename,source);
  const {server}=await import(pathToFileURL(filename).href),handler=server.listeners('request')[0];
  const req=Readable.from([]);Object.assign(req,{url:'/api/world-radio',method:'GET',headers:{host:'localhost'},socket:{remoteAddress:'127.0.0.1'}});
  const output={},res={setHeader(){},getHeader(){},writeHead(status){output.status=status;this.headersSent=true;},end(data){output.body=JSON.parse(data);}};
  await handler(req,res);
  assert.equal(output.status,200);assert.ok(output.body.data.serverTime>=at);
  const [call]=output.body.data.calls;assert.equal(call.id,'muzikaz-airport:fresh-flight');assert.equal(call.questId,'air-recovery');assert.equal(call.type,'ai');assert.ok(!JSON.stringify(output.body).includes('Private conversation'));
 }finally{
  for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
  await rm(dir,{recursive:true,force:true});
 }
});
