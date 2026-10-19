import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {RANGE_STATION_ACTIONS,readRangeSpotSettings,setRangeSpotEnabled,nearbyRangeStation,activateRangeStation} from '../public/js/firing-range-interactions.js';
import {collisionIsDisabled,isRenderedMesh} from '../public/js/environments/collision-policy.js';
import {scoreRangeRay} from '../public/js/range-rules.js';
import {disposePreviewWorld} from '../public/js/world-map-preview.js';

test('station prompts respect proximity, height, visibility, disabled settings, and world transforms',()=>{
  const world=createBuilderLand({id:'firing-range',layout:'firing-range'});
  const market=world.userData.rangeStations.find(item=>item.id==='market');
  const position={...market.position,z:market.position.z-1};
  assert.equal(nearbyRangeStation({world,position}).rangeAction,'market');
  assert.equal(nearbyRangeStation({world,position:{...position,y:8}}),null);
  assert.equal(nearbyRangeStation({world,position:{x:0,y:0,z:11}}),null);
  assert.equal(nearbyRangeStation({world,position,visible:()=>false}),null);
  assert.equal(setRangeSpotEnabled(world,'market',false),true);
  assert.equal(nearbyRangeStation({world,position}),null);
  assert.equal(world.getObjectByName('RANGE_STATION_MARKET').visible,false);
  setRangeSpotEnabled(world,'market',true);
  const transform=point=>({x:point.x+50,y:point.y+3,z:point.z-20});
  assert.equal(nearbyRangeStation({world,position:transform(position),toWorld:transform}).rangeAction,'market');
  disposePreviewWorld(world);
});

test('all service pads can be reached and activated without looking through a wall or counter',()=>{
  const world=createBuilderLand({id:'firing-range',layout:'firing-range'});world.updateMatrixWorld(true);
  for(const station of world.userData.rangeStations){
    const position=new THREE.Vector3(station.position.x,station.position.y,station.position.z-.6);
    const origin=position.clone();origin.y+=1.35;
    const target=new THREE.Vector3(station.position.x,station.position.y+1.35,station.position.z),direction=target.sub(origin);
    const ray=new THREE.Raycaster(origin,direction.clone().normalize(),0,direction.length());
    const blockers=ray.intersectObject(world,true).filter(hit=>isRenderedMesh(hit.object)&&!collisionIsDisabled(hit.object));
    assert.equal(blockers.length,0,station.id+' pad has a clear interaction path');
    assert.equal(nearbyRangeStation({world,position}).rangeAction,station.action);
    let calls=0;assert.equal(activateRangeStation(station.action,{[station.action]:()=>calls++}),true);assert.equal(calls,1);
  }
  disposePreviewWorld(world);
});

test('checkbox preferences default safely and arbitrary station actions cannot dispatch',()=>{
  assert.deepEqual(readRangeSpotSettings({getItem:()=>'{broken'}),{console:true,market:true,care:true,armory:true});
  assert.deepEqual(readRangeSpotSettings({getItem:()=>'{"market":false,"care":true,"injected":true}'}),{console:true,market:false,care:true,armory:true});
  for(const action of ['constructor','toString','javascript:alert(1)','purchase'])assert.equal(activateRangeStation(action,{[action]:()=>assert.fail('untrusted action')}),false);
  assert.equal(Object.keys(RANGE_STATION_ACTIONS).length,4);
});

test('decorative trainee, laser, outline and action meshes cannot intercept a scored shot',()=>{
  const world=createBuilderLand({id:'firing-range',layout:'firing-range'});world.userData.updateRangeEffects(0,true);world.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,1.55,13.5),new THREE.Vector3(0,0,-1));
  const hit=ray.intersectObject(world,true).find(item=>isRenderedMesh(item.object)&&!collisionIsDisabled(item.object));
  assert.equal(hit.object.userData.rangeTarget,true);assert.equal(hit.object.userData.hitZone,'bullseye');
  assert.equal(scoreRangeRay(ray.ray.origin,ray.ray.direction,'rail-cannon').points,150);
  assert.equal(scoreRangeRay({x:0,y:1.55,z:23},{x:0,y:0,z:-1},'rail-cannon').points,150,'an unobstructed shot through the open doorway can score');
  assert.equal(scoreRangeRay({x:7,y:1.55,z:18},{x:0,y:0,z:-1},'rail-cannon').hit,false,'the back-room front wall blocks a shot');
  disposePreviewWorld(world);
});
