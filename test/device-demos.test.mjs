import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {INTERACTIVE_DEVICES} from '../public/js/interactive-devices.js';
import {createDeviceDemo} from '../public/js/device-demos.js';
import {newArcadeGame,arcadeMove} from '../server-arcade-games.mjs';
import {previewDescriptor} from '../public/js/market-item-preview.js';
import {arcadePresentation} from '../public/js/arcade-games.js';
const rng=max=>Math.floor(max/2);
test('every machine has original artwork and a built-in local demo',async()=>{
 for(const [id,profile]of Object.entries(INTERACTIVE_DEVICES)){
  const demo=createDeviceDemo(profile,rng);assert.ok(demo.view().text.length,id);assert.ok(Array.isArray(demo.view().buttons),id);
  const svg=await readFile(new URL('../public/images/interactive-devices/'+id+'.svg',import.meta.url),'utf8');assert.ok(svg.includes('retro pin-up poster'),id);assert.ok(svg.includes('ORIGINAL SERIES'),id);
  demo.reset();assert.ok(demo.view().text);
 }
});
test('all twelve local arcade demos use exactly the authoritative move rules',()=>{
 const actions={blackjack:['stand'],highlow:['higher'],memory:['cell',0],tictactoe:['cell',0],connect4:['column',0],mines:['cell',0],lights:['cell',0],rps:['rock'],snake:['down'],pong:['step'],breakout:['step'],maze:['right']};
 for(const profile of Object.values(INTERACTIVE_DEVICES).filter(item=>item.game)){
  const [operation,index]=actions[profile.game],demo=createDeviceDemo(profile,rng);
  const expected=arcadePresentation(arcadeMove(newArcadeGame(profile.game,rng),{operation,index},rng));
  assert.deepEqual(demo.move(operation,index).text,expected.text,profile.game);
 }
});
test('poker demo supports deal, hold and draw; slots and trivia stay local',()=>{
 const profile=INTERACTIVE_DEVICES['video-poker-table'],demo=createDeviceDemo(profile,rng);
 demo.move('deal');assert.equal(demo.view().buttons.length,6);demo.move('hold',0);assert.ok(demo.view().text.includes('[held]'));demo.move('draw');assert.equal(demo.view().buttons[0][1],'deal');
 const snapshot=JSON.stringify(INTERACTIVE_DEVICES);createDeviceDemo(INTERACTIVE_DEVICES['arcade-slot-machine'],rng).move('spin');createDeviceDemo(INTERACTIVE_DEVICES['trivia-terminal'],rng).move('answer',0);assert.equal(JSON.stringify(INTERACTIVE_DEVICES),snapshot);
});

test('custom machine listings preserve the configured interactive demo identity',()=>{assert.equal(previewDescriptor({name:'Custom poker cabinet',function_data:{device:'video-poker-table'}}).deviceId,'video-poker-table');});
