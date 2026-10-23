import test from 'node:test';
import assert from 'node:assert/strict';
import {compactRoomSnapshot,hydrateRoomSnapshot} from '../public/js/room-snapshot.js';
import {worldPopulation} from '../public/js/world-population.js';
const wall={id:'wall',active:true,health:100,definition:{gameplay:{behavior:'decor',health:100}}};
test('compact controls retain scenery and terrain while updating machines, doors, damage and removals',()=>{
 const full={actors:{wall,truck:{id:'truck',definition:{gameplay:{behavior:'vehicle'}},position:{x:1}},door:{...wall,id:'door',definition:{gameplay:{behavior:'door'}}}},construction:{earthworks:{revision:2,patches:[{heights:[0,0]}]}}};
 const next={...full,actors:{wall,truck:{...full.actors.truck,position:{x:4}}}};
 const compact=compactRoomSnapshot(next,{action:'input',snapshotMode:'compact',earthworksRevision:2});
 assert.equal(compact.actors.wall,undefined);assert.equal(compact.construction.earthworks,null);
 const hydrated=hydrateRoomSnapshot(compact,full);assert.equal(hydrated.actors.wall,wall);assert.equal(hydrated.actors.truck.position.x,4);assert.equal(hydrated.actors.door,undefined);assert.equal(hydrated.construction.earthworks,full.construction.earthworks);
 const damaged=compactRoomSnapshot({...next,actors:{wall:{...wall,health:60}}},{action:'input',snapshotMode:'compact'});assert.equal(damaged.actors.wall.health,60);
 const cut={...next,construction:{earthworks:{revision:3,patches:[{heights:[-1,0]}]}}};assert.equal(compactRoomSnapshot(cut,{action:'input',snapshotMode:'compact',earthworksRevision:2}).construction.earthworks.revision,3);
 assert.equal(compactRoomSnapshot(full,{action:'join',snapshotMode:'compact'}),full,'joining always supplies a recovery baseline');assert.equal(compactRoomSnapshot(full,{action:'input'}),full,'older clients retain the full protocol');
});
test('human live counts exclude named AI players and include residents and machine operators separately',()=>{
 const p=worldPopulation({players:{a:{username:'Alice'},b:{username:'Noor',basketballAI:true},old:{username:'Old',lastSeen:0}},actors:{r:{id:'r',resident:{name:'Leo Reed',role:'Host'}}},construction:{crew:{workers:[{id:'c',name:'Maya Chen',role:'Crane operator'}]}}},20000);
 assert.equal(p.humanCount,1);assert.equal(p.aiCount,3);assert.deepEqual(p.humans.map(p=>p.name),['Alice']);assert.ok(p.ai.some(p=>p.name==='Maya Chen'));
});

test('authored scenery without runtime definitions is compacted while unknown actors remain live',()=>{
 const floor={id:'floor',active:true,open:false,switched:false,health:100},state={actors:{floor,unknown:{...floor,id:'unknown'}}};
 const compact=compactRoomSnapshot(state,{action:'input',snapshotMode:'compact'},{builderScene:{objects:[{id:'floor',functionalSettings:{behavior:'decor'}}]}});
 assert.equal(compact.actors.floor,undefined);assert.ok(compact.actors.unknown);assert.equal(hydrateRoomSnapshot(compact,state).actors.floor,floor);
});

test('unchanged actor membership is acknowledged once and deletion forces a fresh membership list',()=>{
 const state={actors:{wall,car:{id:'car'}},construction:{earthworks:{revision:1}}},request={action:'input',snapshotMode:'compact'},first=compactRoomSnapshot(state,request),baseline=hydrateRoomSnapshot(first,state),second=compactRoomSnapshot(state,{...request,actorSetRevision:first.actorSetRevision});
 assert.equal(second.actorIds,undefined);assert.deepEqual(Object.keys(hydrateRoomSnapshot(second,baseline).actors),['wall','car']);
 const removed=compactRoomSnapshot({...state,actors:{car:state.actors.car}},{...request,actorSetRevision:first.actorSetRevision});assert.deepEqual(removed.actorIds,['car']);assert.equal(hydrateRoomSnapshot(removed,baseline).actors.wall,undefined);
});

test('a changed map revision forces a full scenery baseline even when actor identities stay the same',()=>{
 const next={sceneVersion:'new-map',actors:{wall:{...wall,position:{x:4}}}};
 assert.equal(compactRoomSnapshot(next,{action:'input',snapshotMode:'compact',sceneVersion:'old-map'}),next);
 const compact=compactRoomSnapshot(next,{action:'input',snapshotMode:'compact',sceneVersion:'new-map'});assert.equal(compact.actorsPartial,true);
});
