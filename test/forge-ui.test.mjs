import test from 'node:test';
import assert from 'node:assert/strict';
import {forgeJobView} from '../public/js/forge-ui.js';
import {isForgeEnvironment} from '../public/js/forge-config.js';
import {FORGE_RECIPES} from '../public/js/forge-recipes.js';

test('forge display waits for the server after a heating timer expires',()=>{
 const recipe=FORGE_RECIPES[0],job={stage:'heat',status:'processing',readyAt:14000,strikes:0,requiredStrikes:recipe.hammerStrikes},original=structuredClone(job);
 const half=forgeJobView(job,recipe,12000);assert.equal(half.remaining,2);assert.equal(half.progress,.5);
 const expired=forgeJobView(job,recipe,15000);assert.equal(expired.remaining,0);assert.equal(expired.progress,1);assert.equal(expired.stage,'heat');assert.equal(expired.status,'processing');assert.equal(expired.completed,0);
 assert.deepEqual(job,original,'rendering an expired clock cannot advance the authoritative job');
});

test('forge display preserves strike counts and completed work across reconnects',()=>{
 const recipe=FORGE_RECIPES[0],view=forgeJobView({stage:'hammer',status:'awaiting',strikes:3,requiredStrikes:6},recipe,20000);
 assert.equal(view.progress,.5);assert.equal(view.strikes,3);assert.equal(view.required,6);assert.equal(view.completed,1);
 const complete=forgeJobView({stage:'finish',status:'collected'},recipe,20000);assert.equal(complete.completed,5);assert.equal(complete.progress,1);assert.equal(complete.status,'collected');
 assert.equal(forgeJobView(null,recipe,20000).status,'idle');
});

test('forge discovery tolerates an empty environment while the explorer initializes and changes maps',()=>{
 assert.equal(isForgeEnvironment(null),false);assert.equal(isForgeEnvironment(undefined),false);assert.equal(isForgeEnvironment({id:'traditional-forge'}),true);
});
