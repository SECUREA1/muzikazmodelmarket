import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectedWorldId,outsideDestination,outsideLabel,freshWorldUrl} from '../public/js/world-navigation.js';
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
test('fresh map launches select the exact room and automatically start gameplay',()=>{
 const current=new URL('https://example.test/game/model-explorer.html?environment=old-map&house=old-room&meet=old-meeting&useItem=one-time-item&returnMap=my-house&walkthrough=1#house-explorer-canvas');
 const next=freshWorldUrl(current,{id:'new map & room'});
 assert.equal(next.origin,current.origin);assert.equal(next.pathname,current.pathname);
 assert.equal(next.searchParams.get('environment'),'new map & room');
 assert.equal(next.searchParams.get('house'),'new map & room');
 assert.equal(next.searchParams.get('autoplay'),'1');
 assert.equal(next.searchParams.get('mode'),'multiplayer');
 assert.equal(next.searchParams.has('meet'),false);
 assert.equal(next.searchParams.has('useItem'),false);
 assert.equal(next.searchParams.get('returnMap'),'my-house');
 assert.equal(next.searchParams.get('walkthrough'),'1');
 assert.equal(next.hash,'');
 assert.equal(current.searchParams.get('environment'),'old-map','constructing a launch does not mutate the current URL');
});
test('fresh map launches preserve the selected play mode and only the requested meeting',()=>{
 const solo=freshWorldUrl('https://example.test/model-explorer.html?mode=solo&meet=old',{id:'next'},{meetingId:'meet-4-2'});
 assert.equal(solo.searchParams.get('mode'),'solo');
 assert.equal(solo.searchParams.get('meet'),'meet-4-2');
 const local=freshWorldUrl('https://example.test/model-explorer.html?mode=multiplayer',{id:'private-world',multiplayer:false});
 assert.equal(local.searchParams.get('mode'),'solo');
});
test('reopening the same map starts gameplay again without repeating item deployment or a meeting',()=>{
 const reopened=freshWorldUrl('https://example.test/model-explorer.html?environment=my-map&house=my-map&autoplay=0&useItem=owned-item&meet=old#house-explorer-canvas',{id:'my-map'});
 assert.equal(reopened.searchParams.get('environment'),'my-map');
 assert.equal(reopened.searchParams.get('house'),'my-map');
 assert.equal(reopened.searchParams.get('autoplay'),'1');
 assert.equal(reopened.searchParams.has('useItem'),false);
 assert.equal(reopened.searchParams.has('meet'),false);
 assert.equal(reopened.hash,'');
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
