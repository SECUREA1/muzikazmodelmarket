import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectedWorldId,outsideDestination,outsideLabel} from '../public/js/world-navigation.js';
const worlds=[{id:'muzikaz-main'},{id:'public-commons'},{id:'my-builder-map',aliases:['my-design']}],registry={all:()=>worlds,find:id=>worlds.find(world=>world.id===id||world.aliases?.includes(id))};
test('explicit designs never resolve to a generic map, including missing selections',()=>{
 assert.equal(selectedWorldId(registry,new URLSearchParams('environment=my-builder-map')),'my-builder-map');
 assert.equal(selectedWorldId(registry,new URLSearchParams('house=my-design')),'my-builder-map');
 assert.equal(selectedWorldId(registry,new URLSearchParams('environment=temporarily-unavailable')),'temporarily-unavailable');
 assert.equal(selectedWorldId(registry,new URLSearchParams()),'muzikaz-main');
});
test('outside is an explicit trip to public commons with a return to the selected design',()=>{
 assert.equal(outsideDestination('my-builder-map',null),'public-commons');
 assert.equal(outsideDestination('public-commons','my-builder-map'),'my-builder-map');
 assert.match(outsideLabel('my-builder-map'),/Outside.*Public map/);
 assert.equal(outsideLabel('public-commons','my-builder-map'),'Return to your map');
});
test('map failures and completed builder levels never substitute a generic world',async()=>{
 const game=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 assert.doesNotMatch(game,/const env = registry.find\(id\) \|\| registry.all\(\)\[0\]/);
 assert.doesNotMatch(game,/opening the main floor fallback|const fallbackEnv/);
 const loading=game.slice(game.indexOf('  async function loadById('),game.indexOf('\n\n  let cachedAvatars'));
 assert.match(loading,/const env = registry\.find\(id\)\|\|await registry\.resolve\(id\)/);
 assert.ok(loading.indexOf('if (!env) throw')<loading.indexOf('envLoader.unload()'), 'a missing destination is rejected before removing the current world');
 assert.match(loading,/envLoader\.unload\(\);clearBuilderDecor\(\)/, 'a confirmed destination clears the old scene and placed objects');
 assert.match(loading,/await envLoader\.load\(env\)/, 'the selected destination is the world that loads');
 assert.ok(loading.indexOf('multiplayerWorldLoading=true')<loading.indexOf('envLoader.unload()'));
 assert.match(game,/activeEnvironment\?\.memberPlot\|\|activeEnvironment\?\.builderScene/);
});
