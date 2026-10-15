import test from 'node:test';
import assert from 'node:assert/strict';
import {filterWorlds} from '../public/js/world-map-picker.js';
test('world map filtering keeps full registry results and matches all search terms',()=>{
 const worlds=[{env:{id:'neon',name:'Neon Docks',category:'City',description:'Social multiplayer space'},count:2},{env:{id:'forest',name:'Echo Gardens',category:'Nature'},count:0}];
 assert.equal(filterWorlds(worlds,'').length,2);
 assert.equal(filterWorlds(worlds,'CITY neon')[0].env.id,'neon');
 assert.equal(filterWorlds(worlds,'neon nature').length,0);
 assert.equal(filterWorlds([], 'anything').length,0);
});
