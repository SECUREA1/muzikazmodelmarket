import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {worldGuideIntroduction} from '../public/js/world-guide.js';

const maps=JSON.parse(readFileSync(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
test('all repository maps receive a bounded arrival guide naming their destination',()=>{
 for(const world of maps){
  const guide=worldGuideIntroduction(world);
  assert.ok(guide.startsWith('Welcome to '+world.name+'. '),world.id);
  assert.ok(guide.length<750,world.id+': guide stays short enough for an arrival');
  assert.doesNotMatch(guide,/undefined|\[object Object\]|NaN/);
 }
});

const activities=[
 ['airport','Tower radio'],['casino','hosts'],['fitness','training station'],
 ['factory-proving','testing controls'],['mountain-compound','containment power puzzle'],
 ['missile-factory','factory stations'],['construction','construction controls'],
 ['shipping','Load evenly'],['fishing','cast and reel'],['ski','lifts and runs'],
 ['basketball','court controls'],['hockey','match controls'],['arcade','arcade machine'],
 ['tropical-island','beaches'],['funhouse','attraction'],['firing-range','firing lane'],
 ['prison','prison areas']
];
test('specialist guides explain the destination activity and a next action',()=>{
 for(const [game,instruction]of activities){
  assert.ok(worldGuideIntroduction({id:game,name:'Destination',game}).includes(instruction),game);
 }
 assert.match(worldGuideIntroduction({name:'Harbor',builderScene:{layoutMeta:{harbor:{}}}}),/free boat/);
});

test('native maps receive their own controls without explorer-only menus',()=>{
 for(const game of ['hockey','arcade']){
  const guide=worldGuideIntroduction({name:game,game});
  assert.match(guide,/game controls/);assert.doesNotMatch(guide,/World radio|Crew Dispatch|Quests/);
 }
});

test('solo practice guides avoid offering remote player calls, including sparse custom maps',()=>{
 const guide=worldGuideIntroduction({id:'custom-map',name:'My space'},{solo:true});
 assert.match(guide,/Welcome to My space/);assert.match(guide,/local practice objectives/);
 assert.doesNotMatch(guide,/World radio|join a team|players calling/);
 assert.match(worldGuideIntroduction(),/Welcome to this world/);
});

test('the shared resort guide offers native AI quests and world radio',()=>{
 const guide=worldGuideIntroduction({id:'tropical-island',name:'Palm Coast',game:'tropical-island'});
 assert.match(guide,/standard world controls/);assert.match(guide,/AI residents/);assert.match(guide,/Quests/);assert.match(guide,/World radio/);assert.match(guide,/two-minute buzz/);
});
