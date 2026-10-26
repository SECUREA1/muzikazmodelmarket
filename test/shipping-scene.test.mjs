import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {shippingSceneState,createShippingScene} from '../public/js/shipping-scene.js';
const environment={id:'hormuz-shipping'};
const make=()=>({shipping:{enabled:true,ports:[{id:'port-a',x:10,z:20},{id:'port-b',berth:{x:400,z:20}}]},players:{alice:{health:100,shipping:{job:{phase:'sailing',originId:'port-a',destinationId:'port-b',checkpointIndex:1,waypoints:[{x:30,z:40},{x:80,z:50,name:'Strait gate'},{x:300,z:20}],hazard:{type:'mines',position:{x:110,z:30},resolved:false}}}}}});
test('shipping world marks only the next confirmed checkpoint and its actual destination berth',()=>{
 const snapshot=make(),state=shippingSceneState(snapshot,'alice',environment);
 assert.deepEqual(state.next,{x:80,y:0,z:50});assert.equal(state.name,'Strait gate');assert.equal(state.route.length,2);
 assert.deepEqual(state.berth,{x:400,y:0,z:20});assert.deepEqual(state.hazard.position,{x:110,y:0,z:30});
 snapshot.players.alice.shipping.job.receivingBerth={x:446.5,z:20};assert.deepEqual(shippingSceneState(snapshot,'alice',environment).berth,{x:446.5,y:0,z:20});
 snapshot.players.alice.shipping.job.hazard.resolved=true;assert.equal(shippingSceneState(snapshot,'alice',environment).hazard,null);
 snapshot.players.alice.shipping.job.phase='unloading';assert.equal(shippingSceneState(snapshot,'alice',environment).next,null);
 assert.equal(shippingSceneState(snapshot,'alice',{id:'neon-harbor'}),null);
 snapshot.players.alice.health=0;assert.equal(shippingSceneState(snapshot,'alice',environment),null);
});
test('visible route geometry updates with server progression and releases its resources on map exit',()=>{
 const scene=new THREE.Scene(),projection=createShippingScene(scene,{createCanvas:()=>null}),snapshot=make();
 projection.update(snapshot,'alice',environment);assert.equal(projection.snapshot().enabled,true);
 assert.equal(scene.getObjectByName('NEXT_SHIPPING_CHANNEL_GATE').position.x,80);
 assert.equal(scene.getObjectByName('ARCADE_MINE_WARNING').visible,true);
 let released=0;const old=scene.getObjectByName('CONFIRMED_SHIPPING_ROUTE').geometry;old.addEventListener('dispose',()=>released++);
 snapshot.players.alice.shipping.job.checkpointIndex=2;projection.update(snapshot,'alice',environment);assert.equal(released,1);
 projection.animate(1);projection.reset();assert.equal(projection.snapshot().enabled,false);
 projection.dispose();assert.equal(scene.children.length,0);projection.dispose();
});
