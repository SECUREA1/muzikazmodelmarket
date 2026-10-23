import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {localMapLocations} from '../public/js/local-map-locations.js';
import {residentActivityRestricted} from '../server-resident-life.mjs';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';

async function runtime(t){
 const directory=await mkdtemp(join(tmpdir(),'resident-integration-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 return new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>100000});
}

test('saved maps place contextual residents on their translated and rotated base at the first join',async t=>{
 const world={id:'saved-music-room',name:'Saved music room',source:'custom-builder',spawn:{x:0,y:1,z:2},builderScene:{layout:'grand-floor',mapSize:40,objects:[],baseTransform:{x:180,y:6,z:-120,rotation:90,scale:1}}};
 const arrival=localMapLocations(world)[0];
 assert.equal(arrival.x,182);assert.equal(arrival.y,7);assert.equal(arrival.z,-120);
 const rooms=await runtime(t),state=await rooms.command(world.id,world,{accountId:'alice',username:'Alice'},{action:'join',requestId:'saved-world-join',radToxEnabled:false});
 const cast=Object.values(state.actors).filter(actor=>actor.resident);
 assert.ok(cast.length>=2,'the initial join contains a conversational cast');
 assert.ok(state.residentLife?.worldName);
 for(const npc of cast){
  assert.ok(Math.abs(npc.position.x-180)<20&&Math.abs(npc.position.z+120)<20);
  assert.ok(Math.abs(npc.position.y-6)<.1,'residents use the actual saved floor');
  assert.equal(npc.resident.context.kind,'music');
  assert.ok(npc.resident.personality&&npc.resident.skills&&npc.resident.appearance);
 }
 assert.deepEqual(world.builderScene.objects,[],'runtime residents leave the saved layout untouched');
});

test('construction maps have contextual residents when ambient traffic is disabled',async t=>{
 const world={id:'quiet-building-site',name:'Quiet construction site',game:'construction',construction:{enabled:true,ambientActivity:false},spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:100,objects:[],layoutMeta:{locations:[{id:'site-office',name:'Public site briefing office',x:30,z:30,width:12,depth:12}]}}};
 const rooms=await runtime(t),state=await rooms.command(world.id,world,{accountId:'alice',username:'Alice'},{action:'join',requestId:'construction-residents'});
 const cast=Object.values(state.actors).filter(actor=>actor.resident);
 assert.ok(cast.length>=2);
 assert.ok(cast.every(actor=>actor.resident.context.kind==='construction'));
 assert.ok(state.players['account:alice'].residentProgress&&state.residentLife);
});

test('native sports and arcade walkthroughs populate public areas with contextual contacts',async t=>{
 const catalogue=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 const directoryPath=await mkdtemp(join(tmpdir(),'resident-sports-directory-'));t.after(()=>rm(directoryPath,{recursive:true,force:true}));
 const directory=await synchronizeWorldDirectory(new WorldAtlas(join(directoryPath,'atlas.json')),catalogue);
 for(const id of ['basketball-arena','hockey-arena','firing-range','neon-junction'])await t.test(id,async t=>{
  const world=directory.environments.find(map=>map.id===id),rooms=await runtime(t);
  assert.ok(world.travelPortals?.length,'uses the real directory with its solid return portals');
  const state=await rooms.command(id,world,{accountId:'alice',username:'Alice'},{action:'join',requestId:'walkthrough-'+id,residentWalkthrough:true,radToxEnabled:false});
  const cast=Object.values(state.actors).filter(actor=>actor.resident);
  assert.ok(cast.length>=2,'public staff can interact with one another');
  assert.ok(cast.every(actor=>!residentActivityRestricted(world,actor.position)));
  assert.ok(cast.every(actor=>actor.resident.backstory&&actor.resident.skills));
  assert.equal(state.radTox,null);
  assert.equal(state.residentLife.worldId,id);
  const self=state.players['account:alice'];assert.ok(Math.min(...cast.map(npc=>Math.hypot(npc.position.x-self.position.x,npc.position.z-self.position.z)))<10,'a fresh visitor can speak to a public contact');
  if(id==='basketball-arena')assert.equal(state.players['account:alice'].basketballRole,'spectator');
 });
});
