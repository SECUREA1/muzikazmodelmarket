import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const builder=readFileSync(new URL('../environment-builder.js',import.meta.url),'utf8');
const game=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
test('repository choices open actual map destinations and preserve the editable scene',()=>{
 const preview=builder.slice(builder.indexOf('function showRepositoryMap'),builder.indexOf('function syncSceneChoices'));
 assert.ok(preview.includes("url.searchParams.set('environment',meta.environmentId)"));
 assert.ok(preview.includes("$('#repository-map-frame').src=url.href"));
 assert.ok(!preview.includes('sceneData.layout='));
 assert.ok(builder.includes('!repositoryIds.has(map.id)'));
 assert.ok(builder.includes('syncSceneChoices();renderAtlas()'));
 assert.ok(builder.includes("$('#repository-map-frame').removeAttribute('src')"));
});
test('visible key prompt is a touch button using the same gameplay action',()=>{
 assert.ok(game.includes("builderPrompt=document.createElement('button')"));
 assert.ok(game.includes("builderPrompt.addEventListener('click',activateNearbyAction)"));
 assert.ok(game.includes("builderActionButton.addEventListener('click',activateNearbyAction)"));
});
