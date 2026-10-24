import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {RANGED_WEAPONS} from '../public/js/game-weapons.js';
import {supportsWorldTools} from '../public/js/rad-tox-rules.js';

test('every bundled map supports equipped tools independently of ambient encounters',async()=>{
 const maps=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 assert.ok(maps.length>20);
 for(const map of maps)assert.equal(supportsWorldTools(map),true,map.id);
 assert.equal(supportsWorldTools(null),false);
 assert.equal(supportsWorldTools({playable:false}),false);
});

const mapTypes=[
 ['house',{}],['commons',{id:'public-commons'}],['fitness',{game:'fitness'}],['casino',{game:'casino'}],
 ['basketball',{basketball:true}],['airport',{airport:{enabled:true}}],['harbor',{harbor:true}],
 ['ski',{game:'ski'}],['construction',{game:'construction'}],['factory',{game:'missile-factory'}],
];
for(const [name,flags]of mapTypes)test(`${name} accepts every equipped weapon with RAD-TOX off`,async t=>{
 const directory=await mkdtemp(join(tmpdir(),'world-weapons-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,sequence=0;const charges=[];
 const map={id:'weapon-'+name,spawn:{x:0,y:0,z:0},...flags,builderScene:{layout:'grand-floor',mapSize:64,objects:[],...(flags.harbor?{layoutMeta:{harbor:{extent:64,islands:[]}}}:{})}};
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>now,charge:async(_identity,sku)=>charges.push(sku)});
 runtime.collision.safeSpawn=(_environment,point)=>({...point});
 runtime.collision.blocksShot=()=>false;
 runtime.collision.destructibleHit=()=>null;
 const identity={accountId:'visitor',username:'Visitor',stats:{health:100}};
 const send=(action,fields={})=>runtime.command(map.id,map,identity,{action,requestId:'weapon-'+ ++sequence,...fields});
 let state=await send('join',{deferRadTox:true,radToxEnabled:false});
 assert.equal(state.players[state.selfId].radToxReady,true);
 assert.equal(state.players[state.selfId].radToxEnabled,false);
 const initialAmmo=state.players[state.selfId].ammo;
 for(const tool of [...Object.keys(RANGED_WEAPONS),'bat','taser','toxin','dynamite','flamethrower']){
  now+=1500;state=await send('fire',{tool,direction:[0,1,0]});
  assert.equal(state.result.tool,tool);
  assert.deepEqual(state.result.direction,[0,1,0]);
  assert.ok(state.result.origin&&state.result.end,'confirmed shots include their visible trajectory');
  assert.equal(state.events.at(-1).action,'fire');
  assert.equal(state.events.at(-1).tool,tool);
  assert.equal(state.radTox,null,'equipping a weapon does not enable ambient enemies');
  assert.equal(state.match,null);
 }
 assert.equal(state.players[state.selfId].ammo,initialAmmo-Object.keys(RANGED_WEAPONS).length);
 assert.equal(state.players[state.selfId].fuel,95);
 assert.deepEqual(charges,[...Object.keys(RANGED_WEAPONS),'bat','taser','toxin','dynamite','flamethrower'].map(tool=>'tool:'+tool));
 if(state.basketball)assert.equal(state.actors[state.basketball.ballId].active,true,'using a weapon preserves the game ball');
});

test('opting out of a deferred encounter unlocks tools without activating that encounter',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'world-weapons-loading-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>100000});
 runtime.collision.safeSpawn=(_environment,point)=>point;runtime.collision.encounterSpawn=(_environment,point)=>point;
 const map={id:'weapon-loading',builderScene:{layout:'grand-floor',mapSize:64,objects:[]},spawn:{x:0,y:0,z:0}},identity={accountId:'visitor',stats:{health:100}};
 let sequence=0;const send=(action,fields={})=>runtime.command(map.id,map,identity,{action,requestId:'loading-'+ ++sequence,...fields});
 await send('join',{deferRadTox:true,radToxEnabled:true});
 await assert.rejects(send('fire',{tool:'laser',direction:[0,1,0]}),{code:'GAME_NOT_READY'});
 await send('rad-tox-toggle',{enabled:false});
 const fired=await send('fire',{tool:'laser',direction:[0,1,0]});
 assert.equal(fired.result.tool,'laser');assert.equal(fired.players[fired.selfId].radToxEnabled,false);
 assert.deepEqual(fired.match.participants,{});
 await runtime.store.update(map.id,room=>{room.simulation.match.state='finished';});
 assert.equal((await send('fire',{tool:'laser',direction:[0,1,0]})).result.tool,'laser','encounter results cannot disable tools after opting out');
});
