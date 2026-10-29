import test from 'node:test';
import assert from 'node:assert/strict';
import {localMapWaypoint} from '../public/js/local-map-waypoint.js';
import {shippingWorld} from '../shipping-world.mjs';

const world={id:'deed-map',builderScene:{mapSize:256,layoutMeta:{locations:[{id:'dropoff',name:'Front door',x:22,y:0,z:-31}]}}};
test('order waypoint selects canonical local locations and carries no movement action',()=>{
 const point=localMapWaypoint(world,{locationId:'dropoff',position:{x:Infinity,z:NaN},name:'Delivery next stop',journeyId:'order-private'});
 assert.deepEqual([point.x,point.y,point.z],[22,0,-31]);assert.equal(point.name,'Delivery next stop');assert.equal(point.readOnly,true);assert.equal(point.waypoint,true);
 for(const key of ['locationId','entityId','arrival','mapId','journeyId','orderId'])assert.equal(point[key],undefined);
});
test('waypoint positions must be finite, local and in the current map',()=>{
 assert.deepEqual([localMapWaypoint(world,{position:{x:12,y:1,z:15},label:'Courier approach'}).x,localMapWaypoint(world,{position:{x:12,z:15}}).y],[12,0]);
 for(const position of [{x:NaN,z:0},{x:0,z:Infinity},{x:'1',z:2},{x:0,y:NaN,z:1},{x:129,z:0}])assert.equal(localMapWaypoint(world,{position}),null);
 assert.equal(localMapWaypoint(world,{mapId:'different-map',position:{x:1,z:2}}),null);
 assert.equal(localMapWaypoint(world,{locationId:'deleted-stop'}),null);
 assert.equal(localMapWaypoint(null,{position:{x:1,z:2}}),null);
});
test('Strait waypoints retain actual shore and runway coordinates beyond ordinary room limits',()=>{
 const world=shippingWorld(),point=localMapWaypoint(world,{position:{x:500,y:0,z:1050},name:'Receiving cargo apron'});
 assert.ok(point);assert.equal(point.z,1050);assert.equal(localMapWaypoint(world,{position:{x:1500,z:0}}),null);
});
