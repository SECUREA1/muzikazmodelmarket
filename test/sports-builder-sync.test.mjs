import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {sportsEnvironmentKind,sportsEnvironmentSettings,isCleanSportsEnvironment} from '../public/js/sports-worlds.js';
import {isBasketballEnvironment} from '../public/js/basketball-rules.js';
import {isHockeyMap} from '../public/js/hockey-rules.js';
import {isArcadeMap} from '../public/js/arcade-rules.js';
import {isDedicatedFiringRange,firingRangeLocations,rangeLocalToWorld} from '../public/js/firing-range.js';
import {mapSectorKind} from '../public/js/map-wheel-svg.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {builderBaseSpawn} from '../public/js/environments/builder-base.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {HockeyRooms} from '../hockey-rooms.mjs';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';

const records=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));
const saved=id=>({id:'saved-'+id,name:'My '+id,proceduralLand:true,builderScene:{layout:'repository-'+id,mapSize:120,baseEnvironment:structuredClone(records.find(map=>map.id===id)),objects:[]}});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} should equal ${expected}`);

for(const [id,kind,detect]of [['basketball-arena','basketball',isBasketballEnvironment],['hockey-arena','hockey',isHockeyMap],['firing-range','range',isDedicatedFiringRange],['force-training-range','range',isDedicatedFiringRange],['neon-junction','arcade',isArcadeMap]])test(`${id} retains the same game rules, map category and clean surfaces after builder save`,()=>{
 const map=saved(id);assert.equal(sportsEnvironmentKind(map),kind);assert.ok(detect(map));assert.equal(mapSectorKind(map),kind);assert.ok(isCleanSportsEnvironment(map));
 const root=createBuilderLand(map);assert.ok(root.userData.cleanSportsWorld);assert.ok(root.children.length);
 if(kind==='basketball')assert.equal(typeof root.userData.setBasketballState,'function');
 if(kind==='range')assert.equal(root.userData.firingRange.targets.length,10);
});

test('top-level layout and flags use the same sport classification as builder layouts',()=>{
 assert.ok(isBasketballEnvironment({id:'court',layout:'basketball-stadium'}));
 assert.ok(isHockeyMap({id:'hockey-arena'}));
 assert.ok(isDedicatedFiringRange({id:'custom-range',game:'firing-range'}));
 assert.ok(isCleanSportsEnvironment({id:'custom-court',basketballCourt:true}));
 assert.equal(sportsEnvironmentKind({id:'ordinary',builderScene:{layout:'grand-floor',gameplay:{basketball:true}}}),null,'stale gameplay settings do not turn a floor into a court');
 assert.equal(sportsEnvironmentKind({id:'constructor'}),null);
 assert.equal(sportsEnvironmentKind({basketball:true,builderScene:{layout:'basketball-stadium',baseEnvironment:{layout:'hockey-arena'}}}),'hockey','the rendered base wins over stale wrapper metadata');
 const cyclic={};cyclic.baseEnvironment=cyclic;assert.equal(sportsEnvironmentKind(cyclic),null);
});

test('saved and aligned range targets, floor and spawn agree with authoritative coordinates',()=>{
 const map=saved('firing-range');map.builderScene.baseTransform={x:25,y:2,z:-10,rotation:90,scale:1.25};
 const root=createBuilderLand(map);root.updateMatrixWorld(true);const location=firingRangeLocations(map)[0];
 for(const target of location.targets){const actual=root.getObjectByName('RANGE_TARGET_'+target.id).getWorldPosition(new THREE.Vector3()),expected=rangeLocalToWorld(location,target.position);near(actual.x,expected.x);near(actual.y,expected.y);near(actual.z,expected.z);}
 const spawn=builderBaseSpawn(map),expected=rangeLocalToWorld(location,map.builderScene.baseEnvironment.spawn);near(spawn.x,expected.x);near(spawn.y,expected.y);near(spawn.z,expected.z);
 const collision=new ServerBuilderCollision(),floor=collision.groundAt(map,{...spawn,y:spawn.y+.1});assert.ok(floor);near(floor.y,2.02);
});

for(const id of ['basketball-arena','hockey-arena'])test(`saved ${id} keeps regulation geometry when a legacy scene contains an alignment`,()=>{
 const map=saved(id);map.builderScene.baseTransform={x:100,y:10,z:200,rotation:90,scale:2};
 const root=createBuilderLand(map);root.updateMatrixWorld(true);near(root.position.x,0);near(root.position.y,0);near(root.position.z,0);near(root.scale.x,1);
 assert.deepEqual(builderBaseSpawn(map),{...map.builderScene.baseEnvironment.spawn,rotationY:map.builderScene.baseEnvironment.spawn.rotationY||0});
});

test('saved basketball has one authoritative shared ball and synchronized player roles',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'sports-save-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const map=saved('basketball-arena'),rooms=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>100000});
 await rooms.command(map.id,map,{accountId:'one',username:'One',stats:{health:100}},{action:'join',requestId:'join-one'});
 const state=await rooms.command(map.id,map,{accountId:'two',username:'Two',stats:{health:100}},{action:'join',requestId:'join-two'});
 assert.equal(state.basketball.state,'ready');assert.equal(Object.keys(state.players).length,2);assert.equal(Object.values(state.actors).filter(actor=>actor.basketballMatchBall).length,1);assert.equal(state.players['account:one'].basketballRole,'player');assert.equal(state.players['account:two'].basketballRole,'player');assert.equal(state.radTox,null);
});

test('saved hockey uses authored base settings with explicit builder overrides in the shared room',()=>{
 const map=saved('hockey-arena');map.builderScene.baseEnvironment.hockey={mode:'tournament',difficulty:'normal',periodSeconds:60,icing:false};map.builderScene.gameplay={hockey:{periodSeconds:90}};
 assert.deepEqual(sportsEnvironmentSettings(map,'hockey'),{mode:'tournament',difficulty:'normal',periodSeconds:90,icing:false});
 const rooms=new HockeyRooms({now:()=>100000}),first=rooms.command(map.id,map,{accountId:'one',username:'One'},{action:'join'}),second=rooms.command(map.id,map,{accountId:'two',username:'Two'},{action:'join'});
 assert.equal(first.state.config.mode,'tournament');assert.equal(second.state.config.periodSeconds,90);assert.equal(second.state.config.icing,false);assert.equal(second.state.players.filter(p=>p.human).length,2);
});

test('world directory launches saved games in their actual game page and shared map room',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'sports-directory-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const result=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),['basketball-arena','hockey-arena','firing-range','neon-junction'].map(saved));
 for(const [id,page]of [['basketball-arena','model-explorer.html'],['hockey-arena','hockey.html'],['firing-range','model-explorer.html'],['neon-junction','arcade.html']]){const map=result.environments.find(map=>map.id==='saved-'+id),url=new URL(map.playUrl,'https://game.test/');assert.equal(url.pathname,'/'+page);assert.equal(url.searchParams.get('environment'),map.id);assert.equal(url.searchParams.get('house'),map.id);assert.equal(url.searchParams.get('mode'),'multiplayer');}
});
