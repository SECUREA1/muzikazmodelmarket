import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mapSectorKind,mapWheelSvg} from '../public/js/map-wheel-svg.js';
import {filterWorlds,filterWorldCategory,sortWorlds} from '../public/js/world-map-picker.js';
import {destinationIcon,destinationTheme,destinationColor,FACTORY_MAP_ORANGE} from '../public/js/atlas-destinations.js';
import {WorldAtlas,attachAtlas,defaultStreets} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';

const factory={id:'muzikaz-missile-factory',name:'MUZIKAZ Missile Factory',game:'factory',permanent:true,publicDestination:true,category:'Factory & industry',description:'Build training missiles and cargo rockets with MZK and the factory crew.',visibility:'public',playable:true,multiplayer:true,mapColor:'#ef8b45',mapTheme:'industrial',streets:[{id:'factory-south-road',name:'Dispatch Road',from:{x:-65,z:58},to:{x:65,z:58},width:8}],builderScene:{layout:'missile-factory',mapSize:140,objects:[]}};

test('factory has a searchable industrial game category and a distinct atlas marker',()=>{
 const worlds=[{env:{id:'forest',name:'Forest'},count:100},{env:factory,count:0}];
 assert.equal(mapSectorKind(factory),'factory');
 assert.equal(mapSectorKind({builderScene:{sourceLayout:'missile-factory'}}),'factory');
 assert.equal(mapSectorKind({builderScene:{layoutMeta:{factory:{enabled:true}}}}),'factory');
 assert.deepEqual(filterWorldCategory(worlds,'factory').map(row=>row.env.id),[factory.id]);
 assert.deepEqual(filterWorldCategory(worlds,'games').map(row=>row.env.id),[factory.id]);
 assert.deepEqual(filterWorlds(worlds,'rocket factory').map(row=>row.env.id),[factory.id]);
 assert.equal(sortWorlds(worlds)[0].env.id,factory.id);
 const wheel=mapWheelSvg([{env:factory,count:3}],factory.id);
 assert.match(wheel,/data-kind="factory"/);assert.match(wheel,/Missile Factory/);assert.match(wheel,/#ef8b45/);
 assert.equal(destinationIcon(factory),'🏭');
 assert.equal(destinationIcon({mapId:factory.id}),'🏭');
 assert.equal(destinationTheme(factory),'industrial');
 assert.equal(destinationColor({game:'factory',districtColor:'#123456'}),FACTORY_MAP_ORANGE);
 assert.equal(destinationColor({...factory,mapColor:'#aabbcc'}),'#aabbcc');
});

test('factory atlas repair preserves authored roads around the production floor and builder copies',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'factory-atlas-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(directory,'atlas.json'));
 const copy={...structuredClone(factory),id:'my-factory',source:'custom-builder',publicDestination:false,permanent:false,game:undefined,builderScene:{...structuredClone(factory.builderScene),layout:'repository-factory',sourceLayout:'missile-factory',streets:structuredClone(factory.streets)}};
 let state=await atlas.synchronize([factory,copy]);
 for(const environment of [factory,copy])assert.deepEqual(attachAtlas(environment,state).streets,factory.streets);
 const ownerRoad={id:'factory-owner-road',name:'Service lane',from:{x:-40,z:35},to:{x:40,z:35},width:4,createdBy:'Builder'};
 await atlas.transaction(data=>{for(const cell of Object.values(data.cells))if([factory.id,copy.id].includes(cell.mapId))cell.streets=[...defaultStreets(cell.mapId,cell.size),ownerRoad];data.revision++;});
 state=await atlas.synchronize([factory,copy]);
 for(const environment of [factory,copy])assert.deepEqual(attachAtlas(environment,state).streets,[...factory.streets,ownerRoad]);
 const revision=state.revision;assert.equal((await atlas.synchronize([factory,copy])).revision,revision,'unchanged authored roads do not continually rewrite atlas state');
});

test('permanent factory is included by the shared directory without uploaded maps',async t=>{
 const registry=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 const authored=registry.find(row=>row.id===factory.id);assert.ok(authored?.permanent,'factory is committed as a permanent map');
 const directory=await mkdtemp(join(tmpdir(),'factory-directory-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(directory,'atlas.json')),[]);
 const listed=environments.find(row=>row.id===factory.id);assert.ok(listed?.playable&&listed.multiplayer);
 assert.equal(listed.roomId,factory.id);assert.equal(mapSectorKind(listed),'factory');
 assert.deepEqual(listed.streets,authored.streets);assert.deepEqual(listed.builderScene.streets,authored.streets);
 assert.match(listed.playUrl,/environment=muzikaz-missile-factory/);
});
