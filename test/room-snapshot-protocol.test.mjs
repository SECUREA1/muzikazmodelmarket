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
