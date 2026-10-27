import test from 'node:test';
import assert from 'node:assert/strict';
import {shippingWorld} from '../shipping-world.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {logisticsStations} from '../public/js/factory-logistics-config.js';

const dispose=root=>{const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of[].concat(node.material||[]))if(material)resources.add(material);});for(const resource of resources)resource.dispose();};
function walk(collision,map,start,waypoints){let position={...start};for(const[x,z]of waypoints){const distance=Math.hypot(x-position.x,z-position.z),steps=Math.ceil(distance/.25),dx=(x-position.x)/Math.max(1,steps),dz=(z-position.z)/Math.max(1,steps);for(let i=0;i<steps;i++){const next=collision.resolve(map,position,{x:position.x+dx,y:position.y,z:position.z+dz});position={x:next.x,y:Number.isFinite(next.floorY)?next.floorY:next.y,z:next.z};assert.ok(position.y>=-.05,'walking route stays on a real quay instead of the underwater swim floor: '+JSON.stringify(position));}assert.ok(Math.hypot(position.x-x,position.z-z)<.16,'reaches '+x+','+z+'; actual '+position.x+','+position.z);}return position;}

test('Atlas export and eastern receiving desks have native walkable shore approaches and a reciprocal factory gate',()=>{
 const world=shippingWorld(),collision=new ServerBuilderCollision(),stations=logisticsStations(world);
 assert.equal(stations.length,2);assert.deepEqual(stations.map(station=>station.kind),['shipping','receiving']);
 for(const station of stations){const floor=collision.groundAt(world,station.position,{entry:true});assert.ok(floor&&floor.y>=-.05,station.name+' stands on a real quay above the swim floor');const normal=collision.groundAt(world,{...station.position,y:0});assert.ok(normal&&normal.y>=-.05,station.name+' is also reachable from a normal ground-floor query');assert.ok(collision.hasBodyClearance(world,floor,.38),station.name+' leaves a clear operator point');}
 const gate=world.builderScene.objects.find(object=>object.id==='shipping-atlas-factory-gateway');assert.equal(gate.functionalSettings.portal.targetMapId,'muzikaz-missile-factory');const floor=collision.groundAt(world,{...gate.position,y:.02},{entry:true});assert.ok(floor&&floor.y>=-.05&&collision.hasBodyClearance(world,floor,.38));dispose(collision.world(world).root);
});

test('a player walks between the actual export desk, factory gate and the public boarding quay',()=>{
 const world=shippingWorld(),collision=new ServerBuilderCollision(),spawn=collision.safeSpawn(world,world.spawn);
 const desk=walk(collision,world,spawn,[[-996,382],[-996,390],[-1004,390]]);walk(collision,world,desk,[[-996,390],[-996,394],[-987,394],[-987,390]]);walk(collision,world,desk,[[-996,390],[-996,382],[-1030,382]]);dispose(collision.world(world).root);
});


test('authoritative map-access reaches both logistics counters and the factory gateway on real pier floors',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'atlas-quay-access-'));t.after(()=>rm(directory,{recursive:true,force:true}));let now=1000000,request=0;
 const world=shippingWorld(),runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>now}),identity={accountId:'quay-access-player',username:'Quay access player'},send=(action,extra={})=>{now+=100;return runtime.command(world.id,world,identity,{action,requestId:'quay-access-'+ ++request,...extra});};
 let snapshot=await send('join');const stations=logisticsStations(world);
 for(const station of stations){snapshot=await send('map-access',{position:{x:station.position.x,z:station.position.z}});const player=snapshot.players[snapshot.selfId];assert.ok(player.position.y>=-.05,station.name+' map travel stays above the water floor');assert.ok(Math.hypot(player.position.x-station.position.x,player.position.z-station.position.z)<.05,station.name+' exact operator point supports map-access');}
 const gate=world.builderScene.objects.find(object=>object.id==='shipping-atlas-factory-gateway');snapshot=await send('map-access',{position:{x:gate.position.x,z:gate.position.z}});assert.ok(snapshot.players[snapshot.selfId].position.y>=-.05,'the reciprocal gateway is on the real quay');
});
