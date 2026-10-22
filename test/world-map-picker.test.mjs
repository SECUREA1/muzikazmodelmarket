import test from 'node:test';
import assert from 'node:assert/strict';
import {filterWorlds, filterWorldCategory, sortWorlds} from '../public/js/world-map-picker.js';
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

test('main activity spaces stay on the first page ahead of busy scenery maps',()=>{
 const ids=['forest','neon-docks','muzikaz-airport','hockey-arena','basketball-arena','firing-range','muzikaz-main','neon-junction','force-training-range'];
 const worlds=ids.map(id=>({env:{id},count:id==='forest'?100:0}));
 assert.deepEqual(sortWorlds(worlds).slice(0,6).map(({env})=>env.id),['neon-docks','muzikaz-airport','muzikaz-main','firing-range','basketball-arena','hockey-arena']);
 assert.equal(worlds[0].env.id,'forest','sorting does not mutate registry records');
 assert.equal(filterWorldCategory(worlds,'range')[0].env.id,'firing-range');
});

test('generated harbour appears with the featured docks',()=>{const harbour={env:{id:'public-docks-map',builderScene:{layoutMeta:{harbor:{}}}},count:0};assert.equal(sortWorlds([{env:{id:'forest'},count:100},harbour])[0],harbour);assert.equal(filterWorldCategory([harbour],'harbor').length,1);});
