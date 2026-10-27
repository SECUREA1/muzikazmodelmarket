import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {constructionTarget,craneHookPosition} from '../public/js/construction-state.js';
import {earthworksTake,earthCargoVolume} from '../public/js/construction-earthworks.js';

const copy=value=>structuredClone(value);
const machine=(id,modelId,name,x,z)=>({id,modelId,name,asset:{buildAssetId:modelId,name},position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'vehicle',destructible:false}});
function world(id='skyscraper-construction'){
 return {id,name:'Saved construction site',game:'construction',permanent:id==='skyscraper-construction',proceduralLand:true,spawn:{x:-20,y:.02,z:23},contentUpdatedAt:'2026-10-27T18:00:00.000Z',
  construction:{enabled:true,crew:{autoStart:false},excavation:{x:25,z:17,width:8,depth:8,radius:4,maxDepth:3},stockpile:{x:30,z:39,width:8,depth:8}},
  builderScene:{layout:'grand-floor',mapSize:150,objects:[
   machine('construction-crane','tower-crane','Old crane label',-18,-4),
   machine('construction-truck','site-dumptruck','Old truck label',21,30),
   machine('construction-dozer','site-bulldozer','Old dozer label',45,58),
   machine('construction-excavator','site-excavator','Old excavator label',25,17),
   {id:'construction-old-office-panel',modelId:'material:cube',name:'Old office panel',position:{x:-40,y:0,z:60},scale:{x:1,y:1,z:1}}
  ]}};
}
function upgraded(original){
 const next=copy(original);next.contentUpdatedAt='2026-10-27T23:00:00.000Z';
 next.builderScene.objects=next.builderScene.objects.filter(item=>item.id!=='construction-old-office-panel');
 next.builderScene.objects.push({id:'construction-detailed-container',modelId:'shipping-container-box',name:'Detailed site container',position:{x:-40,y:0,z:60},scale:{x:1,y:1,z:1}});
 for(const item of next.builderScene.objects)if(item.functionalSettings?.behavior==='vehicle'){item.name='Updated '+item.modelId;item.asset.name=item.name;}
 return next;
}

test('a saved permanent site receives new models and labels without resetting operating machines or completed work',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'construction-graphics-upgrade-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const path=join(directory,'rooms.json'),before=world(),after=upgraded(before),now=()=>100000;
 const original=new AuthoritativeRooms({store:new SharedRoomStore(path),now});
 await original.store.update(before.id,room=>{
  const {sim}=original.initialize(room,before);
  for(const [index,id]of ['construction-crane','construction-truck','construction-dozer','construction-excavator'].entries()){
   const actor=sim.actors[id];actor.position={x:60+index*4,y:.02,z:66+index*3};actor.rotation={x:.02,y:1+index*.2,z:.01};actor.scale={x:1.01,y:1.01,z:1.01};
   Object.assign(actor.construction,{precision:true,boom:.93,bucket:-.7,blade:.6,bed:.2});
   if(actor.modelId==='tower-crane')actor.construction.hook=craneHookPosition(actor);
  }
  const truck=sim.actors['construction-truck'],cargo=earthworksTake(sim.construction.earthworks,{x:25,y:0,z:17},3,{radius:2,cutY:-1});
  assert.ok(earthCargoVolume(cargo)>0);truck.construction.cargo=cargo;truck.construction.load=earthCargoVolume(cargo);truck.holderId='account:driver';
  sim.players['account:driver']={actorId:'account:driver',position:{...truck.position},vehicleId:truck.id,lastSeen:100000,radToxEnabled:false,radToxReady:true};
  sim.construction.tower.placed=1;sim.construction.tower.target=constructionTarget(sim.construction.tower);
  const beam=sim.actors['construction-beam-0'];beam.constructionBeam.state='placed';beam.constructionBeam.floor=1;beam.position={x:5,y:4,z:-19};
  sim.construction.crew.workers[0].message='Assigned work remains saved';sim.construction.crew.jobs[0].progress=.42;
  room.objects['owner-placed-wall']={id:'owner-placed-wall',ownerId:'account:driver',materialId:'metal-panel',position:[-45,0,66],rotation:[0,.3,0],scale:[1,1,1],revision:1};
 });
 const saved=JSON.parse(await readFile(path,'utf8'))[before.id],oldMachines=Object.fromEntries(['construction-crane','construction-truck','construction-dozer','construction-excavator'].map(id=>[id,saved.simulation.actors[id]]));
 const restored=new AuthoritativeRooms({store:new SharedRoomStore(path),now});
 const migrated=await restored.store.update(after.id,room=>{restored.initialize(room,after);return copy(room);});
 assert.equal(migrated.simulation.actors['construction-old-office-panel'],undefined,'retired authored support parts must not remain as ghost actors');
 assert.equal(migrated.simulation.actors['construction-detailed-container'].modelId,'shipping-container-box');
 for(const [id,old]of Object.entries(oldMachines)){
  const actor=migrated.simulation.actors[id];
  assert.deepEqual(actor.position,old.position,id+' keeps its working location');
  assert.deepEqual(actor.rotation,old.rotation,id+' keeps its working pose');
  assert.deepEqual(actor.scale,old.scale,id+' keeps its scale');
  assert.deepEqual(actor.construction,old.construction,id+' keeps hydraulics, cargo and work state');
  assert.equal(actor.holderId,old.holderId,id+' keeps its driver');
  assert.equal(actor.asset.name,'Updated '+actor.modelId,'the current catalog label must still refresh');
 }
 assert.deepEqual(migrated.simulation.players,saved.simulation.players);
 assert.deepEqual(migrated.simulation.construction.earthworks,saved.simulation.construction.earthworks);
 assert.deepEqual(migrated.simulation.construction.crew,saved.simulation.construction.crew);
 assert.equal(migrated.simulation.construction.tower.placed,1);
 assert.deepEqual(migrated.simulation.actors['construction-beam-0'],saved.simulation.actors['construction-beam-0']);
 assert.deepEqual(migrated.objects,saved.objects,'independent owner placements are not a graphics migration target');
 const again=new AuthoritativeRooms({store:new SharedRoomStore(path),now});
 const repeated=await again.store.update(after.id,room=>{again.initialize(room,after);return copy(room);});
 assert.deepEqual(repeated,migrated,'restarting a second time cannot reapply or duplicate the upgrade');
});

test('an owner-authored construction copy still applies intentional machine relocation',async()=>{
 const before=world('my-custom-site'),after=upgraded(before),room={objects:{}},runtime=new AuthoritativeRooms({now:()=>100000});
 runtime.initialize(room,before);
 room.simulation.actors['construction-truck'].position={x:60,y:0,z:60};
 const moved=after.builderScene.objects.find(item=>item.id==='construction-truck');moved.position={x:12,y:0,z:23};moved.rotation={x:0,y:.8,z:0};
 runtime.initialize(room,after);
 assert.deepEqual(room.simulation.actors['construction-truck'].position,moved.position);
 assert.deepEqual(room.simulation.actors['construction-truck'].rotation,moved.rotation);
 assert.equal(room.simulation.actors['construction-truck'].asset.name,'Updated site-dumptruck');
});
