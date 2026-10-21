import test from 'node:test';
import assert from 'node:assert/strict';
import {localMapBounds,localMapLocations} from '../public/js/local-map-locations.js';

test('plain maps have arrival and distributed local teleportals inside their actual footprint',()=>{
 const environment={id:'offset-glb',spawn:{x:130,y:3,z:-210}},bounds={min:{x:100,y:2,z:-300},max:{x:200,y:12,z:-100}},places=localMapLocations(environment,bounds);
 assert.deepEqual(localMapBounds(environment,bounds),{minX:100,maxX:200,minZ:-300,maxZ:-100,minY:2,maxY:12});
 assert.equal(places.length,9);assert.equal(places[0].id,'map-arrival');assert.equal(places[0].x,130);assert.equal(places[0].z,-210);
 for(const place of places)assert.ok(place.x>=100&&place.x<=200&&place.z>=-300&&place.z<=-100);
 assert.ok(places.some(p=>p.x<140));assert.ok(places.some(p=>p.x>160));assert.ok(places.some(p=>p.z<-220));assert.ok(places.some(p=>p.z>-180));
 assert.deepEqual(localMapLocations(environment,localMapBounds(environment,bounds)),places,'server flat bounds and client Box3 agree on every portal ID and position');
});

test('authored and commons destinations merge without hiding either list or duplicating IDs',()=>{
 const places=localMapLocations({builderScene:{mapSize:512,layoutMeta:{locations:[{id:'square',name:'Square',x:2,z:3},null,{id:'invalid',x:NaN,z:1}],commonsLocations:[{id:'square',x:8,z:9},{id:'garden',name:'Garden',x:70,z:-80}]}}});
 assert.equal(places.filter(p=>p.id==='square').length,1);assert.equal(places.find(p=>p.id==='square').x,2);assert.ok(places.some(p=>p.id==='garden'));assert.ok(!places.some(p=>p.id==='invalid'));assert.ok(places.some(p=>p.id==='map-arrival'));assert.ok(places.some(p=>p.id==='map-east'));
 const commons=localMapLocations({builderScene:{layoutMeta:{locations:[],commonsLocations:[{id:'commons',x:12,z:14}]}}});assert.ok(commons.some(p=>p.id==='commons'));
});

test('rich authored maps keep island and landmark arrivals while all map types get local destinations',()=>{
 const authored=Array.from({length:6},(_,i)=>({id:'island-'+i,x:i*50,z:i*30,width:10,depth:12})),environment={builderScene:{layoutMeta:{harbor:{extent:640},locations:authored}}};
 assert.equal(localMapBounds(environment).maxX,640);assert.deepEqual(localMapLocations(environment).slice(0,6).map(p=>p.id),authored.map(p=>p.id));assert.equal(localMapLocations(environment).length,7);
 for(const map of [{},{modelUrl:'/room.glb'},{proceduralLand:true},{builderScene:{mapSize:64}},{playableSize:40}])assert.equal(localMapLocations(map).length,9);
 const offset=localMapLocations({},{minX:100,maxX:120,minZ:200,maxZ:220});assert.equal(offset[0].x,110);assert.equal(offset[0].z,210);
});

test('solo size changes move terrain portals, authored arrivals and spawn together',()=>{
 const environment={spawn:{x:20,y:1,z:-10},builderScene:{mapSize:256,layoutMeta:{locations:[{id:'garden',name:'Garden',x:40,z:30,arrival:{x:38}}]}}};
 for(const scale of [.1,2]){
  const bounds=localMapBounds(environment,null,{scale}),places=localMapLocations(environment,null,{scale});
  assert.equal(bounds.maxX,128*scale);assert.equal(places.find(p=>p.id==='garden').x,40*scale);assert.equal(places.find(p=>p.id==='garden').arrival.x,38*scale);assert.equal(places.find(p=>p.id==='garden').arrival.z,undefined);assert.equal(places.find(p=>p.id==='map-arrival').x,20*scale);assert.ok(Math.abs(places.find(p=>p.id==='map-east').x-71.68*scale)<1e-8);
 }
});
