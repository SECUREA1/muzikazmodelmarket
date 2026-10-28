// Real HTTP pressure against a disposable local instance of the unmodified server.
// No remote target option: all accounts, sessions, maps and writes are temporary.
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp, mkdir, rm, readFile, writeFile, access} from 'node:fs/promises';
import {tmpdir, cpus, totalmem} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {randomUUID, createHash} from 'node:crypto';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {LoadoutCodeStore} from '../loadout-code-store.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {DurableSessionStore} from '../session-store.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {hydrateRoomSnapshot,snapshotAcknowledgements} from '../public/js/room-snapshot.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const options = Object.fromEntries(process.argv.slice(2).map(argument => {
  const match = argument.match(/^--([\w-]+)=(.+)$/);
  if (!match) throw Error('Use --profile=smoke|full --duration=20 --output=/path/results.json');
  return [match[1], match[2]];
}));
for (const key of Object.keys(options)) if (!['profile', 'duration', 'output', 'scenario', 'players', 'heap-mb', 'start-gate', 'fixture-accounts', 'stage-seconds'].includes(key)) throw Error('Unknown option: '+key);
const profile = options.profile || 'full';
if (!['smoke', 'full'].includes(profile)) throw Error('Unknown profile');
const duration = Number(options.duration || (profile === 'smoke' ? 3 : 20)) * 1000;
if (!(duration >= 1000 && duration <= 300000)) throw Error('Duration must be 1–300 seconds per stage');
const heapMb = Number(options['heap-mb'] || 2048);
if (!Number.isInteger(heapMb) || heapMb < 128 || heapMb > 4096) throw Error('Heap limit must be 128–4096 MiB');
const stageSeconds = Number(options['stage-seconds'] || 180);
if (!Number.isFinite(stageSeconds) || stageSeconds < 10 || stageSeconds > 600) throw Error('Stage budget must be 10–600 seconds');
const fixtureAccounts = Number(options['fixture-accounts'] || 0);
if (!Number.isInteger(fixtureAccounts) || fixtureAccounts < 0 || fixtureAccounts > 1000) throw Error('Fixture accounts must be 0–1000');
const selected = options.scenario?.split(',');
const allScenarios = profile === 'smoke' ? [
  {name: 'builder-1', count: 1, kind: 'builder'},
  {name: 'builder-5', count: 5, kind: 'builder'},
  {name: 'commons-5', count: 5, kind: 'commons'},
  {name: 'mixed-smoke-2', count: 2, kind: 'builder', mixed: true},
] : [
  ...[1, 5, 15].map(count => ({name: 'builder-'+count, count, kind: 'builder'})),
  {name: 'builder-dense-15', count: 15, kind: 'builder', objects: 200},
  ...[30, 60, 120, 240].map(count => ({name: 'multi-room-'+count, count, kind: 'builder', rooms: Math.ceil(count / 15)})),
  ...[15, 32, 64, 128].map(count => ({name: 'commons-'+count, count, kind: 'commons'})),
  {name: 'airport-15', count: 15, kind: 'airport'},
  {name: 'construction-15', count: 15, kind: 'construction'},
  {name: 'hockey-10', count: 10, kind: 'hockey'},
  {name: 'arcade-2', count: 2, kind: 'arcade'},
  {name: 'mixed-30', count: 30, kind: 'builder', rooms: 2, mixed: true},
  {name: 'login-burst-15', count: 15, kind: 'login'},
];
let scenarios = allScenarios.filter(scenario => !selected || selected.includes(scenario.name));
if (options.players) scenarios = [{name:'custom-'+options.players, count:Number(options.players), kind:'commons'}];
if (!scenarios.length || scenarios.some(s => !Number.isInteger(s.count) || s.count < 1 || s.count > 512)) throw Error('No valid scenarios (players must be 1–512)');
const output = resolve(options.output || join(root, 'work', 'server-pressure', 'results.json'));
const directory = await mkdtemp(join(tmpdir(), 'muzikaz-http-pressure-'));
const samples = [], serverErrors = [], failures = [];
let child, base, stopped = false, probeRun = 0, baselineFiles;
async function optionalFile(path) {try{return (await readFile(path,'utf8')).trim();}catch{return null;}}
const report = {schemaVersion:1, startedAt:new Date().toISOString(), profile, durationMs:duration,
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  dirtyPaths:execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean),
  harnessSHA256:createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
  environment:{node:process.version, cpu:cpus()[0]?.model, logicalCpus:cpus().length, hostMemoryBytes:totalmem(), heapLimitMb:heapMb,
    cgroupCpuMax:await optionalFile('/sys/fs/cgroup/cpu.max'),cgroupMemoryMax:await optionalFile('/sys/fs/cgroup/memory.max')},
  methodology:{target:'loopback HTTP, separate server process', accountSetup:'synthetic accounts created using real account/user/session store APIs before timing', inputIntervalMs:50,
    scheduler:'per-client 20 Hz offered slots; at most one in-flight input per client; skipped slots counted',
    snapshotProtocol:'Protocol 2, matching the current browser client; exact hydrated state is validated. Input timing and deadline delivery include hydration.',
    stageIsolation:'fresh server and identical seeded accounts/users/sessions before every stage; only that stage actors plus a spare are authenticated before timing',
    stageWallBudgetSeconds:stageSeconds,
    scope:'one server process; movement/snapshot pressure, selected mixed fire/economy writes, sports inputs; no vehicle-driving/GPU/render/VR/WAN benchmark; no production traffic or payments',
    acceptance:{p95InputMs:100,p99InputMs:250,minimumDeliveredSlotRatio:.95,maximumUnexpectedErrorRatio:.01,p95GeneralWorldFrameAgeMs:100}},
  scenarios:[], failures};

function percentile(values, p) { if (!values.length) return null; const sorted=[...values].sort((a,b)=>a-b); return +sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)].toFixed(3); }
function summary(values) { return {count:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:values.length?+values.reduce((max,value)=>Math.max(max,value),-Infinity).toFixed(3):null}; }
async function save() { await mkdir(dirname(output),{recursive:true}); await writeFile(output,JSON.stringify(report,null,2)+'\n'); }
async function parallel(items, concurrency, action) { let index=0; await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(index<items.length){const i=index++;await action(items[i],i);}})); }
async function call(path, {actor,body,timeout=15000,method=body?'POST':'GET'}={}) {
  const begin=performance.now();
  try {
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{authorization:'Bearer '+actor.token,'X-CSRF-Token':actor.csrfToken,...(actor.gameSessionToken?{'X-Game-Session':actor.gameSessionToken}:{})}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});
    const text=await response.text(); let payload;
    try{payload=JSON.parse(text);}catch{payload={message:text.slice(0,120)};}
    return {status:response.status,data:payload.data,payload,bytes:Buffer.byteLength(text),ms:performance.now()-begin};
  }catch(error){return {status:0,payload:{code:error.name,message:error.message},bytes:0,ms:performance.now()-begin};}
}
function requireSuccess(result, label, status=200) {if(result.status!==status)throw Error(label+': '+result.status+' '+JSON.stringify(result.payload).slice(0,500));return result.data;}
async function seed(count) {
  const store=new LoadoutCodeStore(join(directory,'accounts.json'));
  const users=new UserJsonDatabase(join(directory,'users.json'));
  const sessions=new DurableSessionStore(join(directory,'account-sessions.json'),{kind:'account',persistent:true,ttlSeconds:34560000});
  const actors=[];
  for(let i=0;i<count;i++){
    const account=await store.freePlayLogin('Pressure'+String(i).padStart(4,'0'),randomUUID());
    await users.ensureAccount(account);
    const session=await sessions.createSession(account);
    actors.push({accountId:account.accountId,token:session.token,csrfToken:session.csrfToken,sequence:0});
    if(i%25===0||i===count-1)console.log(JSON.stringify({event:'account-setup',completed:i+1,total:count}));
  }
  return actors;
}
async function start() {
  const probe=createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));base='http://127.0.0.1:'+port;
  const env={...process.env,PORT:String(port),NODE_ENV:'production',PUBLIC_BASE_URL:base,MUZIKAZ_CORS_ORIGINS:base,
    MUZIKAZ_DATA_DIR:directory,MUZIKAZ_USER_DATABASE_FILE:join(directory,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(directory,'accounts.json'),
    MUZIKAZ_PAYMENT_ORDERS_FILE:join(directory,'payments.json'),MUZIKAZ_ACCOUNT_SESSIONS_FILE:join(directory,'account-sessions.json'),MUZIKAZ_GAME_SESSIONS_FILE:join(directory,'game-sessions.json'),
    MUZIKAZ_CUSTOM_MAPS_FILE:join(directory,'custom-maps.json'),MUZIKAZ_ENVIRONMENT_DATA_FILE:join(directory,'environments.json'),
    MUZIKAZ_AVATAR_UPLOAD_DIR:join(directory,'uploads','avatars'),MUZIKAZ_ASSET_UPLOAD_DIR:join(directory,'uploads','assets'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(directory,'uploads','environments'),
    UPLOAD_STORAGE_PATH:join(directory,'uploads','models'),MUZIKAZ_BACKUP_DIR:join(directory,'backups'),MUZIKAZ_ADMIN_USERNAME:'pressure-fixture',MUZIKAZ_ADMIN_PASSWORD:randomUUID(),MUZIKAZ_ADMIN_SESSION_SECRET:randomUUID()};
  child=spawn(process.execPath,['--max-old-space-size='+heapMb,'--import',fileURLToPath(new URL('./pressure-test-probe.mjs',import.meta.url)),'server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe','ipc']});
  child.on('message',message=>{if(message.type==='pressure-sample')samples.push(message);});
  child.stdout.on('data',()=>{});child.stderr.on('data',chunk=>{const text=chunk.toString();if(serverErrors.length<100)serverErrors.push(text.slice(0,2000));});
  child.on('exit',(code,signal)=>{if(!stopped)failures.push({stage:'server-exit',code,signal});});
  for(let i=0;i<200;i++){if(child.exitCode!==null)throw Error('Server exited on startup');const health=await call('/api/health',{timeout:1000});if(health.status===200)return;await pause(50);}
  throw Error('Server failed to become healthy');
}
async function stop(signal='SIGTERM') {
  if(!child||child.exitCode!==null||child.signalCode!==null){child=null;return;}
  stopped=true;const stopping=child,exited=new Promise(resolve=>stopping.once('exit',resolve));stopping.kill(signal);
  const killer=setTimeout(()=>{if(stopping.exitCode===null&&stopping.signalCode===null)stopping.kill('SIGKILL');},5000);
  try{await exited;}finally{clearTimeout(killer);if(child===stopping)child=null;stopped=false;}
}
async function resetFixture(actors) {
  await stop();await rm(directory,{recursive:true,force:true});await mkdir(directory,{recursive:true});
  for(const [name,bytes]of baselineFiles)await writeFile(join(directory,name),bytes,{mode:0o600});
  for(const actor of actors)delete actor.gameSessionToken;
}
async function publish(actor,id,objects=12) {
  const scene={id,name:'Pressure test '+id,layout:'courtyard',mapSize:100,gameplay:{multiplayer:true},objects:Array.from({length:objects},(_,i)=>({id:id+'-bench-'+i,modelId:'park-bench',position:{x:15+(i%6)*5,y:0,z:15+Math.floor(i/6)*5},functionalSettings:{behavior:'seat'}}))};
  return requireSuccess(await call('/api/custom-maps',{actor,body:{scene},timeout:60000}),'publish fixture map',201);
}
async function warm(actors) {
  const times=[];
  await parallel(actors,4,async actor=>{const result=await call('/api/game/room-session',{actor,timeout:120000});requireSuccess(result,'warm authenticated session');times.push(result.ms);});
  return summary(times);
}
async function occupancy(scenario, group, roomIds, endpoint) {
  const rooms=[];
  await parallel(roomIds,4,async roomId=>{
    const expected=group.filter(actor=>actor.roomId===roomId),actor=expected.find(actor=>actor.joined);
    // Hockey only permits watch for spectators. Players return the same
    // snapshot through an ordered neutral input; arcade accepts player watch.
    const result=['hockey','arcade'].includes(scenario.kind)
      ? actor?await call(endpoint(actor),{actor,body:scenario.kind==='hockey'?{action:'input',input:{},inputEpoch:actor.epoch,inputSequence:++actor.sequence}:{action:'watch'}}):{status:0}
      : await call('/api/rooms/'+encodeURIComponent(roomId)+'/gameplay');
    const data=result.data;
    const present=scenario.kind==='hockey'?(data?.state?.players||[]).flatMap(player=>player.human?[player.human]:[])
      :scenario.kind==='arcade'?(data?.slots||[]).flatMap(slot=>slot.actor?[slot.actor]:[])
      :Object.keys(data?.players||{}).filter(id=>!data.players[id].basketballAI);
    const missing=expected.map(actor=>'account:'+actor.accountId).filter(id=>!present.includes(id));
    rooms.push({roomId,status:result.status,expected:expected.length,activeHumans:present.length,missing});
  });
  return {expected:group.length,activeHumans:rooms.reduce((sum,room)=>sum+room.activeHumans,0),
    allExpectedPresent:rooms.every(room=>room.status===200&&room.missing.length===0),rooms};
}
async function run(scenario, actors) {
  console.log(JSON.stringify({event:'stage-start',scenario:scenario.name,players:scenario.count}));
  if(scenario.kind==='login')return loginBurst(scenario);
  const group=actors.slice(0,scenario.count), roomIds=[];
  if(scenario.kind==='builder')for(let i=0;i<(scenario.rooms||1);i++){const id='pressure-'+(++probeRun)+'-'+i;await publish(actors[0],id,scenario.objects||12);roomIds.push(id);}
  const native={commons:'public-commons',airport:'muzikaz-airport',construction:'skyscraper-construction',hockey:'hockey-arena',arcade:'neon-junction'};
  if(scenario.kind!=='builder')roomIds.push(native[scenario.kind]);
  const endpoint=actor=>'/api/rooms/'+encodeURIComponent(actor.roomId)+'/'+(['hockey','arcade'].includes(scenario.kind)?scenario.kind:'gameplay');
  const joinLatencies=[], errors=[], inputLatencies=[], scheduledLatencies=[], healthLatencies=[], sideLatencies=[], statuses={},frameAges=[],decodeLatencies=[];
  let sent=0,completed=0,successful=0,successfulByDeadline=0,bytes=0,bytesByDeadline=0,invalid=0,healthErrors=0,sideErrors=0,keepaliveErrors=0;
  const inflight=new Set(),sideTypes={};
  for(const [index,actor]of group.entries()){
    actor.roomId=roomIds[scenario.rooms?Math.floor(index/15):0];actor.sequence=0;actor.busy=false;actor.joined=false;actor.successfulInputs=0;actor.snapshot=null;
  }
  const generalWorld=!['hockey','arcade'].includes(scenario.kind);
  const controlsProtocol=actor=>({snapshotMode:'compact',snapshotProtocol:2,snapshotAcknowledgements:snapshotAcknowledgements(actor.snapshot),sceneVersion:actor.sceneVersion,actorSetRevision:actor.actorSetRevision,earthworksRevision:actor.snapshot?.construction?.earthworks?.revision});
  const updateProof=(actor,data,baseline=actor.snapshot)=>{
    if(generalWorld){
      if(actor.snapshot&&Number.isFinite(data.sequence)&&data.sequence<=actor.snapshot.sequence)return actor.snapshot;
      data=hydrateRoomSnapshot(data,baseline);actor.snapshot=data;
    }
    actor.epoch=data.inputEpoch||data.result?.inputEpoch||actor.epoch;
    actor.sceneVersion=data.sceneVersion||actor.sceneVersion;actor.actorSetRevision=data.actorSetRevision||actor.actorSetRevision;
    return data;
  };
  const joinAt=performance.now();
  let keepaliveBatch=null;
  const joinKeepalives=setInterval(()=>{
    if(keepaliveBatch)return;
    keepaliveBatch=parallel(group.filter(actor=>actor.joined),4,async actor=>{
      const baseline=actor.snapshot;
      const result=await call(endpoint(actor),{actor,body:{action:'input',requestId:randomUUID(),inputEpoch:actor.epoch,inputSequence:++actor.sequence,input:{},...controlsProtocol(actor)},timeout:15000});
      if(result.status===200){try{updateProof(actor,result.data,baseline);}catch{keepaliveErrors++;actor.snapshot=null;}}else keepaliveErrors++;
    }).finally(()=>{keepaliveBatch=null;});
  },1000);
  try{
    await parallel(group,8,async(actor,index)=>{
      const fields=scenario.kind==='hockey'?{slot:`${index%2}-${Math.floor(index/2)}`}:scenario.kind==='arcade'?{game:2,slot:index}:{};
      const joined=await call(endpoint(actor),{actor,body:{action:'join',requestId:randomUUID(),radToxEnabled:false,...fields},timeout:120000});
      joinLatencies.push(joined.ms);
      if(joined.status!==200){errors.push({stage:'join',status:joined.status,code:joined.payload?.code,message:joined.payload?.message});return;}
      actor.joined=true;actor.selfId=joined.data.selfId;updateProof(actor,joined.data);
      actor.startPosition=joined.data.players?.[actor.selfId]?.position;actor.lastPosition=actor.startPosition;
    });
  }finally{clearInterval(joinKeepalives);await keepaliveBatch;}
  const joinWallMs=performance.now()-joinAt;
  const joined=group.filter(a=>a.joined);
  // Hockey starts on join; only arcade has a separate host start action.
  if(scenario.kind==='arcade'&&joined.length){
    const watched=requireSuccess(await call(endpoint(joined[0]),{actor:joined[0],body:{action:'watch'}}),'find arcade host');
    const host=joined.find(actor=>'account:'+actor.accountId===watched.host);
    requireSuccess(await call(endpoint(host),{actor:host,body:{action:'start',requestId:randomUUID()}}),'start arcade match');
  }
  const occupancyBefore=await occupancy(scenario,group,roomIds,endpoint);
  let balanceBefore=null,spends=0,ledgerBeforeIds=null;
  const acknowledgedSpendIds=new Set(),walletId='account:'+group[0].accountId;
  if(scenario.mixed){
    const session=requireSuccess(await call('/api/game/session',{actor:group[0],body:{}}),'create mixed game session',201);
    group[0].gameSessionToken=session.gameSessionToken;
    balanceBefore=requireSuccess(await call('/api/backpack',{actor:group[0]}),'mixed starting balance').mzkBalance;
    const initialLedger=JSON.parse(await readFile(join(directory,'users.json'),'utf8'));
    balanceBefore=initialLedger.users[walletId].tokens.MZK;
    ledgerBeforeIds=new Set(initialLedger.transactions.filter(entry=>entry.walletId===walletId).map(entry=>entry.id));
  }
  // Spread input bursts; the fixed deadline defines ALL offered slots, even if
  // the generator stalls near the end. Pending requests are drained separately.
  const sampleOffset=samples.length,parentCpu=process.cpuUsage(),parentLag=monitorEventLoopDelay({resolution:10});parentLag.enable();
  const started=performance.now(), end=started+duration;
  const slots=Array.from({length:group.length},(_,i)=>started+i/group.length*50);
  const offered=slots.reduce((sum,slot)=>sum+Math.max(0,Math.ceil((end-slot)/50)),0);
  const track=promise=>{inflight.add(promise);promise.finally(()=>inflight.delete(promise));};
  async function input(actor,slotTime){
    actor.busy=true;const begin=performance.now();sent++;
    const phase=Math.floor((begin-started)/1500)%4;
    const input=scenario.kind==='hockey'?{x:phase%2?0:1,z:phase%2?1:0}:scenario.kind==='arcade'?{x:400,y:200,moveX:phase%2?-.5:.5,moveY:0}:{side:phase===0?1:phase===2?-1:0,forward:phase===1?1:phase===3?-1:0,yaw:0};
    const baseline=actor.snapshot;
    const result=await call(endpoint(actor),{actor,body:{action:'input',requestId:randomUUID(),inputEpoch:actor.epoch,inputSequence:++actor.sequence,input,...controlsProtocol(actor)},timeout:8000});
    completed++;bytes+=result.bytes;statuses[result.status]=(statuses[result.status]||0)+1;
    if(result.status===200){successful++;actor.successfulInputs++;let data=result.data;const decodeAt=performance.now();
      try{data=updateProof(actor,data,baseline);}catch(error){invalid++;actor.snapshot=null;if(errors.length<20)errors.push({stage:'snapshot-hydration',code:error.code,message:error.message});}
      decodeLatencies.push(performance.now()-decodeAt);
      if(generalWorld){const wire=result.data;if(Number.isFinite(wire.serverTime)&&Number.isFinite(wire.simulationTime))frameAges.push(Math.max(0,wire.serverTime-wire.simulationTime));else invalid++;}
      if(!['hockey','arcade'].includes(scenario.kind)){
        const player=data.players?.[data.selfId],point=player?.position;
        if(!data.authoritative||!player||!point||!['x','y','z'].every(axis=>Number.isFinite(point[axis])))invalid++;
        else actor.lastPosition=point;
      }else if(scenario.kind==='hockey'){
        if(!Array.isArray(data.state?.players)||!data.state.players.every(player=>Number.isFinite(player.x)&&Number.isFinite(player.z))||!Array.isArray(data.state.score)||!data.state.score.every(Number.isFinite)||!Number.isFinite(data.state.puck?.x)||!Number.isFinite(data.state.puck?.z))invalid++;
      }else if(!Number.isFinite(data.state?.score)||!Number.isFinite(data.state?.remaining))invalid++;
    }else if(errors.length<20)errors.push({stage:'input',status:result.status,code:result.payload?.code,message:result.payload?.message});
    const received=performance.now();inputLatencies.push(received-begin);scheduledLatencies.push(received-slotTime);
    if(result.status===200&&received<=end){successfulByDeadline++;bytesByDeadline+=result.bytes;}
    actor.busy=false;
  }
  let healthBusy=false,sideBusy=false,nextHealth=started,nextSide=started,sideIndex=0;
  async function sideTraffic(){
    sideBusy=true;const type=['backpack','fire','spend','backpack'][sideIndex++%4],actor=group[0];
    const path=type==='backpack'?'/api/backpack':type==='spend'?'/api/game/spend':endpoint(actor);
    const body=type==='fire'?{action:'fire',tool:'laser',direction:[0,0,-1],requestId:randomUUID()}:type==='spend'?{amountMzk:1,gameId:'pressure-test',requestId:randomUUID()}:undefined;
    const result=await call(path,{actor,body,timeout:8000});const expectedStatus=type==='spend'?201:200;
    sideLatencies.push(result.ms);sideTypes[type]||={latencies:[],statuses:{},successful:0};
    const metric=sideTypes[type];metric.latencies.push(result.ms);metric.statuses[result.status]=(metric.statuses[result.status]||0)+1;
    if(result.status===expectedStatus){metric.successful++;if(type==='spend'){spends++;acknowledgedSpendIds.add(body.requestId);}}else{sideErrors++;if(errors.length<20)errors.push({stage:'side-'+type,status:result.status,message:result.payload?.message});}
    sideBusy=false;
  }
  while(performance.now()<end&&child?.exitCode===null&&child?.signalCode===null){
    for(let i=0;i<joined.length;i++){
      const now=performance.now();if(now>=end)break;
      if(now<slots[i])continue;
      const due=Math.floor((now-slots[i])/50)+1,scheduled=slots[i]+(due-1)*50;slots[i]+=due*50;
      if(!joined[i].busy)track(input(joined[i],scheduled));
    }
    const now=performance.now();
    if(now>=nextHealth&&!healthBusy){nextHealth=now+1000;healthBusy=true;track(call('/api/health',{timeout:8000}).then(r=>{healthLatencies.push(r.ms);if(r.status!==200)healthErrors++;healthBusy=false;}));}
    if(scenario.mixed&&now>=nextSide&&!sideBusy){nextSide=now+250;track(sideTraffic());}
    await pause(5);
  }
  const schedulerElapsedMs=performance.now()-started;
  await Promise.allSettled([...inflight]);parentLag.disable();const completionElapsedMs=performance.now()-started;
  const cpu=process.cpuUsage(parentCpu),windowSamples=samples.slice(sampleOffset),allCpu=windowSamples.map(s=>s.cpuPercentOfOneCore),rss=windowSamples.map(s=>s.rssBytes/1048576);
  const occupancyAfter=await occupancy(scenario,group,roomIds,endpoint);
  let capacityGuard=null;
  if(scenario.count===15&&scenario.kind==='builder'&&!scenario.rooms||scenario.count===128&&scenario.kind==='commons'){
    const extra=actors[scenario.count];
    if(extra){const rejected=await call('/api/rooms/'+roomIds[0]+'/gameplay',{actor:extra,body:{action:'join',requestId:randomUUID(),radToxEnabled:false}});capacityGuard={status:rejected.status,pass:rejected.status===409};}
  }
  let balanceAfter=null,ledgerAssessment=null,balancePreserved=true;
  if(scenario.mixed){
    requireSuccess(await call('/api/backpack',{actor:group[0]}),'mixed final balance');
    const finalLedger=JSON.parse(await readFile(join(directory,'users.json'),'utf8'));
    balanceAfter=finalLedger.users[walletId].tokens.MZK;
    const entries=finalLedger.transactions.filter(entry=>entry.walletId===walletId&&!ledgerBeforeIds.has(entry.id))
      .map(({id,type,amountMzk,requestId,balanceAfterMzk})=>({id,type,amountMzk,requestId,balanceAfterMzk}));
    const netMzk=entries.reduce((sum,entry)=>sum+Number(entry.amountMzk||0),0);
    const missingOrDuplicateSpendReceipts=[...acknowledgedSpendIds].filter(requestId=>entries.filter(entry=>entry.type==='GAMEPLAY_SPEND'&&entry.requestId===requestId).length!==1);
    const uncertain=Boolean(statuses[0]||Object.values(sideTypes).some(type=>type.statuses[0]));
    const reconciles=balanceAfter===balanceBefore+netMzk&&missingOrDuplicateSpendReceipts.length===0;
    ledgerAssessment={status:uncertain?'inconclusive-timeouts':reconciles?'reconciled':'mismatch',netMzk,
      creditsMzk:entries.reduce((sum,entry)=>sum+Math.max(0,Number(entry.amountMzk||0)),0),
      debitsMzk:entries.reduce((sum,entry)=>sum+Math.min(0,Number(entry.amountMzk||0)),0),
      expectedBalance:balanceBefore+netMzk,observedBalance:balanceAfter,acknowledgedSpendCount:spends,
      missingOrDuplicateSpendReceipts,entries,
      scope:uncertain?'Timed-out requests may still commit; this snapshot does not establish final reconciliation.':'All new signed ledger entries, including automatic coin/reward credits, are included.'};
    balancePreserved=uncertain?null:reconciles;
  }
  const frameFreshness={scope:generalWorld?'general authoritative world snapshots':'not measured for native sports APIs',ageMs:summary(frameAges),pass:generalWorld?frameAges.length>0&&percentile(frameAges,.95)<=100:null};
  const pass=joined.length===scenario.count&&occupancyBefore.allExpectedPresent&&occupancyAfter.allExpectedPresent&&successfulByDeadline/Math.max(1,offered)>=.95&&successful/Math.max(1,completed)>=.99&&percentile(inputLatencies,.95)<=100&&percentile(inputLatencies,.99)<=250&&invalid===0&&healthErrors===0&&sideErrors===0&&balancePreserved&&(!capacityGuard||capacityGuard.pass)&&frameFreshness.pass!==false;
  const result={name:scenario.name,kind:scenario.kind,requestedPlayers:scenario.count,joinedPlayers:joined.length,rooms:roomIds.length,authoredObjectsPerRoom:scenario.objects||12,joinWallMs,joinLatencyMs:summary(joinLatencies),joinKeepaliveErrors:keepaliveErrors,
    occupancyBefore,occupancyAfter,capacityGuard,durationMs:duration,schedulerElapsedMs,completionElapsedMs,drainMs:Math.max(0,completionElapsedMs-duration),
    offeredSlots:offered,skippedSlots:offered-sent,requestsSent:sent,requestsCompleted:completed,successfulRequests:successful,successfulByDeadline,statuses,
    deliveredSlotRatio:successfulByDeadline/Math.max(1,offered),eventuallyDeliveredSlotRatio:successful/Math.max(1,offered),successfulRequestsPerSecond:successfulByDeadline/(duration/1000),completionWindowRequestsPerSecond:successful/(completionElapsedMs/1000),
    inputLatencyMs:summary(inputLatencies),scheduledLatencyMs:summary(scheduledLatencies),healthLatencyMs:summary(healthLatencies),healthErrors,
    snapshotHydrationMs:summary(decodeLatencies),frameFreshness,
    responseMiB:bytes/1048576,responseMbitPerSecond:bytesByDeadline*8/(duration/1000)/1e6,invalidSnapshots:invalid,
    movingPlayers:joined.filter(a=>a.startPosition&&a.lastPosition&&Math.hypot(a.lastPosition.x-a.startPosition.x,a.lastPosition.z-a.startPosition.z)>.01).length,
    sideTraffic:{requests:sideLatencies.length,latencyMs:summary(sideLatencies),errors:sideErrors,types:Object.fromEntries(Object.entries(sideTypes).map(([type,data])=>[type,{...data,latencies:undefined,latencyMs:summary(data.latencies)}])),balanceBefore,balanceAfter,acknowledgedSpends:spends,balancePreserved,ledgerAssessment},
    server:{cpuPercentOfOneCore:summary(allCpu),rssMiB:summary(rss),eventLoopP99Ms:summary(windowSamples.map(s=>s.eventLoopP99Ms)),eventLoopMaxMs:summary(windowSamples.map(s=>s.eventLoopMaxMs))},
    generator:{cpuPercentOfOneCore:(cpu.user+cpu.system)/1000/completionElapsedMs*100,eventLoopP99Ms:parentLag.percentile(99)/1e6,eventLoopMaxMs:parentLag.max/1e6},serverSamples:windowSamples,pass,errors};
  report.scenarios.push(result);await save();
  console.log(JSON.stringify({event:'stage-complete',name:result.name,pass,joined:joined.length,p95Ms:result.inputLatencyMs.p95,delivered:result.deliveredSlotRatio,rps:result.successfulRequestsPerSecond}));
  // A fresh process/dataset replaces the stage; general gameplay has no leave action.
  await save();
}
async function loginBurst(scenario){
  const begin=performance.now(),latencies=[],statuses={};let success=0;
  await parallel(Array.from({length:scenario.count}),scenario.count,async()=>{const result=await call('/api/access/guest',{body:{},timeout:120000});latencies.push(result.ms);statuses[result.status]=(statuses[result.status]||0)+1;if(result.status===201)success++;});
  const elapsed=performance.now()-begin,result={name:scenario.name,kind:'login',requested:scenario.count,successful:success,statuses,durationMs:elapsed,latencyMs:summary(latencies),successfulRequestsPerSecond:success/(elapsed/1000),pass:success===scenario.count};report.scenarios.push(result);await save();console.log(JSON.stringify({event:'stage-complete',...result}));
}
async function recovery(actors){
  const map=await publish(actors[0],'pressure-recovery-'+(++probeRun),1),path='/api/rooms/'+map.id+'/gameplay';
  const joined=requireSuccess(await call(path,{actor:actors[0],body:{action:'join',requestId:randomUUID(),radToxEnabled:false}}),'recovery join');
  const before=requireSuccess(await call('/api/backpack',{actor:actors[0]}),'backpack before restart');
  requireSuccess(await call(path,{actor:actors[0],body:{action:'input',requestId:randomUUID(),inputEpoch:joined.inputEpoch,inputSequence:1,input:{side:1}}}),'recovery input');
  await pause(1400);requireSuccess(await call(path,{actor:actors[0],body:{action:'input',requestId:randomUUID(),inputEpoch:joined.inputEpoch,inputSequence:2,input:{}}}),'recovery stop');await pause(1400);
  // A durable room checkpoint can include committed incremental journal
  // records. Reopen through the production reader rather than inspecting one
  // physical file; the saved/restored-position assertion stays unchanged.
  const checkpoint=await new SharedRoomStore(join(directory,'shared-rooms.json')).read();
  const saved=checkpoint[map.id]?.simulation?.players?.[joined.selfId]?.position;
  const restartAt=performance.now();await stop('SIGKILL');await start();
  const after=requireSuccess(await call('/api/backpack',{actor:actors[0],timeout:30000}),'backpack after restart');
  const state=requireSuccess(await call(path),'room after restart');
  const restored=state.players?.[joined.selfId]?.position;
  const published=requireSuccess(await call('/api/custom-maps'),'map after restart').some(item=>item.id===map.id);
  const finitePoint=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
  const beforeInventory=before.items||before.assets,afterInventory=after.items||after.assets;
  report.recovery={hardKill:true,waitedForCheckpoint:true,restartMs:performance.now()-restartAt,
    sessionSurvived:Boolean(before.accountId)&&before.accountId===after.accountId,balancePreserved:Number.isFinite(before.mzkBalance)&&before.mzkBalance===after.mzkBalance,
    inventoryPreserved:Array.isArray(beforeInventory)&&beforeInventory.length>0&&JSON.stringify(beforeInventory)===JSON.stringify(afterInventory),
    publishedMapPreserved:published,savedPosition:saved,restoredPosition:restored,checkpointPreserved:Boolean(finitePoint(saved)&&finitePoint(restored))&&JSON.stringify(saved)===JSON.stringify(restored)};
  report.recovery.pass=report.recovery.sessionSurvived&&report.recovery.balancePreserved&&report.recovery.inventoryPreserved&&published&&report.recovery.checkpointPreserved;
  await save();console.log(JSON.stringify({event:'recovery-complete',pass:report.recovery.pass}));
}

try {
  const maxPlayers=Math.max(...scenarios.filter(s=>s.kind!=='login').map(s=>s.count),1),actors=await seed(Math.max(maxPlayers+1,fixtureAccounts));
  report.syntheticAccounts=actors.length;
  baselineFiles=await Promise.all(['accounts.json','users.json','account-sessions.json'].map(async name=>[name,await readFile(join(directory,name))]));
  report.baselineFixtureBytes=Object.fromEntries(baselineFiles.map(([name,bytes])=>[name,bytes.length]));
  if(options['start-gate']){
    console.log(JSON.stringify({event:'waiting-for-exclusive-timing-window'}));
    const deadline=Date.now()+300000;
    while(true){try{await access(resolve(options['start-gate']));break;}catch{if(Date.now()>deadline)throw Error('Exclusive timing window was not opened within five minutes');await pause(250);}}
  }
  for(const scenario of scenarios){
    let authColdVerificationMs,startupMs,stageTimer,timedOut=false;
    try{
      await resetFixture(actors);
      stageTimer=setTimeout(()=>{
        timedOut=true;
        report.interventions ||= [];
        report.interventions.push({scenario:scenario.name,stageWallBudgetSeconds:stageSeconds,reason:'Experiment stage wall deadline; isolated server terminated, not a spontaneous server crash.'});
        if(child?.exitCode===null&&child?.signalCode===null)child.kill('SIGTERM');
      },stageSeconds*1000);
      const begin=performance.now();await start();startupMs=performance.now()-begin;
      authColdVerificationMs=await warm(actors.slice(0,Math.min(actors.length,scenario.count+1)));
      await run(scenario,actors);
      const measured=report.scenarios.at(-1);
      Object.assign(measured,{startupMs,authColdVerificationMs,stageTimedOut:timedOut,pass:!timedOut&&measured.pass});
    }catch(error){
      failures.push({stage:scenario.name,message:error.message});
      if(report.scenarios.at(-1)?.name!==scenario.name)report.scenarios.push({name:scenario.name,kind:scenario.kind,requestedPlayers:scenario.count,startupMs,authColdVerificationMs,stageTimedOut:timedOut,pass:false,error:error.message});
    }finally{clearTimeout(stageTimer);await stop();await save();}
  }
  await resetFixture(actors);await start();await warm(actors.slice(0,2));await recovery(actors);
}catch(error){failures.push({stage:'harness',message:error.message,stack:error.stack});}
finally {
  await stop();report.serverErrors=serverErrors;report.finishedAt=new Date().toISOString();
  report.pass=failures.length===0&&report.scenarios.length===scenarios.length&&report.scenarios.every(s=>s.pass)&&report.recovery?.pass===true;
  await save();await rm(directory,{recursive:true,force:true});
  console.log(JSON.stringify({event:'complete',output,pass:report.pass,scenarios:report.scenarios.length,failures}));
  if(!report.pass)process.exitCode=1;
}
