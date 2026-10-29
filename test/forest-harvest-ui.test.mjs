import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestForestTree,forestStockRows,forestChallengeProgress} from '../public/js/forest-harvest-ui.js';
import {FOREST_CHALLENGES} from '../public/js/forest-harvest-config.js';

test('forest tree selection compares elevation and never mutates shared tree order',()=>{
 const trees=[{id:'high',position:{x:0,y:8,z:0}},{id:'near',position:{x:3,y:0,z:0}},{id:'far',position:{x:5,y:0,z:0}}];
 assert.equal(nearestForestTree(trees,{x:0,y:0,z:0}).id,'near');
 assert.deepEqual(trees.map(tree=>tree.id),['high','near','far']);
 assert.equal(nearestForestTree(Object.fromEntries(trees.map(tree=>[tree.id,tree])),{x:0,y:7,z:0}).id,'high');
 assert.equal(nearestForestTree([],{x:0,y:0,z:0}),null);
});

test('lumber display preserves source species, products and drying state',()=>{
 const rows=forestStockRows({green:{'pine:plank':8,'oak:plank':4,'pine:beam':0},dry:{'pine:plank':2,'oak:panel':6}});
 assert.equal(rows.length,4);
 assert.deepEqual(rows.filter(row=>row.speciesId==='pine').map(({stage,quantity})=>({stage,quantity})),[{stage:'dry',quantity:2},{stage:'green',quantity:8}]);
 assert.equal(rows.find(row=>row.key==='oak:panel').name,'Oak Wood Panels');
 assert.equal(rows.find(row=>row.key==='pine:beam'),undefined);
});

test('challenge controls use verified progress independently from earned badges',()=>{
 const challenge=FOREST_CHALLENGES.find(item=>item.id==='first-harvest');
 assert.deepEqual(forestChallengeProgress(challenge,{progress:{harvested:2}}),{value:2,target:3,ratio:2/3,complete:false,claimed:false});
 const earned=forestChallengeProgress(challenge,{progress:{harvested:4},badges:['first-harvest']});
 assert.equal(earned.complete,true);assert.equal(earned.claimed,true);assert.equal(earned.ratio,1);
 assert.equal(forestChallengeProgress(challenge,{progress:{harvested:0},badges:['first-harvest']}).complete,false);
});
