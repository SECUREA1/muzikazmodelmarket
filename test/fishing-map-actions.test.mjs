import test from 'node:test';
import assert from 'node:assert/strict';
import {neonMarina} from '../neon-marina.mjs';
import {fishingMapAction} from '../public/js/fishing-map-actions.js';

const marina=neonMarina(),environment={id:'neon-docks',builderScene:{objects:marina.objects,layoutMeta:{harbor:marina.harbor,locations:marina.locations}}};
const boats=marina.objects.filter(actor=>actor.modelId==='harbor-fishing-boat');
function fixture(){return {players:{self:{position:{x:124,y:0,z:30},health:100}},actors:Object.fromEntries(boats.map(actor=>[actor.id,structuredClone(actor)]))};}

test('selecting different offshore grounds keeps the exact ID and offers a real boat journey',()=>{
 const live=fixture();
 for(const zoneId of ['marina-fishing','beacon-reef','palm-shoals']){
  const action=fishingMapAction(environment,live,'self',zoneId);
  assert.equal(action.zoneId,zoneId);assert.equal(action.kind,'board-route');assert.equal(action.enabled,true);assert.equal(action.entityId,boats[0].id);assert.match(action.label,/Sail & fish at/);
 }
 assert.equal(fishingMapAction(environment,live,'self','not-a-zone'),null);
});
test('freshwater destinations board their own lake boat rather than the sea or other lake',()=>{
 const live=fixture();
 for(const [zoneId,x]of [['crescent-lake-fishing',-390],['silver-lake-fishing',430]]){
  const action=fishingMapAction(environment,live,'self',zoneId),boat=live.actors[action.entityId];
  assert.ok(Math.abs(boat.position.x-x)<60);assert.equal(action.zoneId,zoneId);assert.equal(action.enabled,true);
 }
});
test('ready fishing is a distinct action and never replaces selected-destination routing',()=>{
 const live=fixture();live.players.self.vehicleId=boats[0].id;live.actors[boats[0].id].holderId='self';
 live.players.self.fishing={availability:{sides:{port:{canCast:true,zoneId:'marina-fishing'},starboard:{canCast:false}}}};
 const ready=fishingMapAction(environment,live,'self','marina-fishing');assert.equal(ready.kind,'route');assert.equal(ready.fishHere.side,'port');assert.match(ready.label,/Sail & fish at/);
 const far=fishingMapAction(environment,live,'self','beacon-reef');assert.equal(far.zoneId,'beacon-reef');assert.equal(far.fishHere,null);assert.equal(far.entityId,boats[0].id);
});
test('occupied and destroyed fishing boats cannot be silently boarded',()=>{
 const live=fixture();live.actors[boats[0].id].holderId='other';
 const occupied=fishingMapAction(environment,live,'self','beacon-reef');assert.equal(occupied.enabled,false);assert.equal(occupied.entityId,undefined);assert.match(occupied.reason,/occupied or unavailable/);
 live.actors[boats[0].id].holderId=null;live.actors[boats[0].id].active=false;
 assert.equal(fishingMapAction(environment,live,'self','beacon-reef').enabled,false);
});
