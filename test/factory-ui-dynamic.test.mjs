import test from 'node:test';
import assert from 'node:assert/strict';
import {factoryStations} from '../public/js/missile-factory-config.js';
import {factoryItemSettings} from '../public/js/missile-factory-items.js';
import {nearestFactoryStation,factoryStationForRole,factoryJobTarget,factoryMapBounds} from '../public/js/missile-factory-ui.js';

const equipment=(id,modelId,x,z,extra={})=>({id,modelId,name:id,position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:factoryItemSettings(modelId),...extra});
const scene=objects=>({id:'custom-factory-ui',factory:{enabled:true,editableEquipment:true},builderScene:{objects}});

test('nearby prompts follow rotated scaled Builder station approaches and exclude removed or disabled machines',()=>{
 const machine=equipment('rotated-cnc','factory-fabricator',100,-70,{rotation:{x:0,y:Math.PI/2,z:0},scale:{x:1,y:1,z:2}}),environment=scene([machine]);
 const stations=factoryStations(environment),station=stations[0];
 assert.equal(station.id,'factory-instance:rotated-cnc');assert.ok(Math.abs(station.position.x-107)<.001);assert.ok(Math.abs(station.position.z+70)<.001);
 assert.equal(nearestFactoryStation(environment,station.position)?.id,station.id);
 assert.equal(nearestFactoryStation(environment,{x:-30,y:0,z:0}),null,'original public coordinates do not create a phantom station');
 machine.functionalSettings.active=false;assert.equal(nearestFactoryStation(environment,station.position),null);
 machine.functionalSettings.active=true;environment.builderScene.objects=[];assert.equal(nearestFactoryStation(environment,station.position),null);
});

test('job controls resolve active instance identities by role and stop when the last required station disappears',()=>{
 const environment=scene([equipment('press','factory-fabricator',40,50),equipment('load','factory-loading-bay',80,-20),equipment('dispatch-a','factory-dispatch-terminal',100,0),equipment('dispatch-b','factory-dispatch-terminal',200,0)]),stations=factoryStations(environment);
 const job={status:'awaiting',stepIndex:0,steps:[{kind:'fabrication',stationId:'factory-instance:deleted-press'}]};
 assert.equal(factoryJobTarget(job,stations,{x:40,y:0,z:50}).id,'factory-instance:press');
 assert.equal(factoryJobTarget(job,stations.filter(station=>station.kind!=='fabrication'),{x:40,y:0,z:50}),null);
 assert.equal(factoryJobTarget({...job,status:'haul'},stations,{x:80,y:0,z:-20}).id,'factory-instance:load');
 assert.equal(factoryJobTarget({...job,status:'loaded'},stations,{x:199,y:0,z:0}).id,'factory-instance:dispatch-b');
 assert.equal(factoryStationForRole(stations,'dispatch',{x:100,y:0,z:0},'factory-instance:dispatch-b').id,'factory-instance:dispatch-b','selected dispatch terminal wins when several are active');
 const truck=nearestFactoryStation(environment,{x:80,y:0,z:-12},{vehicleId:'truck'});assert.equal(truck.kind,'loading');
 assert.equal(nearestFactoryStation(environment,stations[0].position,{vehicleId:'truck'}),null,'machine cells require working on foot');
});

test('runtime stations supplied by the authoritative view enable nearby interactions in ordinary maps',()=>{
 const ordinary={id:'city-street'},stations=[{id:'factory-instance:bought-terminal',kind:'procurement',position:{x:315,y:0,z:-250},interactionDistance:3}];
 assert.equal(nearestFactoryStation(ordinary,{x:315,y:0,z:-250},{stations}).id,stations[0].id);
 assert.equal(nearestFactoryStation(ordinary,{x:315,y:4,z:-250},{stations}),null);
 assert.equal(nearestFactoryStation(ordinary,{x:315,y:0,z:-250},{stations:[{...stations[0],enabled:false}]}),null);
 const bounds=factoryMapBounds([...stations,{id:'remote',kind:'loading',position:{x:-800,y:0,z:600}}],{x:900,y:0,z:-900});
 for(const point of [...stations.map(station=>station.position),{x:-800,z:600},{x:900,z:-900}]){assert.ok(point.x>bounds.x&&point.x<bounds.x+bounds.width);assert.ok(point.z>bounds.z&&point.z<bounds.z+bounds.depth);}
});
