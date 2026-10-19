import test from 'node:test';
import assert from 'node:assert/strict';
import {filterWorlds,orderMapWorlds,FEATURED_WORLD_IDS} from '../public/js/world-map-picker.js';
test('world map filtering keeps full registry results and matches all search terms',()=>{
 const worlds=[{env:{id:'neon',name:'Neon Docks',category:'City',description:'Social multiplayer space'},count:2},{env:{id:'forest',name:'Echo Gardens',category:'Nature'},count:0}];
 assert.equal(filterWorlds(worlds,'').length,2);
 assert.equal(filterWorlds(worlds,'CITY neon')[0].env.id,'neon');
 assert.equal(filterWorlds(worlds,'neon nature').length,0);
 assert.equal(filterWorlds([], 'anything').length,0);
});

test('featured games and house stay on page one ahead of busy community maps',()=>{
 const worlds=[{env:{id:'community'},count:999},...FEATURED_WORLD_IDS.slice().reverse().map(id=>({env:{id},count:0}))];
 assert.deepEqual(orderMapWorlds(worlds).slice(0,5).map(item=>item.env.id),FEATURED_WORLD_IDS);
 assert.equal(worlds[0].env.id,'community');
});
