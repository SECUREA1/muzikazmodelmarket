import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const builder=readFileSync(new URL('../environment-builder.js',import.meta.url),'utf8');
const game=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
test('repository choices load editable geometry and persist the authored base',()=>{
 const load=builder.slice(builder.indexOf('async function showRepositoryMap'),builder.indexOf('function syncSceneChoices'));
 assert.ok(load.includes('await loadBuilderGlb(url)'));
 assert.ok(load.includes('sceneData.baseEnvironment=cloneData(base)'));
 assert.ok(load.includes('world.add(root)'));
 assert.ok(load.includes('generation!==baseLoadGeneration'));
 assert.ok(builder.includes('!repositoryIds.has(map.id)'));
 assert.ok(!builder.includes('repository-map-frame'));
});
test('visible nearby action is a touch button using the shared gesture handler',()=>{
 assert.ok(game.includes("builderActionButton=document.createElement('button')"));
 assert.ok(game.includes('builderPrompt.hidden=true;builderActionButton.hidden=hidden'));
 assert.ok(game.includes("bindGameActionButton(builderActionButton,activateNearbyAction)"));
});
