// Cold-user admission pressure through the actual HTTP guest-login route.
// Offered login attempts are NOT active game players. No remote target exists.
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp, mkdir, readFile, writeFile, rename, rm} from 'node:fs/promises';
import {tmpdir, cpus, totalmem} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, createHash} from 'node:crypto';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {setTimeout as pause} from 'node:timers/promises';

const root=fileURLToPath(new URL('..',import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).map(argument=>{
  const match=argument.match(/^--([\w-]+)=(.+)$/);
  if(!match)throw Error('Use --profile=smoke|full --offers=1000,10000 --duration=20 --output=/path/results.json');
  return [match[1],match[2]];
}));
const allowed=new Set(['profile','offers','duration','max-in-flight','output','heap-mb','request-timeout','drain']);
for(const key of Object.keys(args))if(!allowed.has(key))throw Error('Unknown argument: '+key);
const profile=args.profile||'full';
if(!['smoke','full'].includes(profile))throw Error('Unknown profile');
const offers=(args.offers||(profile==='smoke'?'20':'1000,10000')).split(',').map(Number);
const durationMs=Number(args.duration||(profile==='smoke'?2:20))*1000;
const maxInFlight=Number(args['max-in-flight']||128),heapMb=Number(args['heap-mb']||2048);
const requestTimeoutMs=Number(args['request-timeout']||8)*1000,drainLimitMs=Number(args.drain||10)*1000;
if(!offers.length||offers.some(value=>!Number.isSafeInteger(value)||value<1||value>100000))throw Error('Offers must be integers from 1 to 100000');
if(!(durationMs>=1000&&durationMs<=30000))throw Error('Duration must be 1–30 seconds');
if(!Number.isSafeInteger(maxInFlight)||maxInFlight<1||maxInFlight>128)throw Error('Maximum in-flight requests must be 1–128');
if(!Number.isSafeInteger(heapMb)||heapMb<128||heapMb>4096)throw Error('Heap limit must be 128–4096 MiB');
if(!(requestTimeoutMs>=100&&requestTimeoutMs<=8000))throw Error('Request timeout must be 0.1–8 seconds');
if(!(drainLimitMs>=100&&drainLimitMs<=10000))throw Error('Drain must be 0.1–10 seconds');
const output=resolve(args.output||join(root,'work','server-pressure','admission.json'));
async function optional(path){try{return(await readFile(path,'utf8')).trim();}catch{return null;}}
const report={schemaVersion:1,startedAt:new Date().toISOString(),profile,
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  dirtyPaths:execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean),
  harnessSHA256:createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
  environment:{node:process.version,cpu:cpus()[0]?.model,logicalCpus:cpus().length,hostMemoryBytes:totalmem(),heapLimitMb:heapMb,
    cgroupCpuMax:await optional('/sys/fs/cgroup/cpu.max'),cgroupMemoryMax:await optional('/sys/fs/cgroup/memory.max')},
  methodology:{target:'isolated loopback HTTP, separate unmodified actual server process',route:'POST /api/access/guest',
    meaning:'offered cold-user login attempts; successful HTTP201 responses are authenticated admissions, not concurrently active game players',
    state:'fresh empty temporary data directories for every stage; no seeded credentials or hashed fixtures; production auth/throttling unchanged',
    scheduling:'uniform predetermined open-loop slots, no backlog; attempts dropped when the in-flight cap is reached, including all unissued slots at the deadline',
    durationMs,maxInFlight,requestTimeoutMs,drainLimitMs,hardStageDeadlineMs:60000,
    scope:'no production target, external requests, blockchain settlement, gameplay concurrency or browser rendering'},
  stages:[],failures:[]};

function percentile(values,p){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return +sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)].toFixed(3);}
function summary(values){return {count:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:values.length?+values.reduce((max,value)=>Math.max(max,value),-Infinity).toFixed(3):null};}
async function save(){await mkdir(dirname(output),{recursive:true});const temporary=output+'.'+process.pid+'.tmp';await writeFile(temporary,JSON.stringify(report,null,2)+'\n');await rename(temporary,output);}
async function unusedPort(){const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return port;}
async function countRecords(path,key){try{const value=JSON.parse(await readFile(path,'utf8'))[key];return Array.isArray(value)?value.length:value&&typeof value==='object'?Object.keys(value).length:0;}catch{return null;}}

async function run(offeredAttempts){
  console.log(JSON.stringify({event:'admission-start',offeredAttempts,durationMs,maxInFlight}));
  const directory=await mkdtemp(join(tmpdir(),'muzikaz-admission-pressure-'));
  let child,stopping=false,hardDeadlineReached=false,base;
  const samples=[],serverErrors=[],controllers=new Set(),pending=new Set(),healthPending=new Set();
  const outcome={name:'cold-logins-'+offeredAttempts,offeredAttempts,durationMs,maxInFlight,statuses:{},errorTypes:{},serverErrors};
  const abortAll=reason=>{for(const controller of controllers)controller.abort(new Error(reason));};
  const hardDeadline=setTimeout(()=>{
    hardDeadlineReached=true;abortAll('hard stage deadline');
    if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  },60000);
  async function stop(){
    if(!child||child.exitCode!==null||child.signalCode!==null)return;
    stopping=true;const captured=child,exited=new Promise(resolve=>captured.once('exit',resolve));
    const killer=setTimeout(()=>{if(captured.exitCode===null&&captured.signalCode===null)captured.kill('SIGKILL');},3000);
    captured.kill('SIGTERM');try{await exited;}finally{clearTimeout(killer);}
  }
  async function request(path,{body,timeout=requestTimeoutMs}={}){
    const began=performance.now(),controller=new AbortController();controllers.add(controller);
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort(new Error('request timeout'));},timeout);
    try{
      const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal});
      const bytes=await response.text();let payload;try{payload=JSON.parse(bytes);}catch{payload=null;}
      return {status:response.status,ms:performance.now()-began,payload,bytes:Buffer.byteLength(bytes)};
    }catch(error){return {status:0,ms:performance.now()-began,error:timedOut?'request-timeout':controller.signal.aborted?'stage-abort':error.name,bytes:0};}
    finally{clearTimeout(timer);controllers.delete(controller);}
  }
  try{
    const port=await unusedPort();base='http://127.0.0.1:'+port;
    const env={...process.env,PORT:String(port),NODE_ENV:'production',PUBLIC_BASE_URL:base,MUZIKAZ_CORS_ORIGINS:base,
      MUZIKAZ_DATA_DIR:directory,MUZIKAZ_USER_DATABASE_FILE:join(directory,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(directory,'accounts.json'),
      MUZIKAZ_PAYMENT_ORDERS_FILE:join(directory,'payments.json'),MUZIKAZ_ACCOUNT_SESSIONS_FILE:join(directory,'account-sessions.json'),MUZIKAZ_GAME_SESSIONS_FILE:join(directory,'game-sessions.json'),
      MUZIKAZ_CUSTOM_MAPS_FILE:join(directory,'custom-maps.json'),MUZIKAZ_ENVIRONMENT_DATA_FILE:join(directory,'environments.json'),
      MUZIKAZ_AVATAR_UPLOAD_DIR:join(directory,'uploads','avatars'),MUZIKAZ_ASSET_UPLOAD_DIR:join(directory,'uploads','assets'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(directory,'uploads','environments'),
      UPLOAD_STORAGE_PATH:join(directory,'uploads','models'),MUZIKAZ_BACKUP_DIR:join(directory,'backups'),MUZIKAZ_ADMIN_USERNAME:'pressure-fixture',MUZIKAZ_ADMIN_PASSWORD:randomUUID(),MUZIKAZ_ADMIN_SESSION_SECRET:randomUUID()};
    const startup=performance.now();
    child=spawn(process.execPath,['--max-old-space-size='+heapMb,'--import',fileURLToPath(new URL('./pressure-test-probe.mjs',import.meta.url)),'server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe','ipc']});
    child.on('message',message=>{if(message.type==='pressure-sample')samples.push(message);});
    child.stdout.on('data',()=>{});child.stderr.on('data',chunk=>{if(serverErrors.length<30)serverErrors.push(chunk.toString().slice(0,1500));});
    child.on('exit',(code,signal)=>{if(!stopping)outcome.unexpectedServerExit={code,signal};});
    let ready=false;
    while(performance.now()-startup<10000&&!hardDeadlineReached){
      if(child.exitCode!==null||child.signalCode!==null)throw Error('Server exited before becoming ready');
      const health=await request('/api/health',{timeout:500});if(health.status===200){ready=true;break;}await pause(50);
    }
    if(!ready)throw Error('Server startup exceeded 10 seconds');
    outcome.startupMs=performance.now()-startup;
    const latencies=[],admissionLatencies=[],scheduledLatencies=[],healthLatencies=[],generatorLag=monitorEventLoopDelay({resolution:10});
    generatorLag.enable();const cpu=process.cpuUsage(),sampleOffset=samples.length;
    let issued=0,processedSlots=0,droppedSlots=0,completed=0,authenticated=0,authenticatedByDeadline=0,completedByDeadline=0,responseBytes=0,peakInFlight=0,healthErrors=0;
    const began=performance.now(),deadline=began+durationMs;let nextHealth=began;
    async function login(scheduledAt){
      issued++;
      const result=await request('/api/access/guest',{body:{}}),received=performance.now();
      completed++;latencies.push(result.ms);scheduledLatencies.push(received-scheduledAt);responseBytes+=result.bytes;
      outcome.statuses[result.status]=(outcome.statuses[result.status]||0)+1;
      if(received<=deadline)completedByDeadline++;
      if(result.status===201&&result.payload?.data?.authenticated===true&&typeof result.payload.data.sessionToken==='string'){
        authenticated++;admissionLatencies.push(result.ms);if(received<=deadline)authenticatedByDeadline++;
      }else{
        const type=result.error||result.payload?.code||'HTTP_'+result.status;
        outcome.errorTypes[type]=(outcome.errorTypes[type]||0)+1;
      }
    }
    function trackLogin(scheduledAt){const promise=login(scheduledAt);pending.add(promise);promise.finally(()=>pending.delete(promise));peakInFlight=Math.max(peakInFlight,pending.size);}
    function health(){const promise=request('/api/health',{timeout:requestTimeoutMs}).then(result=>{healthLatencies.push(result.ms);if(result.status!==200)healthErrors++;});healthPending.add(promise);promise.finally(()=>healthPending.delete(promise));}
    while(performance.now()<deadline&&!hardDeadlineReached&&child.exitCode===null&&child.signalCode===null){
      const now=performance.now();
      const due=Math.min(offeredAttempts,Math.floor((now-began)*offeredAttempts/durationMs)+1);
      const slotsDue=due-processedSlots,available=Math.max(0,maxInFlight-pending.size),launches=Math.min(slotsDue,available);
      for(let index=0;index<launches;index++){
        if(performance.now()>=deadline)break;
        trackLogin(began+(processedSlots+index)*durationMs/offeredAttempts);
      }
      // All due slots are consumed now; capped slots are dropped, never queued.
      processedSlots=due;
      if(now>=nextHealth&&!healthPending.size){nextHealth=now+1000;health();}
      await pause(5);
    }
    const schedulerElapsedMs=performance.now()-began;
    droppedSlots=offeredAttempts-issued;
    const inFlightAtDeadline=pending.size,drainStart=performance.now();
    let drainTimer;
    try{
      await Promise.race([Promise.allSettled([...pending,...healthPending]),new Promise(resolve=>{drainTimer=setTimeout(resolve,drainLimitMs);})]);
      if(pending.size||healthPending.size){abortAll('drain limit reached');await Promise.allSettled([...pending,...healthPending]);}
    }finally{clearTimeout(drainTimer);}
    const completionElapsedMs=performance.now()-began,drainMs=performance.now()-drainStart;
    generatorLag.disable();const parentCpu=process.cpuUsage(cpu),windowSamples=samples.slice(sampleOffset);
    Object.assign(outcome,{schedulerElapsedMs,completionElapsedMs,drainMs,attemptsIssued:issued,droppedSlots,peakInFlight,inFlightAtDeadline,
      attemptsCompleted:completed,completedByDeadline,authenticatedAdmissions:authenticated,authenticatedByDeadline,
      authenticatedFractionOfOffered:authenticated/offeredAttempts,authenticatedFractionOfIssued:authenticated/Math.max(1,issued),
      authenticatedAdmissionsPerSecond:authenticatedByDeadline/(durationMs/1000),completionWindowAdmissionsPerSecond:authenticated/(completionElapsedMs/1000),
      requestLatencyMs:summary(latencies),authenticatedLatencyMs:summary(admissionLatencies),scheduledLatencyMs:summary(scheduledLatencies),
      health:{requests:healthLatencies.length,errors:healthErrors,latencyMs:summary(healthLatencies)},responseMiB:responseBytes/1048576,
      server:{cpuPercentOfOneCore:summary(windowSamples.map(sample=>sample.cpuPercentOfOneCore)),rssMiB:summary(windowSamples.map(sample=>sample.rssBytes/1048576)),eventLoopP99Ms:summary(windowSamples.map(sample=>sample.eventLoopP99Ms)),eventLoopMaxMs:summary(windowSamples.map(sample=>sample.eventLoopMaxMs))},
      generator:{cpuPercentOfOneCore:(parentCpu.user+parentCpu.system)/1000/completionElapsedMs*100,eventLoopP99Ms:generatorLag.percentile(99)/1e6,eventLoopMaxMs:generatorLag.max/1e6},serverSamples:windowSamples,
      allIssuedRequestsAuthenticated:authenticated===issued&&completed===issued,
      pass:authenticated===offeredAttempts&&authenticatedByDeadline===offeredAttempts&&droppedSlots===0&&healthErrors===0&&!outcome.unexpectedServerExit&&!hardDeadlineReached});
  }catch(error){outcome.error=error.message;outcome.pass=false;report.failures.push({stage:outcome.name,message:error.message});}
  finally{
    abortAll('stage cleanup');await Promise.allSettled([...pending,...healthPending]);await stop();clearTimeout(hardDeadline);
    outcome.hardDeadlineReached=hardDeadlineReached;
    outcome.persistedAccounts=await countRecords(join(directory,'accounts.json'),'accounts');
    outcome.persistedUsers=await countRecords(join(directory,'users.json'),'users');
    outcome.persistedAccountSessions=await countRecords(join(directory,'account-sessions.json'),'sessions');
    outcome.persistedCountMeaning='Committed records at stop; timed-out requests can create accounts without returning an authenticated admission.';
    await rm(directory,{recursive:true,force:true});
    report.stages.push(outcome);await save();
    console.log(JSON.stringify({event:'admission-complete',name:outcome.name,pass:outcome.pass,offered:offeredAttempts,issued:outcome.attemptsIssued,authenticated:outcome.authenticatedAdmissions,dropped:outcome.droppedSlots,p95Ms:outcome.requestLatencyMs?.p95}));
  }
}
for(const offered of offers)await run(offered);
report.finishedAt=new Date().toISOString();report.pass=report.failures.length===0&&report.stages.every(stage=>stage.pass);
await save();console.log(JSON.stringify({event:'complete',output,pass:report.pass}));if(!report.pass)process.exitCode=1;
