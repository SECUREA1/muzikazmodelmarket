import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationIcon, destinationMatches} from '../public/js/atlas-destinations.js';

test('atlas distinguishes live sports, deeds and published worlds', () => {
  assert.equal(destinationIcon({mapId:'hockey-arena'}), '🏒');
  assert.equal(destinationIcon({mapId:'custom-court', basketball:{enabled:true}}), '🏀');
  assert.equal(destinationIcon({mapId:'home', memberPlot:true}), '⚑');
  assert.equal(destinationIcon({mapId:'custom-world'}), '🏠');
});
test('destinations are searchable by address, owner and category', () => {
  const place={mapId:'court-1',name:'My Court',ownerName:'Alex',category:'Basketball',column:2,row:-1};
  for(const query of ['court-1','alex','basketball','512, -256']) assert.equal(destinationMatches(place,query),true);
  assert.equal(destinationMatches(place,'unknown'),false);
});


test('the shared Strait destination has a shipping marker and supply search without changing its room id',async()=>{
 const {destinationColor,destinationTheme}=await import('../public/js/atlas-destinations.js');
 const place={mapId:'hormuz-shipping',name:'Strait of Hormuz',roomId:'hormuz-shipping'};
 assert.equal(destinationIcon(place),'🚢');assert.equal(destinationTheme(place),'shipping');
 assert.equal(destinationColor(place),'#218ba5');assert.equal(destinationMatches(place,'supply'),true);
 assert.equal(destinationIcon({...place,memberPlot:true}),'⚑');assert.equal(place.roomId,'hormuz-shipping');
});
