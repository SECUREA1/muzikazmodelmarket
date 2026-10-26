import test from 'node:test';
import assert from 'node:assert/strict';
import {RESIDENT_FORMS,residentIdentity,residentPersonality} from '../public/js/resident-personalities.js';

test('residents have reproducible individual names, ambitions, habits and forms across map edits',()=>{
 const map={id:'shared-garden',name:'Community garden'},place={id:'arrival',name:'Main gate'};
 const identities=Array.from({length:128},(_,index)=>residentIdentity(map,place,'world-resident-'+index));
 assert.ok(new Set(identities.map(identity=>identity.name)).size>110,'the population uses more than a small repeating list of names');
 assert.deepEqual(new Set(identities.map(identity=>identity.form)),new Set(RESIDENT_FORMS));
 assert.ok(new Set(identities.map(identity=>identity.ambition)).size>=5);
 assert.ok(new Set(identities.map(identity=>identity.quirk)).size>=5);
 for(let index=0;index<identities.length;index++){
  const identity=identities[index];assert.match(identity.name,/^\S+ \S+$/);
  assert.deepEqual(identity,residentIdentity({...map,name:'Renamed airport'}, {id:'renamed',name:'New hangar'},'world-resident-'+index));
  assert.deepEqual(identity,residentIdentity(structuredClone(map),structuredClone(place),'world-resident-'+index));
 }
 assert.equal(residentIdentity(map,place,'world-resident-0','Saved Player Name').name,'Saved Player Name');
 assert.notDeepEqual(identities[0],residentIdentity({id:'another-map'},place,'world-resident-0'));
});

test('personality exposes coherent individuality while jobs adapt to local activities',()=>{
 const place={id:'arrival',name:'Public area'},id='world-resident-0';
 const garden=residentPersonality({id:'editable-map',name:'Community garden'},place,id);
 const airport=residentPersonality({id:'editable-map',name:'Airport',airport:{enabled:true}},place,id,garden.name);
 assert.deepEqual(garden.identity,airport.identity);
 assert.equal(garden.appearance.form,garden.identity.form);
 assert.equal(garden.preferences.ambition,garden.identity.ambition);
 assert.equal(garden.preferences.quirk,garden.identity.quirk);
 assert.equal(garden.preferences.socialStyle,garden.identity.socialStyle);
 assert.ok(garden.backstory.includes(garden.identity.ambition));
 assert.equal(airport.uniform,'aviation');assert.notEqual(garden.role,airport.role);
});
