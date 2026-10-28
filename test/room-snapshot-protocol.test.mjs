import test from 'node:test';
import assert from 'node:assert/strict';
import {compactRoomSnapshot,createRoomSnapshotEncoder,hydrateRoomSnapshot,snapshotAcknowledgements} from '../public/js/room-snapshot.js';

const wire=value=>JSON.parse(JSON.stringify(value));
function full(sequence=1){return {
 authoritative:true,selfId:'me',sequence,serverTime:sequence*50,sceneVersion:'scene-1',
 players:{me:{position:{x:sequence,y:0,z:0},inventory:['key'],health:100}},
 actors:{tree:{id:'tree',position:{x:0,z:0},definition:{gameplay:{behavior:'decor'},shape:'branch'.repeat(100)},asset:{id:'tree-asset',settings:{parts:['a','b']}}}},
 objects:{wall:{id:'wall',paint:Array(100).fill(123)}},
 construction:{crew:{names:Array(20).fill('crew')},earthworks:{revision:4,patches:Array(40).fill({height:2})}},
 residentLife:{people:Array(30).fill({name:'Resident',need:2})},unknownFutureFeature:{preserve:'all unknown fields'}
};}
const environment={id:'protocol-room'};
const request=baseline=>({action:'input',snapshotMode:'compact',snapshotProtocol:2,sceneVersion:baseline?.sceneVersion||'scene-1',snapshotAcknowledgements:snapshotAcknowledgements(baseline)});
function roundtrip(state,previous,encoder=compactRoomSnapshot,env=environment){return hydrateRoomSnapshot(wire(encoder(state,request(previous),env)),previous);}

test('protocol2 roundtrips complete gameplay state while unchanged components leave the wire',()=>{
 const first=full(),baseline=roundtrip(first),next=full(2);
 assert.deepEqual(baseline,wire(first));
 const compact=wire(compactRoomSnapshot(next,request(baseline),environment));
 assert.equal(compact.actors.tree.definition,undefined);assert.equal(compact.actors.tree.asset,undefined);
 assert.equal(compact.snapshotActorMetadata,undefined);assert.equal(compact.snapshotEarthworks,undefined);
 assert.equal(compact.objects,undefined);assert.equal(compact.residentLife,undefined);
 assert.deepEqual(compact.players,next.players);assert.ok(compact.actors.tree);
 assert.deepEqual(hydrateRoomSnapshot(compact,baseline),wire(next));
 assert.ok(JSON.stringify(compact).length<JSON.stringify(next).length/2);
 const acknowledgement=snapshotAcknowledgements(baseline);acknowledgement['@actorMetadata']='tampered';
 assert.notEqual(snapshotAcknowledgements(baseline)['@actorMetadata'],'tampered');
});

test('actor metadata, dynamic values, creation, deletion and component removal hydrate exactly',()=>{
 let state=full(),baseline=roundtrip(state);
 state=full(2);state.actors.tree.definition.shape='new-shape';state.actors.tree.asset.settings.parts.push('c');
 state.actors.newActor={id:'newActor',position:{x:5},definition:{behavior:'vehicle'}};delete state.objects;
 state.construction.earthworks.patches[0]={height:8};
 baseline=roundtrip(state,baseline);assert.deepEqual(baseline,wire(state));
 state=wire(state);state.sequence=3;delete state.actors.tree;delete state.actors.newActor.definition;delete state.residentLife;state.construction=null;
 assert.deepEqual(roundtrip(state,baseline),wire(state));
});

test('changed metadata that returns to an earlier value never reuses the old revision',()=>{
 const encoder=createRoomSnapshotEncoder();
 const a=roundtrip(full(),null,encoder),oldAck=snapshotAcknowledgements(a)['@actorMetadata'];
 const changed=full(2);changed.actors.tree.definition.shape='changed';const b=roundtrip(changed,a,encoder);
 const again=roundtrip(full(3),b,encoder);
 assert.notEqual(snapshotAcknowledgements(again)['@actorMetadata'],oldAck);
});

test('missing and unknown acknowledgements resend full components without affecting server commands',()=>{
 const state=full(),baseline=roundtrip(state);
 for(const acknowledgements of [{},{'@actorMetadata':'unknown'},{objects:snapshotAcknowledgements(baseline).objects+'-wrong'}]){
  const reply=wire(compactRoomSnapshot(full(2),{...request(baseline),snapshotAcknowledgements:acknowledgements},environment));
  assert.ok(reply.snapshotActorMetadata);assert.deepEqual(hydrateRoomSnapshot(reply),wire(full(2)));
 }
 assert.equal(compactRoomSnapshot(state,{action:'join',snapshotProtocol:2,snapshotMode:'compact'},environment),state);
 assert.equal(compactRoomSnapshot(state,{action:'input'},environment),state);
 assert.equal(compactRoomSnapshot(state,{...request(baseline),sceneVersion:'outdated'},environment),state);
});

test('scene changes, server restarts and cache eviction supply recovery baselines',()=>{
 const encoder=createRoomSnapshotEncoder({maxWorlds:1}),initial=roundtrip(full(),null,encoder);
 roundtrip(full(),null,encoder,{id:'other-room'});
 const afterEviction=wire(encoder(full(2),request(initial),environment));
 assert.ok(afterEviction.snapshotActorMetadata);assert.deepEqual(hydrateRoomSnapshot(afterEviction),wire(full(2)));
 const afterRestart=wire(createRoomSnapshotEncoder()(full(3),request(initial),environment));
 assert.ok(afterRestart.snapshotActorMetadata);assert.deepEqual(hydrateRoomSnapshot(afterRestart),wire(full(3)));
 const changed=full(4);changed.sceneVersion='scene-2';
 const fullScene=encoder(changed,request(initial),environment);
 assert.equal(fullScene,changed);const hydrated=hydrateRoomSnapshot(wire(fullScene),initial);
 assert.deepEqual(snapshotAcknowledgements(hydrated),{});
 assert.deepEqual(roundtrip(changed,hydrated,encoder),wire(changed));
});

test('private baselines repair application mutations and reject missing or contradictory transport baselines',()=>{
 const encoder=createRoomSnapshotEncoder(),baseline=roundtrip(full(),null,encoder);
 const reply=wire(encoder(full(2),request(baseline),environment));
 baseline.actors.tree.definition.shape='corrupted';baseline.objects.wall.paint=[];
 baseline.residentLife.loop=baseline.residentLife;
 assert.deepEqual(hydrateRoomSnapshot(reply,baseline),wire(full(2)));
 assert.throws(()=>hydrateRoomSnapshot(reply,wire(full())),{code:'SNAPSHOT_BASELINE_MISSING'});
 const contradictory=wire(reply);contradictory.objects={};
 assert.throws(()=>hydrateRoomSnapshot(contradictory,baseline),{code:'SNAPSHOT_BASELINE_MISSING'});
 const malicious=wire(reply);malicious.snapshotUnchanged.push('players');malicious.snapshotRevisions.players='invented';
 assert.throws(()=>hydrateRoomSnapshot(malicious,baseline),{code:'SNAPSHOT_BASELINE_MISSING'});
});

test('out-of-order responses hydrate against the acknowledged request baseline',()=>{
 const encoder=createRoomSnapshotEncoder(),first=roundtrip(full(),null,encoder);
 const older=wire(encoder(full(2),request(first),environment));
 const newerState=full(3);newerState.actors.tree.definition.shape='newer';
 const newer=roundtrip(newerState,first,encoder);
 assert.deepEqual(hydrateRoomSnapshot(older,first),wire(full(2)));
 assert.throws(()=>hydrateRoomSnapshot(older,newer),{code:'SNAPSHOT_BASELINE_MISSING'});
 assert.deepEqual(newer,wire(newerState));
});

test('metadata and legacy actors preserve prototype-named IDs without prototype mutation',()=>{
 const state=full();state.actors=Object.fromEntries(['__proto__','constructor','toString'].map(id=>[id,{id,position:{x:1},definition:{gameplay:{behavior:'decor'},payload:'x'.repeat(200)}}]));
 const baseline=roundtrip(state),next=wire(state);next.sequence=2;delete next.actors.constructor;
 assert.deepEqual(roundtrip(next,baseline),wire(next));assert.equal(Object.prototype.payload,undefined);
 const legacy=compactRoomSnapshot(state,{action:'input',snapshotMode:'compact'},environment);
 const hydrated=hydrateRoomSnapshot(legacy,state);
 for(const id of Object.keys(state.actors))assert.ok(Object.hasOwn(hydrated.actors,id));
 assert.equal(Object.getPrototypeOf(hydrated.actors),Object.prototype);
});

test('more than64 active worlds retain both negotiated and legacy membership acknowledgements',()=>{
 const encoder=createRoomSnapshotEncoder(),baselines=[];
 for(let i=0;i<128;i++){
  const env={id:'active-world-'+i},state=full();
  baselines.push({env,negotiated:roundtrip(state,null,encoder,env),legacy:compactRoomSnapshot(state,{action:'input',snapshotMode:'compact',sceneVersion:'scene-1'},env)});
 }
 for(const {env,negotiated,legacy}of baselines){
  const next=encoder(full(2),request(negotiated),env);
  assert.equal(next.snapshotActorMetadata,undefined);assert.deepEqual(hydrateRoomSnapshot(wire(next),negotiated),wire(full(2)));
  assert.equal(compactRoomSnapshot(full(2),{action:'input',snapshotMode:'compact',sceneVersion:'scene-1',actorSetRevision:legacy.actorSetRevision},env).actorIds,undefined);
 }
});

const decorRequest=baseline=>({...request(baseline),snapshotDecorActors:true});
function decorRoundtrip(state,previous,encoder=compactRoomSnapshot,env=environment){return hydrateRoomSnapshot(wire(encoder(state,decorRequest(previous),env)),previous);}

test('opted-in decor reuse omits complete unchanged records while retaining every hydrated actor and field',()=>{
 const encoder=createRoomSnapshotEncoder(),state=full();
 state.actors=Object.fromEntries(Array.from({length:1000},(_,index)=>['decor-'+index,{
  id:'decor-'+index,position:{x:index,y:0,z:-index},rotation:{y:index/100},scale:{x:1,y:1,z:1},health:160,active:true,open:false,
  definition:{gameplay:{behavior:'decor'},shape:'authored shape '+index},asset:{id:'asset-'+index},futureFeature:{parts:[index,'retained']}
 }]));
 state.actors.resident={id:'resident',position:{x:2,y:0,z:3},resident:{name:'Resident'},definition:{gameplay:{behavior:'decor'}}};
 state.actors.traffic={id:'traffic',position:{x:3},trafficAI:true,definition:{gameplay:{behavior:'decor'}}};
 state.actors.crew={id:'crew',position:{x:4},constructionManaged:true,definition:{gameplay:{behavior:'decor'}}};
 state.actors.unknown={id:'unknown',futureFeature:{preserve:true}};
 const baseline=decorRoundtrip(state,null,encoder),next=wire(state);next.sequence=2;next.actors.resident.position.x=9;
 const packet=wire(encoder(next,decorRequest(baseline),environment));
 assert.deepEqual(Object.keys(packet.actors).sort(),['crew','resident','traffic','unknown']);
 assert.equal(packet.snapshotDecorActors,undefined);assert.equal(packet.snapshotActorMetadata,undefined);
 assert.ok(packet.snapshotUnchanged.includes('@decorActors'));
 assert.deepEqual(packet.actors.resident.resident,next.actors.resident.resident);
 assert.deepEqual(hydrateRoomSnapshot(packet,baseline),wire(next));
 assert.ok(JSON.stringify(packet).length<JSON.stringify(next).length/10,'stable large actor records leave the wire without losing their hydrated state');
});

test('decor reuse is explicitly negotiated and authored actors without definitions use their real gameplay configuration',()=>{
 const encoder=createRoomSnapshotEncoder(),state=full();
 state.actors={authored:{id:'authored',position:{x:2},health:160,open:false},unknown:{id:'unknown',position:{x:3}}};
 const env={id:'authored-decor',builderScene:{objects:[{id:'authored',functionalSettings:{behavior:'decor'}}]}};
 const first=wire(encoder(state,decorRequest(),env));
 assert.ok(first.snapshotDecorActors.authored);assert.ok(first.actors.unknown);
 const baseline=hydrateRoomSnapshot(first),next=wire(state);next.sequence=2;
 for(const flag of [undefined,false,'true']){
  const packet=wire(encoder(next,{...request(baseline),snapshotDecorActors:flag},env));
  assert.equal(packet.snapshotDecorActors,undefined);assert.equal(packet.snapshotRevisions['@decorActors'],undefined);
  assert.ok(packet.actors.authored,'older protocol2 requests retain their inline actor format');
  assert.deepEqual(hydrateRoomSnapshot(packet,baseline),next);
 }
 const legacy=compactRoomSnapshot(state,{action:'input',snapshotMode:'compact',snapshotProtocol:1,snapshotDecorActors:true},env);
 assert.equal(legacy.snapshotProtocol,undefined);assert.equal(legacy.snapshotDecorActors,undefined);
});

test('every changed decor field updates the exact-content revision and full component before hydration',()=>{
 const encoder=createRoomSnapshotEncoder();let state=full(),baseline=decorRoundtrip(state,null,encoder);
 const changes=[actor=>{actor.open=true;},actor=>{actor.health=40;},actor=>{actor.active=false;},actor=>{actor.position.x=14;},
  actor=>{actor.futureFeature={nested:['new field',1]};},actor=>{actor.definition.shape='updated definition';},actor=>{actor.asset.settings.parts.push('new part');}];
 for(const change of changes){
  state=wire(state);state.sequence++;change(state.actors.tree);
  const priorRevision=snapshotAcknowledgements(baseline)['@decorActors'],packet=wire(encoder(state,decorRequest(baseline),environment));
  assert.ok(packet.snapshotDecorActors.tree);assert.notEqual(packet.snapshotRevisions['@decorActors'],priorRevision);
  assert.deepEqual(packet.snapshotDecorActors.tree,state.actors.tree);
  baseline=hydrateRoomSnapshot(packet,baseline);assert.deepEqual(baseline,wire(state));
 }
});

test('decor membership, deletion and transitions to live actors never resurrect an earlier member',()=>{
 const encoder=createRoomSnapshotEncoder();let state=full(),baseline=decorRoundtrip(state,null,encoder);
 state=wire(state);state.sequence=2;state.actors.second={id:'second',position:{x:3},definition:{gameplay:{behavior:'decor'}}};
 baseline=decorRoundtrip(state,baseline,encoder);assert.deepEqual(baseline,wire(state));
 state=wire(state);state.sequence=3;delete state.actors.tree;state.actors.second.resident={name:'Now a resident'};
 let packet=wire(encoder(state,decorRequest(baseline),environment));
 assert.equal(packet.snapshotRevisions['@decorActors'],undefined);assert.ok(packet.actors.second);
 baseline=hydrateRoomSnapshot(packet,baseline);assert.deepEqual(baseline,wire(state));assert.equal(baseline.actors.tree,undefined);
 state=wire(state);state.sequence=4;delete state.actors.second.resident;
 baseline=decorRoundtrip(state,baseline,encoder);assert.deepEqual(baseline,wire(state));
 state=wire(state);state.sequence=5;state.actors={};
 assert.deepEqual(decorRoundtrip(state,baseline,encoder),wire(state));
});

test('decor baselines repair application mutation and out-of-order replies use their acknowledged full records',()=>{
 const encoder=createRoomSnapshotEncoder(),baseline=decorRoundtrip(full(),null,encoder);
 const older=wire(encoder(full(2),decorRequest(baseline),environment)),newerState=full(3);newerState.actors.tree.open=true;
 const newer=decorRoundtrip(newerState,baseline,encoder);
 assert.deepEqual(newer,wire(newerState));
 assert.throws(()=>hydrateRoomSnapshot(older,newer),{code:'SNAPSHOT_BASELINE_MISSING'});
 baseline.actors.tree.futureFeature=baseline.actors.tree;
 baseline.actors.tree.definition.shape='application mutation';
 assert.deepEqual(hydrateRoomSnapshot(older,baseline),wire(full(2)));
 const missing=wire(older);assert.throws(()=>hydrateRoomSnapshot(missing,wire(full())),{code:'SNAPSHOT_BASELINE_MISSING'});
 assert.deepEqual(decorRoundtrip(newerState,newer,encoder),wire(newerState),'a newer baseline also repairs shared application mutations before reuse');
});

test('decor cache eviction, capacity fallback and world isolation resend complete records safely',()=>{
 const encoder=createRoomSnapshotEncoder({maxWorlds:1}),first=decorRoundtrip(full(),null,encoder);
 decorRoundtrip(full(),null,encoder,{id:'different-room'});
 let packet=wire(encoder(full(2),decorRequest(first),environment));
 assert.ok(packet.snapshotDecorActors.tree);assert.deepEqual(hydrateRoomSnapshot(packet),wire(full(2)));
 packet=wire(createRoomSnapshotEncoder()(full(2),decorRequest(first),environment));
 assert.ok(packet.snapshotDecorActors.tree);assert.deepEqual(hydrateRoomSnapshot(packet),wire(full(2)));
 const small=createRoomSnapshotEncoder({maxWorldBytes:32});packet=wire(small(full(2),decorRequest(first),environment));
 assert.equal(packet.snapshotDecorActors,undefined);assert.ok(packet.actors.tree);assert.deepEqual(hydrateRoomSnapshot(packet),wire(full(2)));
 const changedScene=full(3);changedScene.sceneVersion='different-scene';
 const recovered=hydrateRoomSnapshot(wire(encoder(changedScene,decorRequest(first),environment)),first);
 assert.deepEqual(recovered,wire(changedScene));assert.deepEqual(snapshotAcknowledgements(recovered),{});
});

test('decor transport rejects duplicate actors, malformed records and contradictory metadata',()=>{
 const encoder=createRoomSnapshotEncoder(),packet=wire(encoder(full(),decorRequest(),environment));
 for(const value of [null,[],{tree:null}]){
  const malformed=wire(packet);malformed.snapshotDecorActors=value;
  assert.throws(()=>hydrateRoomSnapshot(malformed),{code:'SNAPSHOT_BASELINE_MISSING'});
 }
 const duplicate=wire(packet);duplicate.actors.tree={id:'tree'};
 assert.throws(()=>hydrateRoomSnapshot(duplicate),{code:'SNAPSHOT_BASELINE_MISSING'});
 const unversioned=wire(packet);delete unversioned.snapshotRevisions['@decorActors'];
 assert.throws(()=>hydrateRoomSnapshot(unversioned),{code:'SNAPSHOT_BASELINE_MISSING'});
 const contradictory=wire(packet);contradictory.snapshotActorMetadata.tree.definition.shape='contradiction';
 assert.throws(()=>hydrateRoomSnapshot(contradictory),{code:'SNAPSHOT_BASELINE_MISSING'});
});

test('decor maps retain prototype-named actors and returning earlier content receives a new revision',()=>{
 const encoder=createRoomSnapshotEncoder(),state=full();state.actors=Object.fromEntries(['__proto__','constructor','toString'].map(id=>[id,{id,health:160,definition:{gameplay:{behavior:'decor'}}}]));
 let baseline=decorRoundtrip(state,null,encoder),oldRevision=snapshotAcknowledgements(baseline)['@decorActors'];
 const changed=wire(state);changed.sequence=2;changed.actors.__proto__.health=40;
 baseline=decorRoundtrip(changed,baseline,encoder);baseline=decorRoundtrip({...state,sequence:3},baseline,encoder);
 assert.notEqual(snapshotAcknowledgements(baseline)['@decorActors'],oldRevision);
 for(const id of Object.keys(state.actors))assert.ok(Object.hasOwn(baseline.actors,id));
 assert.equal(Object.prototype.health,undefined);assert.equal(Object.getPrototypeOf(baseline.actors),Object.prototype);
});

function budgetState(sequence=1){return {
 authoritative:true,selfId:'me',sequence,serverTime:sequence*50,sceneVersion:'scene-1',players:{me:{position:{x:0,y:0,z:0}}},
 actors:{tree:{id:'tree',position:{x:0,y:0,z:0},health:160,open:false,definition:{gameplay:{behavior:'decor'},shape:'x'.repeat(300)},asset:{id:'tree'},futureFeature:{preserve:true}}}
};}
const encodedBytes=value=>JSON.stringify(value).length*2;
function metadataBytes(state){return encodedBytes({tree:{definition:state.actors.tree.definition,asset:state.actors.tree.asset}});}

test('optional decor cannot churn reusable metadata when their combined cache size exceeds either budget',()=>{
 const state=budgetState(),metadataSize=metadataBytes(state),decorSize=encodedBytes(state.actors),budget=Math.max(metadataSize,decorSize)+2;
 assert.ok(metadataSize<=budget&&decorSize<=budget&&metadataSize+decorSize>budget,'both records fit separately but their duplication does not');
 for(const limits of [{maxWorldBytes:budget},{maxWorldBytes:budget*4,maxBytes:budget}]){
  const encoder=createRoomSnapshotEncoder(limits);let baseline=null,metadataRevision;
  for(let sequence=1;sequence<=4;sequence++){
   const next=budgetState(sequence);next.actors.tree.position.x=sequence;
   const packet=wire(encoder(next,decorRequest(baseline),environment));
   assert.equal(packet.snapshotRevisions['@decorActors'],undefined);
   assert.equal(packet.snapshotDecorActors,undefined);assert.ok(packet.actors.tree,'fallback keeps every scenery actor inline');
   if(metadataRevision){
    assert.equal(packet.snapshotRevisions['@actorMetadata'],metadataRevision,'optional scenery must not force a new metadata revision');
    assert.equal(packet.snapshotActorMetadata,undefined);assert.ok(packet.snapshotUnchanged.includes('@actorMetadata'));
   }else{metadataRevision=packet.snapshotRevisions['@actorMetadata'];assert.ok(packet.snapshotActorMetadata.tree);}
   baseline=hydrateRoomSnapshot(packet,baseline);assert.deepEqual(baseline,wire(next));
  }
 }
});

test('decor admission reserves every base component and safely falls back and returns as the base state changes',()=>{
 let state=budgetState(),baseline;const metadataSize=metadataBytes(state),decorSize=encodedBytes(state.actors),budget=metadataSize+decorSize+64;
 const encoder=createRoomSnapshotEncoder({maxWorldBytes:budget});
 let packet=wire(encoder(state,decorRequest(),environment));
 assert.ok(packet.snapshotDecorActors.tree);baseline=hydrateRoomSnapshot(packet);
 const firstDecor=snapshotAcknowledgements(baseline)['@decorActors'],metadataRevision=snapshotAcknowledgements(baseline)['@actorMetadata'];
 state=wire(state);state.sequence=2;state.residentLife={payload:'r'.repeat(Math.ceil(decorSize/2))};
 const otherSize=encodedBytes(state.residentLife);
 assert.ok(otherSize<=budget&&metadataSize+otherSize<=budget&&metadataSize+otherSize+decorSize>budget,'base components fit together while optional duplication does not');
 packet=wire(encoder(state,decorRequest(baseline),environment));
 assert.equal(packet.snapshotRevisions['@decorActors'],undefined);assert.ok(packet.actors.tree);assert.equal(packet.snapshotRevisions['@actorMetadata'],metadataRevision);
 assert.ok(packet.residentLife);baseline=hydrateRoomSnapshot(packet,baseline);assert.deepEqual(baseline,wire(state));
 state=wire(state);state.sequence=3;state.actors.tree.open=true;
 packet=wire(encoder(state,decorRequest(baseline),environment));
 assert.equal(packet.snapshotRevisions['@decorActors'],undefined);assert.equal(packet.snapshotActorMetadata,undefined);assert.equal(packet.residentLife,undefined);
 baseline=hydrateRoomSnapshot(packet,baseline);assert.deepEqual(baseline,wire(state));
 state=wire(state);state.sequence=4;delete state.residentLife;
 packet=wire(encoder(state,decorRequest(baseline),environment));
 assert.ok(packet.snapshotDecorActors.tree);assert.notEqual(packet.snapshotRevisions['@decorActors'],firstDecor,'re-admission cannot acknowledge the retired record');
 assert.equal(packet.snapshotRevisions['@actorMetadata'],metadataRevision);baseline=hydrateRoomSnapshot(packet,baseline);assert.deepEqual(baseline,wire(state));
 state=wire(state);state.sequence=5;
 packet=wire(encoder(state,decorRequest(baseline),environment));
 assert.equal(packet.snapshotDecorActors,undefined);assert.ok(packet.snapshotUnchanged.includes('@decorActors'));
 assert.deepEqual(hydrateRoomSnapshot(packet,baseline),wire(state));
});
