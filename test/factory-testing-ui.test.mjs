import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestFactoryTestingStation,testingSessionPhase,testingFlightPoint,ownTestingItems} from '../public/js/factory-testing-ui.js';
import {PROVING_ID,COMPOUND_ID,PROVING_STATIONS,COMPOUND_STATIONS,testingDeepAccess} from '../public/js/factory-test-config.js';

test('testing prompts respect their active map, edited station position, elevation and working on foot',()=>{
 const station=PROVING_STATIONS[0];assert.equal(nearestFactoryTestingStation({id:PROVING_ID},station.position)?.id,station.id);
 assert.equal(nearestFactoryTestingStation({id:'ordinary-map'},station.position),null);
 assert.equal(nearestFactoryTestingStation({id:PROVING_ID},station.position,{vehicleId:'truck'}),null);
 const edited={...station,id:'testing-instance:moved-console',position:{x:300,y:10,z:-200}};
 assert.equal(nearestFactoryTestingStation({id:'custom-proving'},edited.position,{stations:[edited]})?.id,edited.id);
 assert.equal(nearestFactoryTestingStation({id:'custom-proving'},station.position,{stations:[edited]}),null);
 assert.equal(nearestFactoryTestingStation({id:'custom-proving'},{...edited.position,y:20},{stations:[edited]}),null);
 assert.equal(nearestFactoryTestingStation({id:'custom-proving'},edited.position,{stations:[{...edited,enabled:false}]}),null);
 assert.equal(nearestFactoryTestingStation({id:COMPOUND_ID},COMPOUND_STATIONS[2].position)?.kind,'deep-hatch');
});

test('schematic countdown, flight and impact follow server time without granting a local completion',()=>{
 const session={status:'countdown',profileId:'accuracy',launchAt:5000,flightEndsAt:13000,endsAt:15000};
 assert.deepEqual(testingSessionPhase(session,1000),{phase:'countdown',progress:0,countdown:4});
 assert.deepEqual(testingSessionPhase(session,9000),{phase:'flight',progress:.5,countdown:null});
 assert.deepEqual(testingSessionPhase(session,16000),{phase:'impact',progress:1,countdown:null},'only a server-confirmed state can report completed results');
 const start=testingFlightPoint(session,5000),mid=testingFlightPoint(session,9000),end=testingFlightPoint(session,13000);
 assert.equal(start.x,95);assert.ok(mid.x>start.x&&mid.x<end.x);assert.ok(mid.y<start.y&&mid.y<end.y);
 const cargo=testingFlightPoint({...session,profileId:'cargo'},13000);assert.equal(cargo.cargo,true);assert.equal(cargo.x,665);assert.ok(Math.abs(cargo.y-238)<.001);
 assert.equal(testingSessionPhase({...session,status:'complete'},16000).phase,'complete');
});

test('owned item selector uses only private eligible records and rejects duplicate or unsupported profiles',()=>{
 const owned={id:'receipt-owned',name:'Owned model',profileId:'accuracy',buildAssetId:'factory-training-missile'};
 assert.deepEqual(ownTestingItems({eligibleItems:[owned,{...owned,name:'Duplicate'},{id:'unsupported',profileId:'untrusted'},null]}),[owned]);
 assert.deepEqual(ownTestingItems({items:[owned]}),[],'general editable inventory does not populate test selection');
 assert.deepEqual(ownTestingItems(null),[]);
});

test('deep controls require public clearance or the current custom compound puzzle',()=>{
 const solved={containment:{status:'solved',environmentId:'custom-compound'},clearance:{deep:false}};
 assert.equal(testingDeepAccess({id:'custom-compound'},solved),true);
 assert.equal(testingDeepAccess({id:'another-compound'},solved),false);
 assert.equal(testingDeepAccess({id:COMPOUND_ID},solved),false);
 assert.equal(testingDeepAccess({id:COMPOUND_ID},{clearance:{deep:true}}),true);
 assert.equal(testingDeepAccess({id:'custom-compound'},{...solved,containment:{...solved.containment,status:'active'},clearance:{deep:true}}),false);
 assert.equal(testingDeepAccess(null,solved),false);
});
