import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {HOCKEY_ITEMS,createHockeyArena,createHockeyItem} from '../public/js/hockey-models.js';
import {RINK} from '../public/js/hockey-rules.js';

function dispose(root){
 const geometries=new Set(),materials=new Set();
 root.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:node.material?[node.material]:[])materials.add(material);});
 for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
}
const names=root=>{const result=[];root.traverse(node=>result.push(node.name));return result;};

test('the hockey Builder inventory covers the full stadium, rink, facilities, equipment and roles',()=>{
 const ids=new Set(HOCKEY_ITEMS.map(item=>item.id));
 assert.equal(ids.size,HOCKEY_ITEMS.length);
 for(const id of [
  'hockey-arena','hockey-rink','hockey-ice-surface','hockey-rink-markings','hockey-rink-boards','hockey-rink-glass',
  'hockey-board-section','hockey-glass-panel','hockey-center-circle','hockey-faceoff-circle','hockey-faceoff-dot',
  'hockey-blue-line','hockey-red-line','hockey-goal-crease','hockey-net','hockey-home-bench','hockey-away-bench',
  'hockey-home-penalty-box','hockey-away-penalty-box','hockey-scorers-table','hockey-locker-tunnel',
  'hockey-seating-section','hockey-upper-seating-section','hockey-end-seating-section','hockey-seat',
  'hockey-concourse','hockey-entry-tunnel','hockey-scoreboard','hockey-light-bank','hockey-roof-truss',
  'hockey-guard-rail','hockey-arena-wall','hockey-arena-floor','hockey-led-ribbon','hockey-water-bottle',
  'hockey-crowd-section','hockey-stick','hockey-skates','hockey-puck','hockey-player','hockey-goalie','hockey-referee','hockey-linesman'
 ])assert.ok(ids.has(id),id);
 for(const item of HOCKEY_ITEMS){
  assert.equal(item.category,'hockey');assert.equal(item.buildAssetId,item.id);assert.equal(item.procedural,true);
  assert.equal(item.basic,true);assert.equal(item.priceMzk,0);assert.equal(item.assetKind,'premade');
  assert.equal(item.dimensions.length,3);assert.ok(item.dimensions.every(value=>Number.isFinite(value)&&value>0));
  const root=createHockeyItem(item.id);assert.ok(root,item.id);
  const bounds=new THREE.Box3().setFromObject(root),actual=bounds.getSize(new THREE.Vector3()).toArray();
  assert.equal(bounds.isEmpty(),false,item.id);
  actual.forEach((value,axis)=>assert.ok(Math.abs(value-item.dimensions[axis])<.025,`${item.id} axis ${axis}: geometry ${value}, catalog ${item.dimensions[axis]}`));
  if(item.behavior==='decor'){assert.equal(item.animation,'none');assert.equal(root.userData.hockeyRole,undefined);}
  dispose(root);
 }
 assert.equal(createHockeyItem('hockey-does-not-exist'),null);
});

test('the placeable complete stadium retains the live arena facilities and regulation playing surface',()=>{
 const reference=createHockeyArena(),built=createHockeyItem('hockey-arena');
 assert.equal(built.userData.cleanSportsWorld,true);assert.equal(built.userData.preservePlacementOrigin,true);
 assert.equal(built.userData.spectatorSeatCount,reference.userData.spectatorSeatCount);
 assert.equal(built.userData.spectatorFanCount,reference.userData.spectatorFanCount);
 for(const name of ['REGULATION_ICE_SURFACE','HOME_PLAYER_BENCH','AWAY_PLAYER_BENCH','HOME_PENALTY_BOX','AWAY_PENALTY_BOX','OFFICIAL_SCORERS_TABLE','CENTER_ICE_JUMBOTRON','ENCLOSED_ARENA_ENVIRONMENT','INSTANCED_ARENA_FANS'])assert.ok(built.getObjectByName(name),name);
 const ice=built.getObjectByName('REGULATION_ICE_SURFACE'),size=new THREE.Box3().setFromObject(ice).getSize(new THREE.Vector3());
 assert.ok(Math.abs(size.x-RINK.length)<.001);assert.ok(Math.abs(size.z-RINK.width)<.001);
 assert.equal(ice.userData.sportsSurface,'ice');assert.equal(ice.position.y,.005);
 assert.equal(names(built).filter(name=>name==='WOVEN_GOAL_NET').length,2);
 dispose(reference);dispose(built);
});

test('custom rink layers retain their shared surface origin and assemble without an extra stadium',()=>{
 const rink=createHockeyItem('hockey-rink'),ice=createHockeyItem('hockey-ice-surface'),boards=createHockeyItem('hockey-rink-boards'),glass=createHockeyItem('hockey-rink-glass'),markings=createHockeyItem('hockey-rink-markings');
 assert.equal(rink.getObjectByName('HOCKEY_ARENA_FACILITIES'),undefined);
 for(const root of [rink,ice,boards,glass,markings])assert.equal(root.userData.preservePlacementOrigin,true);
 assert.equal(ice.children.length,1);assert.equal(ice.getObjectByName('REGULATION_ICE_SURFACE').position.y,.005);
 const boardBounds=new THREE.Box3().setFromObject(boards),glassBounds=new THREE.Box3().setFromObject(glass);
 assert.ok(Math.abs(boardBounds.max.y-glassBounds.min.y)<.000001,'glass starts on top of the boards');
 assert.equal(names(markings).filter(name=>name==='HOCKEY_RINK_LINE').length,5);
 assert.equal(names(markings).filter(name=>name==='HOCKEY_GOAL_CREASE').length,2);
 assert.equal(markings.getObjectByName('REGULATION_ICE_SURFACE'),undefined);
 for(const root of [rink,ice,boards,glass,markings])dispose(root);
});

test('standalone facilities are grounded and keep their authored details without a full arena',()=>{
 for(const [id,detail]of [
  ['hockey-home-bench','BENCH_ICE_GATE'],['hockey-away-bench','RESERVE_SKATER_JERSEY'],
  ['hockey-home-penalty-box','PENALTY_BOX_GATE'],['hockey-away-penalty-box','PENALTY_BOX_BACK_GLASS'],
  ['hockey-scorers-table','OFFICIAL SCOREKEEPER'],['hockey-locker-tunnel','LOCKER ROOMS'],
  ['hockey-scoreboard','SCOREBOARD_BODY'],['hockey-light-bank','ARENA_LIGHT_BANK'],
  ['hockey-seating-section','SPECTATOR_SEAT_CUSHIONS'],['hockey-upper-seating-section','TIER_GUARD_RAIL'],
  ['hockey-end-seating-section','END_STAND_TIER'],['hockey-seat','SPECTATOR_SEAT_BACKS']
 ]){
  const root=createHockeyItem(id);assert.ok(root.getObjectByName(detail),`${id}: ${detail}`);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(root).min.y)<.000001,id);
  assert.equal(root.getObjectByName('REGULATION_ICE_SURFACE'),undefined,id);
  if(id.includes('seating-section'))assert.ok(root.userData.spectatorSeatCount>=200,id);
  dispose(root);
 }
});
