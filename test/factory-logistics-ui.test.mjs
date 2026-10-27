import test from 'node:test';
import assert from 'node:assert/strict';
import {ownLogisticsItems,nearestFactoryLogisticsStation,factoryLogisticsNextStep,activeLogisticsManifest} from '../public/js/factory-logistics-ui.js';
import {FACTORY_LOGISTICS_STATIONS,LOGISTICS_DESTINATIONS} from '../public/js/factory-logistics-config.js';
import {FACTORY_ID} from '../public/js/missile-factory-config.js';
import {PROVING_ID} from '../public/js/factory-test-config.js';

test('logistics station prompts use active real positions, full height and an on-foot interaction',()=>{
 const station=FACTORY_LOGISTICS_STATIONS.find(value=>value.kind==='export');
 assert.equal(nearestFactoryLogisticsStation({id:FACTORY_ID},station.position)?.id,station.id);
 assert.equal(nearestFactoryLogisticsStation({id:'ordinary'},station.position),null);
 assert.equal(nearestFactoryLogisticsStation({id:FACTORY_ID},station.position,{vehicleId:'truck'}),null);
 const moved={...station,id:'logistics-instance:moved',position:{x:200,y:10,z:-200}};
 assert.equal(nearestFactoryLogisticsStation({id:'copied'},moved.position,{stations:[moved]})?.id,moved.id);
 assert.equal(nearestFactoryLogisticsStation({id:'copied'},{...moved.position,y:18},{stations:[moved]}),null);
 assert.equal(nearestFactoryLogisticsStation({id:'copied'},moved.position,{stations:[{...moved,enabled:false}]}),null);
});

test('private roster helper excludes absent/general inventory and duplicate identities',()=>{
 const owned={id:'owned',name:'Own model',qualified:true};assert.deepEqual(ownLogisticsItems({items:[owned]}),[]);
 assert.deepEqual(ownLogisticsItems({eligibleItems:[owned,{...owned,name:'Duplicate'},null,{id:''}]}),[owned]);
});

test('next operation guidance follows exact-model qualification, certification, actual shipment phases and listed reservations',()=>{
 const owned={id:'model',name:'Model'},qualified={...owned,qualified:true},certified={...qualified,certificate:{id:'certificate',score:100}};
 assert.equal(factoryLogisticsNextStep(null,null).id,'production');assert.equal(factoryLogisticsNextStep(owned,null).id,'testing');assert.equal(factoryLogisticsNextStep(owned,null).mapId,PROVING_ID);assert.equal(factoryLogisticsNextStep(qualified,null).id,'certify');assert.equal(factoryLogisticsNextStep(certified,null).id,'book');
 assert.equal(factoryLogisticsNextStep({...certified,listing:{active:true}},null).id,'market');assert.equal(factoryLogisticsNextStep({...certified,reservation:{manifestId:'reserved'}},null).id,'reserved');
 const manifest={id:'m',itemName:'Own model',status:'booked',bookedAt:1000,minimumTransitMs:5000,destination:LOGISTICS_DESTINATIONS[0]};
 assert.match(factoryLogisticsNextStep(certified,manifest,2000).label,/4s/);assert.equal(factoryLogisticsNextStep(certified,manifest,6000).id,'deliver');
 const shipping={...manifest,destination:LOGISTICS_DESTINATIONS.find(value=>value.kind==='shipping')};assert.equal(factoryLogisticsNextStep(certified,shipping).id,'stage');assert.equal(factoryLogisticsNextStep(certified,{...shipping,status:'staged'}).id,'shipping');assert.equal(factoryLogisticsNextStep(certified,{...shipping,status:'in-transit'}).id,'shipping');assert.equal(factoryLogisticsNextStep(certified,{...shipping,status:'return-required'}).id,'return');
 for(const status of ['delivered','cancelled','returned','failed'])assert.equal(activeLogisticsManifest({...manifest,status}),false);assert.equal(activeLogisticsManifest(manifest),true);
});
