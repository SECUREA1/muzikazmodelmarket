import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasJourneyUrl,readAtlasJourney,atlasJourneyConnectivity,atlasTransportLabel,ATLAS_JOURNEY_STOP_LIMIT} from '../public/js/atlas-journey.js';
import {planWorldJourney} from '../public/js/world-connectivity.js';

test('world route links keep only bounded public map ids and preserve ordered return visits',()=>{
 const url=atlasJourneyUrl({fromMapId:'public-commons',stops:['deed-a','deed-a','hormuz-shipping','deed-a'],orderId:'private-order',address:'Private doorstep'});
 assert.equal(url,'index.html?from=public-commons&stop=deed-a&stop=hormuz-shipping&stop=deed-a#world-map');
 assert.deepEqual(readAtlasJourney(url.slice(url.indexOf('?'),url.indexOf('#'))),{fromMapId:'public-commons',stops:['deed-a','hormuz-shipping','deed-a']});
 assert.ok(!url.includes('private-order'));assert.ok(!url.includes('Private'));
 assert.equal(readAtlasJourney('?'+new URL(atlasJourneyUrl({stops:Array.from({length:30},(_,index)=>'map-'+index)}),'https://world.test/').searchParams).stops.length,ATLAS_JOURNEY_STOP_LIMIT);
 assert.deepEqual(readAtlasJourney('?from='+('x'.repeat(201))+'&stop='+('z'.repeat(201))),{fromMapId:'',stops:[]});
});

test('route ids containing delimiters cannot add private fields or change the atlas page',()=>{
 const origin='map&order=secret',stop='map/#?wallet=private';
 const value=atlasJourneyUrl({fromMapId:origin,stops:[stop]}),parsed=new URL(value,'https://world.test/');
 assert.equal(parsed.pathname,'/index.html');assert.equal(parsed.hash,'#world-map');assert.deepEqual([...parsed.searchParams.keys()],['from','stop']);
 assert.deepEqual(readAtlasJourney(parsed.search),{fromMapId:origin,stops:[stop]});
});

test('atlas compatibility graph follows only the currently listed public gateways',()=>{
 const state={locations:[{mapId:'deed-a',name:'Home',playUrl:'model-explorer.html?environment=deed-a'},{mapId:'district',name:'District'},{mapId:'deed-b',name:'Store'}],connections:[{from:'deed-a',to:'district'},{from:'district',to:'deed-b'}]},graph=atlasJourneyConnectivity(state);
 const plan=planWorldJourney(graph,{fromMapId:'deed-a',stops:['deed-b']});
 assert.equal(plan.reachable,true);assert.deepEqual(plan.mapIds,['deed-a','district','deed-b']);assert.ok(plan.steps.every(step=>step.mode==='map-transfer'));
 assert.equal(planWorldJourney(graph,{fromMapId:'deed-a',stops:['deleted-deed','deed-b']}).reachable,false);
 assert.equal(atlasJourneyConnectivity({...state,connectivity:graph}),graph);
 assert.equal(atlasTransportLabel('plane'),'Planes / air freight');assert.equal(atlasTransportLabel('boat'),'Boats / shipping');assert.equal(atlasTransportLabel('map-transfer'),'Map gateway');
});
