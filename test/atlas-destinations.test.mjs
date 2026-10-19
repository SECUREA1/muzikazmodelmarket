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
