import test from 'node:test';
import assert from 'node:assert/strict';
import {RangeRooms} from '../range-rooms.mjs';
import {isRangeMap,scoreRangeRay,RANGE_TARGETS} from '../public/js/range-rules.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {Box3} from '../public/vendor/three/three.module.min.js';
const env={layout:'firing-range'},host={accountId:'host',username:'Host'},guest={accountId:'guest',username:'Guest'},viewer={accountId:'viewer',username:'Viewer'};
const ray={origin:{x:0,y:1.55,z:10},direction:{x:0,y:0,z:-1}};
function setup(){let now=0;const rooms=new RangeRooms({now:()=>now});return {rooms,at:value=>{now=value;},send:(identity,command)=>rooms.command('range',env,identity,command)};}

test('range lobbies reserve lanes, preserve host settings, and wait for explicit host start',()=>{
 const {rooms,at,send}=setup();const first=send(host,{action:'join',course:'precision',weapon:'rail-cannon'});
 assert.equal(first.started,false);assert.equal(first.remaining,45);assert.equal(first.host,'account:host');
 const joined=send(guest,{action:'join',course:'rapid',weapon:'laser'});assert.equal(joined.players.length,2);assert.equal(joined.course,'precision');assert.equal(joined.weapon,'rail-cannon');
 at(4000);rooms.tick();assert.equal(send(host,{action:'watch'}).remaining,45);
 assert.throws(()=>send(guest,{action:'start'}),{statusCode:403});assert.throws(()=>send(host,{action:'shot',...ray}),{statusCode:409});
 assert.equal(send(host,{action:'start'}).started,true);at(5000);rooms.tick();assert.equal(send(guest,{action:'watch'}).remaining,44);
 assert.throws(()=>send(viewer,{action:'join'}),{statusCode:409});
});

test('range shots score geometry on the server, enforce cooldown, and deduplicate retries',()=>{
 const {at,send}=setup();send(host,{action:'join',course:'precision',weapon:'rail-cannon'});send(host,{action:'start'});
 const hit=send(host,{action:'shot',...ray,requestId:'first',score:99999});assert.deepEqual(hit.result,{hit:true,zone:'bullseye',lane:2,points:150});assert.equal(hit.players[0].score,150);assert.equal(hit.players[0].shots,1);
 const retry=send(host,{action:'shot',...ray,requestId:'first'});assert.equal(retry.players[0].shots,1);assert.equal(retry.players[0].score,150);
 assert.throws(()=>send(host,{action:'shot',...ray,requestId:'next'}),{statusCode:429});
 at(1000);const miss=send(host,{action:'shot',origin:{x:0,y:1.55,z:10},direction:{x:0,y:1,z:0},requestId:'miss'});assert.equal(miss.result.hit,false);assert.equal(miss.players[0].shots,2);assert.equal(miss.players[0].hits,1);
 at(2000);assert.throws(()=>send(host,{action:'shot',origin:{x:NaN,y:1,z:0},direction:{x:0,y:0,z:-1}}),{statusCode:400});
});

test('range shots respect fixed targets, booth dividers, valid origins, and weapon range',()=>{
 assert.ok(isRangeMap(env));assert.ok(isRangeMap({builderScene:{layout:'firing-range'}}));assert.equal(isRangeMap({layout:'basketball-arena'}),false);
 assert.equal(scoreRangeRay(ray.origin,ray.direction,'laser').points,100);
 assert.equal(scoreRangeRay({x:0,y:1.55,z:17},{x:0,y:0,z:-1},'flamethrower').hit,false);
 assert.equal(scoreRangeRay({x:0,y:1.55,z:10},{x:7,y:0,z:-23.5},'rail-cannon').hit,false,'lane divider blocks cross-lane shots');
 assert.equal(scoreRangeRay({x:999,y:1.55,z:10},ray.direction).hit,false);
 assert.equal(scoreRangeRay(ray.origin,{x:0,y:0,z:0}).hit,false);
});

test('authoritative range targets match every rendered scoring plate and silhouette including terrain height',()=>{
 const world=createBuilderLand({id:'firing-range',layout:'firing-range'}),targets=[];
 world.userData.updateRangeEffects(25,true);world.updateMatrixWorld(true);
 world.traverse(mesh=>{if(mesh.userData.rangeTarget)targets.push(mesh);});
 assert.equal(targets.length,RANGE_TARGETS.length);
 for(const [index,mesh]of targets.entries()){
  const bounds=new Box3().setFromObject(mesh),target=RANGE_TARGETS[index];
  assert.equal(mesh.userData.rangeLane,target.lane);assert.equal(mesh.userData.hitZone,target.zone);
  for(const side of ['min','max'])for(const axis of ['x','y','z'])assert.ok(Math.abs(bounds[side][axis]-target[side][axis])<1e-6,`${mesh.name} ${side}.${axis}`);
 }
 world.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});
});

test('host settings apply only in waiting lobbies and resets return all players to a clean lobby',()=>{
 const {send}=setup();send(host,{action:'join'});send(guest,{action:'join'});
 assert.throws(()=>send(guest,{action:'settings',course:'rapid'}),{statusCode:403});
 const changed=send(host,{action:'settings',course:'rapid',weapon:'pulse-rifle'});assert.equal(changed.remaining,30);assert.equal(changed.players.length,2);
 send(host,{action:'start'});send(host,{action:'shot',...ray});assert.throws(()=>send(host,{action:'settings',course:'precision'}),{statusCode:409});
 assert.throws(()=>send(guest,{action:'reset'}),{statusCode:403});const reset=send(host,{action:'reset'});
 assert.equal(reset.started,false);assert.equal(reset.finished,false);assert.equal(reset.remaining,30);assert.equal(reset.players.length,2);assert.ok(reset.players.every(player=>player.shots===0&&player.score===0));
});

test('range countdown, shot limits, member heartbeats, and host transfer are authoritative',()=>{
 const {rooms,at,send}=setup();send(host,{action:'join',course:'precision'});send(guest,{action:'join'});send(viewer,{action:'spectate'});
 at(14000);send(guest,{action:'watch'});send(viewer,{action:'watch'});at(16000);rooms.tick();assert.equal(send(guest,{action:'watch'}).host,'account:guest');
 send(guest,{action:'start'});assert.throws(()=>send(viewer,{action:'start'}),{statusCode:403});
 for(let shot=0;shot<12;shot++){at(16000+shot*250);send(guest,{action:'shot',...ray,requestId:'shot-'+shot});}
 assert.equal(send(guest,{action:'watch'}).finished,true);assert.throws(()=>send(guest,{action:'shot',...ray}),{statusCode:409});
 send(guest,{action:'reset'});send(guest,{action:'start'});at(26000);send(guest,{action:'watch'});at(39000);send(guest,{action:'watch'});at(52000);send(guest,{action:'watch'});at(65000);assert.equal(send(guest,{action:'watch'}).finished,true);
 rooms.leave('account:guest');assert.equal(rooms.rooms.get('range').host,null);
 at(82000);rooms.tick();assert.equal(rooms.rooms.size,0);
});
