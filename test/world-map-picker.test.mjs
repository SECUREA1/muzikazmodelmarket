import test from 'node:test';
import assert from 'node:assert/strict';
import {filterWorlds, filterWorldCategory} from '../public/js/world-map-picker.js';
test('world map filtering keeps full registry results and matches all search terms',()=>{
 const worlds=[{env:{id:'neon',name:'Neon Docks',category:'City',description:'Social multiplayer space'},count:2},{env:{id:'forest',name:'Echo Gardens',category:'Nature'},count:0}];
 assert.equal(filterWorlds(worlds,'').length,2);
 assert.equal(filterWorlds(worlds,'CITY neon')[0].env.id,'neon');
 assert.equal(filterWorlds(worlds,'neon nature').length,0);
 assert.equal(filterWorlds([], 'anything').length,0);
});


test('game filters and sport search include authored courts and arenas',()=>{
 const worlds=[
  {env:{id:'custom-court',name:'Rooftop',basketballCourt:true},count:0},
  {env:{id:'custom-stadium',name:'Championship Hall',builderScene:{layout:'basketball-stadium'}},count:2},
  {env:{id:'custom-rink',name:'Winter Palace',builderScene:{layout:'hockey-arena'}},count:4},
  {env:{id:'park',name:'Meeting Gardens',category:'Nature'},count:3}
 ];
 assert.deepEqual(filterWorldCategory(worlds,'basketball').map(({env})=>env.id),['custom-court','custom-stadium']);
 assert.deepEqual(filterWorldCategory(worlds,'hockey').map(({env})=>env.id),['custom-rink']);
 assert.equal(filterWorlds(worlds,'hockey')[0].env.id,'custom-rink');
 assert.equal(filterWorlds(worlds,'basketball').length,2);
 assert.equal(filterWorldCategory(worlds,'games').length,3);
 assert.equal(filterWorldCategory(worlds,'live').length,3);
 assert.equal(filterWorldCategory(worlds,'world')[0].env.id,'park');
 assert.equal(filterWorldCategory(worlds).length,4);
 assert.deepEqual(filterWorldCategory(worlds,'live').map(({env})=>env.id),['custom-stadium','custom-rink','park']);
});
