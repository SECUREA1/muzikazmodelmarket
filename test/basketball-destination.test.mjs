import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isBasketballEnvironment} from '../public/js/basketball-rules.js';
const maps=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));
test('the world map lists native basketball, one hockey arena, the park and the firing range',()=>{
 const basketball=maps.filter(map=>isBasketballEnvironment(map));assert.equal(basketball.length,1);
 assert.equal(basketball[0].id,'basketball-arena');assert.equal(basketball[0].builderScene.layout,'basketball-stadium');
 assert.match(basketball[0].playUrl,/model-explorer.html/);assert.equal(basketball[0].multiplayer,true);
 assert.equal(maps.filter(map=>map.id==='hockey-arena').length,1);
 for(const id of ['neon-junction','firing-range'])assert.ok(maps.find(map=>map.id===id),id);
 for(const id of ['basketball','shooting','air-hockey','billiards'])assert.ok(!maps.find(map=>map.id===id),id+' stays inside the arcade');
});
