import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {forgeWorld} from '../forge-world.mjs';
import {FORGE_ID,FORGE_STATIONS,FORGE_CREW,nearestForgeStation} from '../public/js/forge-config.js';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {WorldAtlas} from '../world-atlas.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {mapSectorKind,mapWheelSvg} from '../public/js/map-wheel-svg.js';
import {filterWorlds,filterWorldCategory} from '../public/js/world-map-picker.js';
import {mapQuestOffers} from '../public/js/map-quest-catalog.js';
import {layoutHeight,createLayoutTerrain} from '../public/js/environments/layout-terrain.js';
import {GAME_ECONOMY} from '../game-economy.mjs';

test('forge remains in online and offline map catalogues with connected factory gateways and themed quests',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'forge-world-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const manifest=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 assert.equal(manifest.filter(map=>map.id===FORGE_ID).length,1);
 const {environments,connectivity}=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),[]),map=environments.find(value=>value.id===FORGE_ID);
 assert.ok(map?.permanent&&map.playable&&map.multiplayer&&map.sharedWorld);assert.equal(map.roomId,FORGE_ID);assert.equal(mapSectorKind(map),'forge');assert.match(map.playUrl,/environment=traditional-forge/);
 assert.ok(map.portalTargets.includes('world-item-factory'));assert.ok(map.portalTargets.includes('public-commons'));assert.ok(environments.find(value=>value.id==='world-item-factory').portalTargets.includes(FORGE_ID));
 assert.ok(connectivity.links.some(link=>link.from===FORGE_ID&&link.to==='world-item-factory'));assert.ok(connectivity.links.some(link=>link.to===FORGE_ID&&link.from==='world-item-factory'));
 const rows=environments.map(env=>({env,count:0}));assert.ok(filterWorlds(rows,'metallurgy').some(row=>row.env.id===FORGE_ID));assert.ok(filterWorldCategory(rows,'forge').some(row=>row.env.id===FORGE_ID));assert.match(mapWheelSvg([{env:map,count:0}],map.id),/Emberfall Forge/);
 const offers=mapQuestOffers(map);assert.ok(offers.length>=3);assert.match(offers[0].title,/forge apprenticeship/);assert.ok(offers.some(offer=>offer.kind==='site-job'));
 for(const object of map.builderScene.objects)assert.ok(GAME_ECONOMY.some(item=>item.buildAssetId===object.modelId),object.modelId+' is market and Backpack compatible');
});

test('forge has level shared terrain, continuous walking routes, clear work pads and three persistent AI specialists',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'forge-walk-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const map=forgeWorld(),store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>1000000}),identity={accountId:'forge-walker',username:'Smith'};
 const state=await runtime.command(map.id,map,identity,{action:'join',requestId:'arrive',radToxEnabled:false,deferRadTox:true});
 assert.equal(state.radTox,null);assert.equal(state.players[state.selfId].health,100);
 const specialists=Object.values(state.actors).filter(actor=>actor.resident?.forge);assert.equal(specialists.length,FORGE_CREW.length);assert.deepEqual(specialists.map(actor=>actor.resident.name).sort(),FORGE_CREW.map(person=>person.name).sort());
 assert.ok(specialists.every(actor=>actor.resident.isAI&&actor.definition.gameplay.behavior==='talk'));
 const terrain=createLayoutTerrain('forge',128);assert.ok(terrain.userData.planarCollision);assert.equal(layoutHeight('forge',0,0),0);assert.equal(layoutHeight('forge',37,-19),0);terrain.dispose();
 let current={...state.players[state.selfId].position};
 const route=[[0,20],[0,0],[-30,0],[-30,-7],[-30,0],[-18,0],[-18,-7],[-18,0],[-6,0],[-6,-7],[-6,0],[6,0],[6,-7],[6,0],[18,0],[18,-7],[18,0],[30,0],[30,-7],[30,0],[0,0],[0,28],[-23,28],[-23,38]];
 for(const [x,z]of route){const origin={...current},steps=Math.ceil(Math.hypot(x-origin.x,z-origin.z)/.2);for(let step=1;step<=steps;step++){const fraction=step/steps;current=runtime.collision.resolve(map,current,{x:origin.x+(x-origin.x)*fraction,y:current.y-.03,z:origin.z+(z-origin.z)*fraction},state.actors,state.objects);}assert.ok(Math.hypot(current.x-x,current.z-z)<.3,'connected floor reaches '+x+','+z+' from '+JSON.stringify(current));}
 for(const station of FORGE_STATIONS){const options={entry:true,actors:state.actors,objects:state.objects},floor=runtime.collision.groundAt(map,station.approach,options);assert.ok(floor,station.name);assert.ok(runtime.collision.hasBodyClearance(map,floor,.38,options),station.name+' has room for an operator');assert.equal(nearestForgeStation(map,floor)?.kind,station.kind);}
 runtime.collision.clearPlacedWorlds();
});
