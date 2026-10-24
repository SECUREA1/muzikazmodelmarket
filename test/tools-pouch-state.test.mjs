import test from 'node:test';
import assert from 'node:assert/strict';
import {toolsPouchState} from '../public/js/tools-pouch-state.js';

const pet = {id:'duck', name:'Bee Duck', type:'pets', modelUrl:'/pets/duck.glb'};
const avatar = {id:'avatar', name:'Scout', type:'avatars', modelUrl:'/avatars/scout.glb'};
const laser = {id:'laser', name:'Laser', type:'weapon', toolId:'laser'};
const cement = {id:'cement', name:'Cement', type:'material', materialId:'cement'};

test('hosted activity includes only this player’s live deployments and building pieces', () => {
  const state = toolsPouchState({records:[pet, cement], hosted:true, selfId:'alice', tool:'laser', actors:{
    own:{ownerId:'alice', spawned:true, active:true, asset:pet},
    second:{ownerId:'alice', spawned:true, asset:pet},
    other:{ownerId:'bob', spawned:true, active:true, asset:pet},
    removed:{ownerId:'alice', spawned:true, active:false, asset:pet},
    world:{ownerId:'alice', spawned:false, active:true, asset:pet}
  }, objects:{one:{ownerId:'alice', materialId:'cement'}, other:{ownerId:'bob', materialId:'cement'},
    deleted:{ownerId:'alice', materialId:'cement', deleted:true}}});
  assert.equal(state.items[0].deployedCount, 2);
  assert.equal(state.items[0].status, 'Deployed · 2');
  assert.equal(state.items[1].deployedCount, 1);
  const empty = toolsPouchState({records:[pet], hosted:true, selfId:'alice', actors:{other:{ownerId:'bob', spawned:true, asset:pet}}});
  assert.equal(empty.items[0].active, false);
});

test('local activity follows actual roots and disappears when a root is removed', () => {
  const root = {userData:{backpackAsset:pet}};
  assert.equal(toolsPouchState({records:[pet], localRoots:[root]}).items[0].deployedCount, 1);
  const after = toolsPouchState({records:[pet], localRoots:[], activeBackpackItems:new Set(['duck'])});
  assert.equal(after.items[0].active, false);
  assert.equal(after.items[0].status, 'Owned');
  assert.equal(after.active.some(item => item.id === pet.id), false);
});

test('selected avatar and tool are equipped while original action fields remain intact', () => {
  const state = toolsPouchState({records:[avatar, laser, cement], tool:'brick', materialId:'cement',
    equippedLabel:'Building Materials', playerAvatar:{modelUrl:'https://example.test/avatars/scout.glb'}, worldName:'Commons'});
  assert.equal(state.items[0].equipped, true);
  assert.equal(state.items[0].actionLabel, 'Use avatar');
  assert.equal(state.items[1].category, 'tools');
  assert.equal(state.items[1].type, 'weapon');
  assert.equal(state.items[1].actionLabel, 'Equip tool');
  assert.equal(state.items[2].equipped, true);
  assert.equal(state.items[2].actionLabel, 'Select bricks');
  assert.equal(state.equippedLabel, 'Building Materials · Cement');
  assert.equal(state.worldName, 'Commons');
  assert.equal(state.active.some(item => item.toolId === 'brick'), true);
  assert.equal(toolsPouchState({records:[laser], tool:'laser'}).items[0].equipped, true);
});

test('zero stock and use costs are retained and consumed supplies cannot be used', () => {
  const supply = {id:'snack', name:'Snack', type:'supplies', consumable:true, description:'Restores energy'};
  const state = toolsPouchState({records:[cement, supply], consumedIds:new Set(['snack']),
    economyItems:[{sku:'material:cement', materialId:'cement', stock:0, useCostMzk:0}]});
  assert.equal(state.items[0].stock, 0);
  assert.equal(state.items[0].useCostMzk, 0);
  assert.match(state.items[0].description, /0 prepaid pieces/);
  assert.match(state.items[0].description, /0 MZK \/ use/);
  assert.equal(state.items[1].disabled, true);
  assert.equal(state.items[1].status, 'Consumed');
  assert.equal(state.items[1].active, false);
  assert.equal(toolsPouchState({records:[supply]}).items[0].actionLabel, 'Consume');
});

test('current avatar and deployment can be shown before owned inventory has refreshed', () => {
  const state = toolsPouchState({records:[], playerAvatar:avatar, localRoots:[{userData:{avatar:pet}}, {userData:{avatar:pet}}]});
  assert.equal(state.items.length, 0);
  assert.equal(state.active.find(item => item.id === 'avatar').equipped, true);
  assert.equal(state.active.find(item => item.id === 'duck').deployedCount, 2);
  assert.equal(state.active.filter(item => item.id === 'duck').length, 1);
});

test('local brick roots are counted once and hosted state ignores old local objects', () => {
  const root = {userData:{materialId:'cement'}};
  assert.equal(toolsPouchState({records:[cement], localRoots:[root], localBricks:[root]}).items[0].deployedCount, 1);
  assert.equal(toolsPouchState({records:[cement], localRoots:[root], hosted:true, selfId:'alice'}).items[0].deployedCount, 0);
});
