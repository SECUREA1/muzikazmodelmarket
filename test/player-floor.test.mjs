import test from 'node:test';
import assert from 'node:assert/strict';
import {WalkingFloorFollower,capsuleFeet,capsuleEndpoints,PLAYER_FLOOR_CLEARANCE} from '../public/js/player-floor.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
test('capsule bottom and top match feet and configured player height after every relocation',()=>{
 for(const y of [-12,0,.02,3,120]){const feet={x:4,y,z:9},radius=.34,height=1.65,segments=capsuleEndpoints(feet,height,radius),capsule={...segments,radius};assert.ok(Math.abs(segments.start.y-radius-y)<1e-10);assert.ok(Math.abs(segments.end.y+radius-y-height)<1e-10);const actual=capsuleFeet(capsule);assert.equal(actual.x,feet.x);assert.equal(actual.z,feet.z);assert.ok(Math.abs(actual.y-feet.y)<1e-10);}
});
test('grounded walking follows a rising surface without delayed sinking and caches nearby floor queries',()=>{
 const follower=new WalkingFloorFollower();let queries=0;
 const query=position=>{queries++;return {x:position.x,y:position.x*.5,z:position.z,normal:{x:-.5/Math.hypot(.5,1),y:1/Math.hypot(.5,1),z:0}};};
 for(let frame=0;frame<100;frame++){const x=frame*.01,height=follower.follow({x,y:Math.max(0,x*.5-.15),z:0},{grounded:true,now:frame*16,query});assert.ok(Math.abs(height-(x*.5+PLAYER_FLOOR_CLEARANCE))<1e-9);}
 assert.ok(queries<30,'nearby frames reuse the walkable plane');
});
test('jumps, voids, walls and other storeys never pull the player onto a false floor',()=>{
 const follower=new WalkingFloorFollower(),position={x:0,y:2,z:0};
 const query=()=>({x:0,y:0,z:0,normal:{x:0,y:1,z:0}});
 assert.equal(follower.follow(position,{grounded:false,query}),2);
 assert.equal(follower.follow(position,{grounded:true,now:100,query}),2);
 follower.reset();assert.equal(follower.follow(position,{grounded:true,now:200,query:()=>null}),2);
 follower.reset();assert.equal(follower.follow(position,{grounded:true,query:()=>({x:0,y:2,z:0,normal:{x:1,y:0,z:0}})}),2);
});
test('procedural floors keep the authoritative feet above the collision surface',()=>{
 const collision=new ServerBuilderCollision(),map={id:'floor-contract',builderScene:{layout:'grand-floor',mapSize:40,objects:[]}};
 let position={x:0,y:PLAYER_FLOOR_CLEARANCE,z:0};
 for(let frame=0;frame<100;frame++){position=collision.resolve(map,position,{x:position.x+.01,y:position.y-.004,z:0},{});assert.ok(Math.abs(position.y-PLAYER_FLOOR_CLEARANCE)<1e-8);}
});
