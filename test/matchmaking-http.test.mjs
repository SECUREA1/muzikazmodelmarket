import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable,Writable} from 'node:stream';

test('matchmaking lets two players reserve spots before a host starts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'matchmaking-http-'));const oldEnv={...process.env};
 Object.assign(process.env,{MUZIKAZ_ADMIN_PASSWORD:'boots',MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json'),MUZIKAZ_AVATAR_UPLOAD_DIR:join(dir,'avatar-uploads'),MUZIKAZ_ASSET_UPLOAD_DIR:join(dir,'asset-uploads'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(dir,'environment-uploads')});
 try{
  // Exercise the real HTTP handler without binding a TCP port in the sandbox.
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export { server, presence, paymentOrderStore, reconcileStorePayments };');
  const modulePath=join(dir,'handler.mjs');await writeFile(modulePath,source);const {server,presence,paymentOrderStore,reconcileStorePayments}=await import(pathToFileURL(modulePath).href);const handler=server.listeners('request')[0];
  async function call(url,headers={},body,method=body?'POST':'GET'){
   const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url,method,headers:{host:'localhost','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}});
   const result={headers:{}};const res={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,headers){result.status=status;for(const[key,value]of Object.entries(headers))this.setHeader(key,value);this.headersSent=true;},end(data){result.body=JSON.parse(data);}};
   await handler(req,res);return result;
  }
  const accounts=[];
  for(const username of ['LobbyHost','LobbyGuest']){const login=await call('/api/access/free-play',{}, {username,password:'matchmaking-test-password'});assert.equal(login.status,200);accounts.push({authorization:'Bearer '+login.body.data.sessionToken});}
  let directory=await call('/api/matches');assert.equal(directory.status,200);assert.ok(directory.body.data.matches.some(match=>match.mapId==='basketball-arena'&&match.canJoin));
  const hockey='/api/rooms/hockey-arena/hockey';
  const one=await call(hockey,accounts[0],{action:'join'}),two=await call(hockey,accounts[1],{action:'join'});assert.equal(one.status,200);assert.equal(two.status,200);assert.equal(one.body.data.started,false);assert.equal(two.body.data.started,false);assert.equal(two.body.data.state.host,one.body.data.selfId);assert.equal(two.body.data.state.players.filter(player=>player.human).length,2);
  await new Promise(resolve=>setTimeout(resolve,100));
  const waiting=await call(hockey,accounts[0],{action:'watch'});assert.equal(waiting.body.data.state.remaining,one.body.data.state.remaining);
  directory=await call('/api/matches');let match=directory.body.data.matches.find(match=>match.mapId==='hockey-arena');assert.equal(match.status,'waiting');assert.equal(match.players,2);assert.equal(match.openSlots,8);assert.ok(match.joinUrl.includes('matchmaking=1'));
  assert.equal((await call(hockey,accounts[1],{action:'start'})).status,403);const start=await call(hockey,accounts[0],{action:'start'});assert.equal(start.status,200);assert.equal(start.body.data.started,true);
  const arcade='/api/rooms/neon-junction/arcade';
  const arcadeOne=await call(arcade,accounts[0],{action:'join',game:4}),arcadeTwo=await call(arcade,accounts[1],{action:'join',game:4});assert.equal(arcadeOne.status,200);assert.equal(arcadeTwo.status,200);assert.equal(arcadeTwo.body.data.started,false);
  directory=await call('/api/matches');match=directory.body.data.matches.find(match=>match.mapId==='neon-junction');assert.equal(match.gameIndex,4);assert.equal(match.status,'waiting');assert.equal(match.players,2);assert.ok(match.joinUrl.includes('attraction=billiards'));assert.equal((await call(arcade,accounts[1],{action:'start'})).status,403);assert.equal((await call(arcade,accounts[0],{action:'start'})).body.data.started,true);
  const court='/api/rooms/basketball-arena/gameplay';const courtOne=await call(court,accounts[0],{action:'join',requestId:'court-host'}),courtTwo=await call(court,accounts[1],{action:'join',requestId:'court-guest'});assert.equal(courtOne.status,200);assert.equal(courtTwo.status,200);assert.equal(courtTwo.body.data.basketball.state,'ready');assert.equal(courtTwo.body.data.basketball.clockMs,courtOne.body.data.basketball.clockMs);
  directory=await call('/api/matches');match=directory.body.data.matches.find(match=>match.mapId==='basketball-arena');assert.equal(match.status,'waiting');assert.equal(match.players,2);assert.ok(match.openSlots>0);
  const courtWatch=await call(court,accounts[1],{action:'basketball-watch',requestId:'court-guest-watch'});assert.equal(courtWatch.status,200);
  const courtBegin=await call(court,accounts[0],{action:'basketball-start',requestId:'court-host-begin-alone'});
  assert.equal(courtBegin.status,200);assert.equal(courtBegin.body.data.basketball.state,'live');
  const courtRoster=Object.values(courtBegin.body.data.players).filter(player=>player.basketballRole!=='spectator'&&player.basketballTeam);
  assert.equal(courtRoster.length,10,'the host can begin with every reserved human spot still empty');
  assert.equal(courtRoster.filter(player=>player.basketballAI).length,9,'AI fills all spots beside the lone host');
  const range='/api/rooms/firing-range/range';
  assert.equal((await call(range,{}, {action:'join'})).status,401,'range commands require a signed-in game session');
  assert.equal((await call('/api/rooms/hockey-arena/range',accounts[0],{action:'join'})).status,404,'range commands cannot open another game runtime');
  const rangeOne=await call(range,accounts[0],{action:'join'}),rangeTwo=await call(range,accounts[1],{action:'join'});
  assert.equal(rangeOne.status,200);assert.equal(rangeTwo.status,200);assert.equal(rangeTwo.body.data.started,false);assert.equal(rangeTwo.body.data.host,rangeOne.body.data.selfId);
  await new Promise(resolve=>setTimeout(resolve,100));
  const rangeWaiting=await call(range,accounts[0],{action:'watch'});assert.equal(rangeWaiting.body.data.remaining,rangeOne.body.data.remaining,'lobby clocks stay still while players join');
  directory=await call('/api/matches');match=directory.body.data.matches.find(match=>match.mapId==='firing-range');
  assert.equal(match.game,'firing-range');assert.equal(match.status,'waiting');assert.equal(match.players,2);assert.equal(match.hostName,'LobbyHost');assert.ok(match.openSlots>0);
  assert.equal(new URL(match.joinUrl,'https://muzikaz.com').searchParams.get('matchmaking'),'1');
  assert.equal((await call(range,accounts[1],{action:'start'})).status,403,'a guest cannot start the shared qualification round');
  const rangeStart=await call(range,accounts[0],{action:'start'});assert.equal(rangeStart.status,200);assert.equal(rangeStart.body.data.started,true);
  directory=await call('/api/matches');match=directory.body.data.matches.find(match=>match.mapId==='firing-range');assert.equal(match.status,'playing');
  assert.equal((await call('/api/environments/firing-range')).body.data.playerCount,2,'live range metadata includes joined shooters');
  assert.equal((await call(hockey,accounts[1],{action:'join'})).status,200);
  directory=await call('/api/matches');match=directory.body.data.matches.find(match=>match.mapId==='firing-range');assert.equal(match.players,1,'moving to hockey releases the previous range spot');
  }finally{for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
