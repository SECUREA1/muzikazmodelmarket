import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedNearbyAction,sharedNearbyActions} from '../public/js/gameplay-actions.js';
const player={id:'account:player',position:{x:0,y:0,z:0},health:100};
const actor=(id,x=1)=>({id,position:{x,y:0,z:0},active:true});
const definition=(objectId,behavior,extra={})=>({objectId,gameplay:{behavior,interactionDistance:4,...extra}});
test('touch prompts follow authoritative vehicle, seat, held item and defeat states',()=>{
 assert.equal(sharedNearbyAction({...player,vehicleId:'car'}).key,'f');assert.match(sharedNearbyAction({...player,vehicleId:'car'}).label,/Exit/);
 assert.match(sharedNearbyAction({...player,seatedId:'chair'}).label,/Stand up/);
 assert.equal(sharedNearbyAction({...player,heldId:'box'}).kind,'drop');assert.equal(sharedNearbyAction({...player,health:0}).kind,'respawn');
});
test('touch and keyboard resolve the same exact nearby NPC, door, mission and vehicle entities',()=>{
 const actors={npc:actor('npc'),car:actor('car',2),door:actor('door',3)};
 const manifest={actors:[definition('npc','quest',{urbanMission:{id:'courier'}}),definition('car','vehicle'),definition('door','door')]};
 const primary=sharedNearbyAction(player,actors,manifest);assert.equal(primary.entityId,'npc');assert.match(primary.label,/courier/);
 assert.equal(sharedNearbyAction(player,actors,manifest,'e').entityId,primary.entityId);assert.equal(sharedNearbyAction(player,actors,manifest,'f').entityId,'car');
 actors.npc.active=false;assert.equal(sharedNearbyAction(player,actors,manifest,'e').entityId,'door');
 actors.door.holderId='another-player';assert.equal(sharedNearbyAction(player,actors,manifest,'e').kind,'none');
});
test('unusable scenery and out-of-reach items never expose misleading action buttons',()=>{
 const actors={scenery:actor('scenery'),far:actor('far',20),portal:{...actor('portal',4),worldGateway:{name:'Echo Gardens'}}};
 const manifest={actors:[definition('scenery','decor'),definition('far','heal')]};
 assert.equal(sharedNearbyAction(player,actors,manifest).entityId,'portal');delete actors.portal;assert.equal(sharedNearbyAction(player,actors,manifest).kind,'none');
});
test('spawned items carry their own usable interaction definitions',()=>{
 const spawned={...actor('spawned'),definition:{gameplay:{behavior:'pickup',interactionDistance:3}}};
 assert.equal(sharedNearbyAction(player,{spawned}).entityId,'spawned');
});

test('nearby portal and arcade retain separate exact targets even when the portal is closer',()=>{
 const portal={...actor('portal',1),worldGateway:{name:'Return to Public Commons'}};
 const arcade={...actor('arcade',2),asset:{buildAssetId:'market-atm'},definition:{gameplay:{behavior:'interact',device:'commons-arcade',interactionDistance:4}}};
 const choices=sharedNearbyActions(player,{portal,arcade});assert.equal(choices.length,2);
 assert.equal(choices.find(action=>action.portal).entityId,'portal');
 const use=choices.find(action=>!action.portal);assert.equal(use.entityId,'arcade');assert.equal(use.title,'OPEN ARCADE');
 arcade.active=false;assert.equal(sharedNearbyActions(player,{portal,arcade}).filter(action=>!action.portal).length,0);
});

test('runtime residents route E and touch directly to conversation while working, without an authored manifest',()=>{
 const worker={...actor('working-guide',7),resident:{name:'Maya',moving:true,machineWork:{status:'active'}},definition:{gameplay:{behavior:'talk',interactionDistance:4}}};
 const actors={worker},before=structuredClone(worker);
 for(const key of [null,'e']){
  const target=sharedNearbyAction(player,actors,{},key);
  assert.equal(target.kind,'resident');assert.equal(target.resident,true);assert.equal(target.entityId,worker.id);assert.equal(target.key,'e');assert.match(target.label,/Maya/);
 }
 assert.equal(sharedNearbyActions(player,actors,{},'f').length,0);
 assert.deepEqual(worker,before,'offering conversation must not suspend or replace the current work');
 worker.position.y=3;assert.equal(sharedNearbyAction(player,actors).kind,'none');
 worker.position.y=0;worker.health=0;assert.equal(sharedNearbyAction(player,actors).kind,'none');
 worker.health=100;worker.position.x=11;assert.equal(sharedNearbyAction(player,actors).kind,'none');
});

test('nearby crew on a separate floor cannot expose an unusable Talk button',()=>{
 const crew={workers:[{id:'crew',name:'Crew',position:{x:0,y:2,z:0}}]};
 assert.equal(sharedNearbyActions(player,{}, {},null,crew).length,0);
 crew.workers[0].position.y=0;assert.equal(sharedNearbyActions(player,{}, {},null,crew)[0].kind,'resident');
 crew.workers[0].position.x=8;assert.equal(sharedNearbyActions(player,{}, {},'e',crew)[0].entityId,'crew');
 crew.workers[0].position.x=10.1;assert.equal(sharedNearbyActions(player,{}, {},null,crew).length,0);
});
