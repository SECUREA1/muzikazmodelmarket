import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {EnvironmentRegistry,normalizeEnvironmentList} from '../public/js/environments/environment-registry.js';
import {filterWorlds,filterWorldCategory,sortWorlds} from '../public/js/world-map-picker.js';
import {mapSectorKind,mapWheelSvg} from '../public/js/map-wheel-svg.js';
import {destinationIcon} from '../public/js/atlas-destinations.js';
import {isTropicalIslandMap,tropicalIslandPlayUrl} from '../public/js/tropical-island-destination.js';

const records=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
const island=records.find(map=>map.id==='tropical-island');

test('the resort is a permanent native solo game with a dedicated map preview',async()=>{
 assert.ok(island);assert.equal(island.buzzSeconds,120);assert.equal(island.unlimitedExploration,true);assert.equal(island.roundSeconds,undefined);assert.equal(island.builderScene.gameplay.roundSeconds,undefined);assert.equal(island.builderScene.gameplay.buzzSeconds,120);assert.equal(island.multiplayer,false);assert.equal(island.permanent,true);
 assert.match(island.description,/for as long as you like/);assert.match(island.description,/independently within 120 seconds/);
 assert.equal(island.canDelete,false);assert.equal(island.canEdit,false);assert.equal(island.game,'tropical-island');
 assert.equal(isTropicalIslandMap(island),true);assert.equal(isTropicalIslandMap({mapId:island.id}),true);assert.equal(isTropicalIslandMap({game:'basketball'}),false);
 const thumbnail=await readFile(new URL('..'+island.thumbnailUrl,import.meta.url),'utf8');
 assert.match(thumbnail,/<title/);assert.match(thumbnail,/<desc/);assert.match(thumbnail,/paddle boats/);
 const registry=new EnvironmentRegistry();registry.environments=normalizeEnvironmentList([island]);
 assert.equal(registry.find('island-adventure').id,island.id);assert.equal(registry.find('tropical-resort').sharedWorld,false);
});

test('the island survives publication refreshes and launches from its permanent atlas building and saved pin',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'tropical-island-directory-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'atlas.json');let atlas=new WorldAtlas(file);
 let result=await synchronizeWorldDirectory(atlas,[]),map=result.environments.find(map=>map.id===island.id);
 assert.ok(map);assert.equal(map.sharedWorld,false);assert.equal(map.multiplayer,false);assert.equal(map.playUrl,tropicalIslandPlayUrl(map));
 const launch=new URL(map.playUrl,'https://world.example/');assert.equal(launch.pathname,'/tropical-island.html');assert.equal(launch.searchParams.get('mode'),'solo');assert.equal(launch.searchParams.get('environment'),island.id);
 const district=result.environments.find(place=>place.id===map.districtId);
 assert.ok(district.builderScene.objects.some(object=>object.atlasDestination===island.id));
 assert.ok(map.portalTargets.includes('public-commons'));assert.ok(map.portalTargets.includes(district.id));
 const cell=Object.values(result.atlas.cells).find(cell=>cell.mapId===island.id),pin=await atlas.pin(island.id,null,{accountId:'tester',username:'Test player'});
 assert.equal(new URL(pin.playUrl,'https://world.example/').pathname,'/tropical-island.html');assert.match(pin.playUrl,/mode=solo/);
 atlas=new WorldAtlas(file);result=await synchronizeWorldDirectory(atlas,[{id:island.id,name:'Override',visibility:'private',playable:false}]);
 const restored=result.environments.find(map=>map.id===island.id),restoredCell=Object.values(result.atlas.cells).find(cell=>cell.mapId===island.id);
 assert.equal(restored.name,island.name);assert.equal(restored.visibility,'public');assert.equal(restored.multiplayer,false);
 assert.deepEqual([restoredCell.column,restoredCell.row],[cell.column,cell.row]);assert.match(restoredCell.playUrl,/^tropical-island\.html/);
});

test('the island is searchable and featured in the games map with a tropical icon',()=>{
 const worlds=[{env:{id:'ordinary'},count:0},{env:island,count:0}];
 assert.equal(sortWorlds(worlds)[0].env.id,island.id);
 assert.equal(filterWorlds(worlds,'paddle boats')[0].env.id,island.id);
 assert.equal(filterWorldCategory(worlds,'games')[0].env.id,island.id);
 assert.equal(filterWorldCategory(worlds,'island')[0].env.id,island.id);
 assert.equal(mapSectorKind(island),'island');assert.equal(destinationIcon(island),'🏝');
 const wheel=mapWheelSvg([{env:island,count:0}],island.id);
 assert.match(wheel,/data-kind="island"/);assert.match(wheel,/Island Adventure/);
});
