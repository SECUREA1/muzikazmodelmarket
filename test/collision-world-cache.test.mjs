import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const crate=x=>({id:'crate',spawned:true,active:true,asset:{buildAssetId:'supply-crate'},position:{x,y:0,z:0},rotation:{y:0}});
const piece=x=>({id:'piece',revision:1,materialId:'wall',position:[x,1,0],rotation:[0,0,0],scale:[1,1,1]});
const boat=()=>({id:'boat',modelId:'harbor-skiff',active:true,trafficAI:true,position:{x:20,y:0,z:20},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}});
const machine=()=>({id:'excavator',modelId:'site-excavator',active:true,position:{x:40,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},construction:{kind:'excavator',boom:0,stick:0,bucket:0,swing:0}});
function state(collision,actors,objects,environment){const view=collision.placedWorld(actors,objects,environment);return {view,static:collision.placedCache.world,traffic:collision.trafficCollision,construction:collision.constructionCollision};}

test('alternating real Airport, Docks and Main rooms reuses each room’s collision geometry',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'collision-world-cache-'));
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>100000});
 t.after(async()=>{runtime.collision.clearPlacedWorlds();await rm(directory,{recursive:true,force:true});});
 const repository=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(directory,'atlas.json')),repository.map(world=>({...world,source:'repository'})));
 const rooms=[];
 for(const [index,id]of ['muzikaz-airport','world-district-neon-docks','muzikaz-main'].entries()){
  const environment=environments.find(world=>world.id===id);assert.ok(environment);
  const snapshot=await runtime.command(id,environment,{accountId:'cache-'+index,username:'Cache visitor',stats:{health:100}},{action:'join',requestId:'join-'+index,deferRadTox:true,radToxEnabled:false});
  rooms.push({environment,actors:snapshot.actors,objects:snapshot.objects});
 }
 const physical=rooms.map(room=>state(runtime.collision,room.actors,room.objects,room.environment));
 assert.ok(physical[0].static.meshes.length>10);assert.ok(physical[1].static.meshes.length>10);
 for(let round=0;round<8;round++)for(const [index,room]of rooms.entries()){
  // Room storage clones every command; reuse must follow the room and content,
  // rather than the temporary actors/objects JavaScript object identities.
  const current=state(runtime.collision,structuredClone(room.actors),structuredClone(room.objects),{...room.environment});
  assert.strictEqual(current.static,physical[index].static,room.environment.id+' retains its native models');
  assert.strictEqual(current.traffic,physical[index].traffic,room.environment.id+' retains its traffic hulls');
  assert.strictEqual(current.construction,physical[index].construction);
 }
 assert.equal(runtime.collision.placedWorlds.size,3,'only the three queried room scopes are retained');
});

test('saved-piece variants and other rooms preserve caches while actor, traffic and mechanism updates invalidate correctly',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'mutable-room'},other={id:'other-room'},actors={crate:crate(0),boat:boat(),excavator:machine()},objects={piece:piece(8)};
 const actorOnly=state(collision,actors,{},environment),withObjects=state(collision,actors,objects,environment),otherRoom=state(collision,{crate:crate(-5)},{},other);
 for(let round=0;round<3;round++){
  assert.strictEqual(state(collision,actors,{},environment).static,actorOnly.static);
  assert.strictEqual(state(collision,actors,objects,environment).static,withObjects.static);
  assert.strictEqual(state(collision,{crate:crate(-5)},{},other).static,otherRoom.static);
 }
 const hull=actorOnly.traffic.entries.get('boat').root.children[0].geometry,mechanism=actorOnly.construction.meshes[0],beforeMechanism=actorOnly.construction.boxes.map(box=>box.max.y);
 actors.boat.position.x+=12;actors.excavator.construction.boom=.7;
 const moved=state(collision,actors,{},environment);
 assert.strictEqual(moved.static,actorOnly.static,'moving traffic and hydraulics do not rebuild native models');
 assert.strictEqual(moved.traffic.entries.get('boat').root.children[0].geometry,hull);
 assert.equal(moved.traffic.entries.get('boat').root.position.x,32);
 assert.strictEqual(moved.construction.meshes[0],mechanism);
 assert.notDeepEqual(moved.construction.boxes.map(box=>box.max.y),beforeMechanism,'joint changes update physical boxes');
 objects.piece.position[0]+=7;objects.piece.revision++;
 const edited=state(collision,actors,objects,environment);
 assert.notStrictEqual(edited.static,withObjects.static);
 assert.ok(edited.view.boxes.filter(box=>box.objectId==='piece').every(box=>box.min.x>12));
 assert.strictEqual(state(collision,actors,{},environment).static,actorOnly.static,'editing saved pieces keeps the actors-only variant');
 actors.crate.position.x+=10;
 const relocated=state(collision,actors,{},environment);
 assert.strictEqual(relocated.static,actorOnly.static,'pose changes reuse native geometry');assert.ok(relocated.view.boxes.filter(box=>box.objectId==='crate').every(box=>box.min.x>9));
 assert.strictEqual(state(collision,{crate:crate(-5)},{},other).static,otherRoom.static,'editing one room preserves another room');
 actors.boat.active=false;assert.equal(state(collision,actors,{},environment).traffic.entries.has('boat'),false);
 collision.clearPlacedWorlds();
});

test('collision room retention uses bounded LRU eviction and disposes obsolete geometry',()=>{
 const collision=new ServerBuilderCollision({maxPlacedWorlds:2}),actors={crate:crate(0)},first=state(collision,actors,{}, {id:'a'}),second=state(collision,actors,{}, {id:'b'});let disposed=0;
 second.static.meshes[0].geometry.addEventListener('dispose',()=>disposed++);
 assert.strictEqual(state(collision,actors,{}, {id:'a'}).static,first.static);
 state(collision,actors,{}, {id:'c'});assert.deepEqual([...collision.placedWorlds.keys()],['a','c']);assert.ok(disposed>0);
 let previous=state(collision,actors,{}, {id:'a',updatedAt:'v1'}).static;const current=state(collision,actors,{}, {id:'a',updatedAt:'v2'}).static;
 assert.notStrictEqual(previous,current,'a new environment revision also clears old dynamic geometry');
 collision.clearPlacedWorlds();assert.equal(collision.placedWorlds.size,0);assert.equal(collision.placedCache,null);
 assert.notStrictEqual(state(collision,actors,{}, {id:'a',updatedAt:'v2'}).static,current,'master-state cache clearing rebuilds on demand');
 collision.clearPlacedWorlds();
});

test('piloted yacht pose updates retain real decks, walls and shot collision at the new pose',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'moving-yacht',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:256,objects:[]}},yacht={id:'yacht',modelId:'harbor-yacht',active:true,holderId:'pilot',position:{x:0,y:0,z:0},rotation:{y:0},scale:{x:1,y:1,z:1}},actors={yacht};
 const first=state(collision,actors,{},environment),geometries=first.static.meshes.map(mesh=>mesh.geometry);
 const deck=collision.groundAt(environment,{x:0,y:10,z:0},{actors});assert.ok(Math.abs(deck.y-5.045)<1e-5);
 assert.equal(collision.hasBodyClearance(environment,{x:5,y:5.04,z:0},.3,{actors,objects:{}}),false);
 assert.equal(collision.blocksShot(environment,{x:-20,y:5.5,z:0},[1,0,0],40,actors),true);
 const triangles=first.static.wallTriangles,index=first.static.meshIndex;assert.ok(triangles);assert.ok(index);
 for(let frame=0;frame<30;frame++){
  yacht.position.x+=.01;const moved=state(collision,actors,{},environment);assert.strictEqual(moved.static,first.static);assert.deepEqual(moved.static.meshes.map(mesh=>mesh.geometry),geometries);
 }
 yacht.position={x:60,y:3,z:60};yacht.rotation.y=Math.PI/2;yacht.scale={x:1.4,y:1.2,z:.8};
 const moved=state(collision,actors,{},environment);assert.strictEqual(moved.static,first.static);
 assert.equal(moved.static.wallTriangles,undefined);assert.equal(moved.static.meshIndex,undefined,'old spatial and triangle indexes are cleared after a pose update');
 const newDeck=collision.groundAt(environment,{x:60,y:20,z:60},{actors});assert.ok(Math.abs(newDeck.y-(3+5.025*1.2+.02))<1e-5,'deck support follows translation, rotation and scale');
 assert.ok(collision.groundAt(environment,{x:0,y:10,z:0},{actors}).y<.1,'the old deck location is empty');
 assert.equal(collision.hasBodyClearance(environment,{x:60,y:3+5.04*1.2,z:60-5*1.4},.3,{actors,objects:{}}),false,'the transformed railing remains solid');
 assert.equal(collision.hasBodyClearance(environment,{x:5,y:5.04,z:0},.3,{actors,objects:{}}),true,'the old railing location is empty');
 assert.equal(collision.blocksShot(environment,{x:60,y:3+5.5*1.2,z:60+20*1.4},[0,0,-1],40*1.4,actors),true,'shots still hit transformed real geometry');
 assert.equal(collision.blocksShot(environment,{x:-20,y:5.5,z:0},[1,0,0],40,actors),false,'shots pass through the vacated location');
 assert.notStrictEqual(moved.static.wallTriangles,triangles);assert.notStrictEqual(moved.static.meshIndex,index);
 yacht.holderId='another-pilot';const reboarded=state(collision,actors,{},environment);assert.notStrictEqual(reboarded.static,moved.static,'holder changes retain structural invalidation');
 yacht.placementRevision=2;const revised=state(collision,actors,{},environment);assert.notStrictEqual(revised.static,reboarded.static);
 yacht.modelId='harbor-skiff';delete yacht.holderId;const replaced=state(collision,actors,{},environment);assert.notStrictEqual(replaced.static,revised.static,'model changes rebuild geometry');
 yacht.active=false;assert.equal(state(collision,actors,{},environment).static.meshes.length,0);
 collision.clearPlacedWorlds();
});
