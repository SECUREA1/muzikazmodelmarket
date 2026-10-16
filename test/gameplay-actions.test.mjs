import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedNearbyAction} from '../public/js/gameplay-actions.js';
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
