import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {RANGED_WEAPONS} from '../public/js/game-weapons.js';
import {UTILITY_TOOLS} from '../public/js/game-utilities.js';
import {FISHING_GEAR} from '../public/js/fishing-config.js';
import {TOOL_PREVIEW_IDS,toolPreviewArt} from '../public/js/tool-preview-art.js';
import {marketItemPreview} from '../public/js/market-item-preview.js';

test('every equipment item has a distinct, labeled tool illustration',()=>{
 const tools=GAME_ECONOMY.filter(item=>item.kind==='tool');
 assert.equal(tools.length,24+FISHING_GEAR.length);
 assert.deepEqual([...TOOL_PREVIEW_IDS].sort(),tools.map(item=>item.toolId).sort());
 const silhouettes=new Set();
 for(const item of tools){
  const art=toolPreviewArt(item.toolId,{name:item.name});
  assert.match(art,/role="img"/);assert.ok(art.includes(item.name+' tool illustration'));
  assert.ok(art.includes('data-tool-illustration="'+item.toolId+'"'));
  silhouettes.add(art.slice(art.indexOf('>')+1));
  assert.match(marketItemPreview(item,{preferModel:true}),item.buildAssetId?/Loading item preview/:/Tool illustration · /);
  const profile=RANGED_WEAPONS[item.toolId]||UTILITY_TOOLS[item.toolId];
  if(profile)assert.ok(art.includes('#'+profile.color.toString(16).padStart(6,'0')));
 }
 assert.equal(silhouettes.size,tools.length);
});
test('tool artwork escapes untrusted labels and refuses unknown equipment',()=>{
 assert.equal(toolPreviewArt('unknown-tool'),'');
 const art=toolPreviewArt('laser',{name:'<script>alert(1)</script>',color:'red;display:none'});
 assert.doesNotMatch(art,/<script>|display:none/);assert.match(art,/&lt;script&gt;/);
});
