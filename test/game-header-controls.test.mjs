import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GAME_HEADER_CONTROLS,GAME_HEADER_SELECTORS,gameHeaderControlFor} from '../public/js/game-header-controls.js';

test('header inventory provides unique stable identities, selectors and readable labels',()=>{
 assert.equal(new Set(GAME_HEADER_CONTROLS.map(control=>control.id)).size,GAME_HEADER_CONTROLS.length);
 assert.equal(new Set(GAME_HEADER_CONTROLS.map(control=>control.selector)).size,GAME_HEADER_CONTROLS.length);
 assert.ok(Object.isFrozen(GAME_HEADER_CONTROLS));
 for(const control of GAME_HEADER_CONTROLS){
  assert.ok(Object.isFrozen(control));assert.match(control.id,/^[a-z]+(?:-[a-z]+)*$/);assert.ok(control.selector.length>1);assert.ok(control.label.trim().length>3);assert.ok(control.category);assert.ok(['stage','dock','nested','site'].includes(control.source));
 }
});
test('all secondary stage toolbar groups and formerly floating launchers have inventory entries',async()=>{
 const source=await readFile(new URL('../public/js/game-display-flow.js',import.meta.url),'utf8');
 // Protect the current navigation groups even while their layout policy changes.
 const expected=['game-camera-toggle','broadcast-controls','game-viewport-toggle','xr-enter-button','game-flashlight-toggle','live-local-map','district-map-toggle','map-quest-launcher','world-resident-ui','transport-activity','sports-action-utilities','airport-ops-toggle','harbor-ops-toggle','ski-resort-toggle','forge-toggle','forest-toggle','fitness-toggle','fishing-toggle','shipping-toggle','factory-toggle','prison-toggle','factory-testing-toggle','factory-logistics-toggle','funhouse-audio-toggle','doomsday-menu','building-adjust-button','range-ops-button','owned-placement-edit','shared-media-enable','island-native-status'];
 const selectors=GAME_HEADER_SELECTORS.split(',');for(const name of expected)assert.ok(selectors.includes('.'+name),'missing secondary control '+name);
 assert.ok(source.includes('game-view-overflow'),'the inventory targets the actual header dropdown');
 assert.equal(GAME_HEADER_CONTROLS.find(control=>control.id==='emergency-response').label,'Emergency response flow');
});
test('primary play controls and movement sticks cannot be selected by the menu inventory',()=>{
 const selectors=GAME_HEADER_CONTROLS.map(control=>control.selector);
 for(const primary of ['.rad-tox-fire-trigger','.nearby-gameplay-actions','.airport-flight-controls','.road-vehicle-controls','.harbor-helm-controls','.construction-controls','.mobile-move-pad','.thumbstick-base'])assert.ok(!selectors.includes(primary),'primary input must remain under its original gameplay owner: '+primary);
 assert.equal(GAME_HEADER_CONTROLS.find(control=>control.id==='dock-actions').source,'dock');
 assert.equal(GAME_HEADER_CONTROLS.find(control=>control.id==='flight-instruments').source,'nested');
 assert.equal(GAME_HEADER_CONTROLS.find(control=>control.id==='site-settings').source,'site');
 assert.ok(!GAME_HEADER_SELECTORS.includes('Flight instruments'),'nested controls are not extracted from their panels');
});
test('lookup finds the existing component without manufacturing an action or selecting an unknown one',()=>{
 const existing={matches:selector=>selector==='.doomsday-menu'};
 assert.equal(gameHeaderControlFor(existing).id,'emergency-response');
 assert.equal(gameHeaderControlFor({matches:()=>false}),null);assert.equal(gameHeaderControlFor(null),null);
});
