import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WorldAtlas,defaultStreets} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {editableMapScene} from '../public/js/editable-map-import.js';
import {filterWorldCategory,filterWorlds,sortWorlds} from '../public/js/world-map-picker.js';
import {mapSectorKind,mapWheelSvg} from '../public/js/map-wheel-svg.js';
import {destinationColor,destinationTheme,destinationIcon,FITNESS_MAP_GOLD} from '../public/js/atlas-destinations.js';
import {WORLD_DISTRICTS} from '../world-districts.mjs';
import {FITNESS_STATIONS,FITNESS_RESIDENTS,FITNESS_TRAINERS,FITNESS_BOUNDS} from '../public/js/fitness-config.js';
import {FITNESS_ITEMS} from '../public/js/fitness-equipment.js';
import {FITNESS_EQUIPMENT_PLACEMENTS} from '../public/js/fitness-builder.js';
import {fitnessWorld} from '../fitness-world.mjs';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {EnvironmentLoader} from '../public/js/environments/environment-loader.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {outdoorProfile} from '../public/js/environments/outdoor-scenery.js';

const FITNESS_ID='muzikaz-fitness-centre';
const rows=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
const world=rows.find(row=>row.id===FITNESS_ID);

test('fitness centre is a permanent shared destination with district and Commons return gateways',async t=>{
 assert.ok(world,'native fitness centre is registered');
 const directory=await mkdtemp(join(tmpdir(),'fitness-atlas-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const result=await synchronizeWorldDirectory(new WorldAtlas(join(directory,'atlas.json')),[]),listed=result.environments.find(row=>row.id===FITNESS_ID);
 assert.ok(listed?.permanent);assert.equal(listed.roomId,FITNESS_ID);assert.equal(listed.game,'fitness');
 assert.ok(listed.sharedWorld&&listed.multiplayer&&listed.playable&&listed.publicDestination);assert.equal(listed.canDelete,false);assert.equal(listed.canEdit,false);
 assert.match(listed.playUrl,/model-explorer\.html\?environment=muzikaz-fitness-centre/);
 assert.deepEqual(listed.streets,[]);assert.deepEqual(listed.builderScene.streets,[]);
 assert.ok(listed.travelPortals.some(portal=>portal.mapId==='public-commons'));
 assert.ok(listed.travelPortals.some(portal=>portal.mapId===listed.districtId));
 const district=result.environments.find(row=>row.id===listed.districtId);
 assert.ok(district.builderScene.objects.some(object=>object.functionalSettings?.portal?.targetMapId===FITNESS_ID),'gym has a physical district gateway');
 assert.ok(listed.builderScene.layoutMeta.locations.length>=5,'complete gym locations reach the local map');
 assert.equal(outdoorProfile(listed),null);
 assert.equal(listed.mapTheme,'gold');assert.equal(listed.mapColor,FITNESS_MAP_GOLD);
 assert.equal(listed.districtColor,WORLD_DISTRICTS.find(region=>region.id==='skyline-deck').color,'gold map treatment keeps the canonical district identity');
 const gateway=district.builderScene.objects.find(object=>object.functionalSettings?.portal?.targetMapId===FITNESS_ID);
 assert.equal(gateway.materialSettings.accent,FITNESS_MAP_GOLD);assert.equal(gateway.functionalSettings.portal.color,FITNESS_MAP_GOLD);
});

test('fitness maps remove inherited atlas roads on refresh and retain authored access routes',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fitness-roads-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(directory,'atlas.json'));
 const old={id:'copied-gym',name:'Copied gym',source:'custom-builder',builderScene:{layout:'grand-floor',mapSize:100,objects:[]}};
 await atlas.synchronize([old]);
 let state=await atlas.read(),cell=Object.values(state.cells).find(cell=>cell.mapId===old.id);
 assert.deepEqual(cell.streets,defaultStreets(old.id,100));
 const access={id:'outside-access',from:{x:-45,z:45},to:{x:45,z:45},width:3};
 const fitness={...old,game:'fitness',builderScene:{...old.builderScene,sourceLayout:'fitness-centre',sourceFitness:{enabled:true},streets:[access]}};
 state=await atlas.synchronize([fitness]);cell=Object.values(state.cells).find(cell=>cell.mapId===old.id);
 assert.deepEqual(cell.streets,[access],'legacy roads are replaced with authored gym access only');
 state=await atlas.synchronize([{...fitness,game:undefined,builderScene:{...fitness.builderScene,streets:[]}}]);
 assert.deepEqual(Object.values(state.cells).find(cell=>cell.mapId===old.id).streets,[],'source layout preserves isolation after a Builder copy');
});

test('Builder copies preserve fitness stations and settings independently from the source',()=>{
 assert.ok(world);
 const source={...structuredClone(world),fitness:{enabled:true,currency:'MZK',stations:[{id:'fitness-bench',position:{x:4,y:0,z:6}}]}};
 const copy=editableMapScene(source,{id:'my-gym',layout:'repository-my-gym'});
 assert.equal(copy.sourceGame,'fitness');assert.equal(copy.sourceLayout,'fitness-centre');
 assert.ok(copy.sourceFitness.editableEquipment&&copy.sourceFitness.editableStations);
 assert.deepEqual(copy.sourceFitness.stations,source.fitness.stations,'explicit source station metadata is retained in the editable draft');
 assert.equal(copy.objects.length,FITNESS_EQUIPMENT_PLACEMENTS.length);assert.equal(new Set(copy.objects.map(object=>object.modelId)).size,Object.keys(FITNESS_ITEMS).length);
 assert.equal(copy.objects.filter(object=>object.functionalSettings.fitnessStation).length,FITNESS_STATIONS.length,'editable primary equipment replaces the native fixed markers');
 assert.ok(copy.objects.every(object=>!object.fitnessStation));assert.equal(source.builderScene.objects.length,FITNESS_STATIONS.length,'the native map markers are untouched');
 copy.sourceFitness.stations[0].position.x=99;assert.equal(source.fitness.stations[0].position.x,4);
 copy.objects[0].position.x=99;assert.notEqual(source.builderScene.objects[0].position.x,99);
 assert.equal(outdoorProfile({builderScene:{layout:'repository-my-gym',sourceLayout:copy.sourceLayout}}),null,'copied gyms retain an indoor environment');
});

test('fitness centre is discoverable in game filters, search and the destination wheel',()=>{
 const gym={env:world||{id:FITNESS_ID,game:'fitness',name:'Fitness centre'},count:0},land={env:{id:'forest',name:'Forest'},count:99};
 assert.equal(mapSectorKind(gym.env),'fitness');assert.equal(mapSectorKind({builderScene:{sourceLayout:'fitness-centre'}}),'fitness');
 assert.deepEqual(filterWorldCategory([land,gym],'fitness'),[gym]);assert.deepEqual(filterWorldCategory([land,gym],'games'),[gym]);
 assert.ok(filterWorlds([gym],'fitness').length);assert.equal(sortWorlds([land,gym])[0],gym);
 const wheel=mapWheelSvg([gym],FITNESS_ID);assert.match(wheel,/Fitness Centre/);assert.doesNotMatch(wheel,/NaN|undefined/);
});


test('gym gold takes precedence over district colours throughout map presentation',()=>{
 const place={mapId:FITNESS_ID,game:'fitness',name:'MUZIKAZ Fitness Centre',districtColor:'#7bea99'};
 assert.equal(destinationTheme(place),'gold');assert.equal(destinationColor(place),FITNESS_MAP_GOLD);assert.equal(destinationIcon(place),'🏋');
 assert.equal(destinationColor({...place,mapColor:'not-a-color'}),FITNESS_MAP_GOLD);
 assert.equal(destinationColor({mapId:'forest',districtColor:'#7bea99'}),'#7bea99');
 const wheel=mapWheelSvg([{env:world,count:0}],FITNESS_ID);assert.match(wheel,/stop-color="#d8ad45"/);assert.match(wheel,/data-kind="fitness"/);
});


test('expanded native map metadata and registry retain all activities and the full gym population',()=>{
 assert.deepEqual(world,fitnessWorld(),'the published gym record matches the native world definition');
 for(const kind of ['boxing-sparring','basketball','table-tennis','sprint'])assert.ok(world.fitness.stations.some(station=>station.kind===kind),kind+' is declared in the public map');
 assert.equal(world.fitness.stations.length,FITNESS_STATIONS.length);assert.equal(world.builderScene.layoutMeta.residents.length,FITNESS_RESIDENTS.length);assert.equal(FITNESS_RESIDENTS.length,18);assert.equal(FITNESS_TRAINERS.length,2);
 const half=world.builderScene.mapSize/2;assert.ok(half>=Math.max(Math.abs(FITNESS_BOUNDS.minX),Math.abs(FITNESS_BOUNDS.maxX)),'all east-wing coordinates fit Builder and atlas extents');
 assert.equal(world.playableSize,FITNESS_BOUNDS.width);assert.notEqual(world.contentUpdatedAt,'2026-10-23T12:00:00.000Z','content revision invalidates existing native map caches');
});

test('a legacy playable-size hint cannot shrink the browser gym away from authoritative station coordinates',async()=>{
 const map={...fitnessWorld(),playableSize:80},renderer={extensions:{has:()=>false},capabilities:{isWebGL2:true,getMaxAnisotropy:()=>1}};
 const loader=new EnvironmentLoader({scene:new THREE.Scene(),renderer,serverAuthoritative:()=>true});
 try{
  const result=await loader.load(map);assert.equal(result.scale,1,'fitness geometry keeps its authored metre scale even with an old size hint');
  const server=new ServerBuilderCollision(),browserBounds=new THREE.Box3().setFromObject(result.world.getObjectByName('MUZIKAZ_FITNESS_CENTRE')),serverBounds=new THREE.Box3().setFromObject(server.world(map).root.getObjectByName('MUZIKAZ_FITNESS_CENTRE'));
  assert.deepEqual(browserBounds.min.toArray(),serverBounds.min.toArray());assert.deepEqual(browserBounds.max.toArray(),serverBounds.max.toArray());
  for(const station of FITNESS_STATIONS)assert.ok(browserBounds.containsPoint(new THREE.Vector3(station.position.x,station.position.y,station.position.z)),station.kind+' remains inside the rendered gym');
 }finally{loader.unload();}
});
