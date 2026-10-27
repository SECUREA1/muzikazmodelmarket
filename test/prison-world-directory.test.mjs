import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {filterWorldCategory,filterWorlds,sortWorlds} from '../public/js/world-map-picker.js';
import {mapSectorKind,mapWheelSvg} from '../public/js/map-wheel-svg.js';
import {normalizeEnvironmentList} from '../public/js/environments/environment-registry.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {worldPreviewData} from '../public/js/world-preview-data.js';
import {destinationColor,destinationIcon} from '../public/js/atlas-destinations.js';

const rows=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
const prison=rows.find(row=>row.id==='ironwood-prison');

test('Ironwood is a permanent connected prison destination without roads through its cell blocks',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'prison-directory-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const result=await synchronizeWorldDirectory(new WorldAtlas(join(directory,'atlas.json')),[]);
 const listed=result.environments.find(row=>row.id===prison.id);
 assert.equal(listed.game,'prison');assert.equal(listed.roomId,'ironwood-prison');
 assert.ok(listed.permanent&&listed.publicDestination&&listed.sharedWorld&&listed.playable&&listed.multiplayer);
 assert.equal(listed.canDelete,false);assert.equal(listed.canEdit,false);
 assert.equal(listed.builderScene.mapSize,240);assert.deepEqual(listed.spawn,{x:0,y:.02,z:88,rotationY:0});
 assert.deepEqual(listed.streets,[]);assert.deepEqual(listed.builderScene.streets,[]);
 assert.ok(listed.travelPortals.some(portal=>portal.mapId==='public-commons'));
 assert.ok(listed.travelPortals.some(portal=>portal.mapId===listed.districtId));
 const district=result.environments.find(row=>row.id===listed.districtId);
 assert.ok(district.builderScene.objects.some(object=>object.functionalSettings?.portal?.targetMapId===listed.id));
 assert.ok(listed.builderScene.layoutMeta.locations.length>=8);
 assert.match(listed.playUrl,/environment=ironwood-prison&house=ironwood-prison&mode=multiplayer&autoplay=1/);
});

test('prison games are searchable, featured, and available from their own category and All games',()=>{
 const world={env:prison,count:0},other={env:{id:'quiet-forest',name:'Quiet forest'},count:50};
 assert.equal(mapSectorKind(prison),'prison');
 assert.equal(mapSectorKind({builderScene:{sourceLayout:'prison'}}),'prison');
 assert.deepEqual(filterWorldCategory([other,world],'prison'),[world]);
 assert.deepEqual(filterWorldCategory([other,world],'games'),[world]);
 assert.deepEqual(filterWorlds([other,world],'prison escape'),[world]);
 assert.equal(sortWorlds([other,world])[0],world);
 assert.match(mapWheelSvg([world],prison.id),/Ironwood Prison/);
 assert.match(mapWheelSvg([world],prison.id),/data-kind="prison"/);
 assert.doesNotMatch(mapWheelSvg([world],prison.id),/NaN|undefined/);
});

test('authored prison roads remain isolated when an existing map is converted to a prison',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'prison-roads-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(directory,'atlas.json'));
 const original={id:'builder-prison',name:'Prison draft',source:'custom-builder',builderScene:{layout:'grand-floor',mapSize:240,objects:[]}};
 let state=await atlas.synchronize([original]);
 assert.ok(Object.values(state.cells).find(cell=>cell.mapId===original.id).streets.length);
 state=await atlas.synchronize([{...original,builderScene:{...original.builderScene,sourceLayout:'prison',layoutMeta:{prison:{enabled:true}},streets:[]}}]);
 assert.deepEqual(Object.values(state.cells).find(cell=>cell.mapId===original.id).streets,[]);
});

test('dedicated prison artwork has accessible title and description',async()=>{
 assert.match(prison.thumbnailUrl,/prison\.svg$/);
 const artwork=await readFile(new URL('..'+prison.thumbnailUrl,import.meta.url),'utf8');
 assert.match(artwork,/<title/);assert.match(artwork,/<desc/);assert.match(artwork,/IRONWOOD PRISON/);
});


test('registry normalization and previews preserve prison layout, station metadata and map identity',()=>{
 const [normalized]=normalizeEnvironmentList([prison]);
 assert.equal(normalized.game,'prison');assert.equal(normalized.prison.enabled,true);
 assert.ok(normalized.prison.stations.some(station=>station.id==='escape'));
 assert.equal(compileBuilderScene(normalized.builderScene).environment.layout,'prison');
 const preview=worldPreviewData(normalized);assert.ok(preview.procedural);assert.equal(preview.mapSize,240);
 assert.equal(preview.image,'/public/images/prison.svg');assert.equal(destinationIcon(normalized),'▥');
 assert.equal(destinationColor(normalized),'#e9a34b');
});
