import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {worldTravelObjects} from '../server-world-travel.mjs';

test('all bundled playable worlds have distinct floor-backed exits to their district and Commons',async()=>{
 const maps=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8')).filter(map=>map.playable!==false&&map.visibility!=='private'),collision=new ServerBuilderCollision();
 for(const map of maps){
  const exits=worldTravelObjects({...map,travelPortals:[{mapId:'district',name:'District'},{mapId:'public-commons',name:'Commons'}]},collision);
  assert.equal(exits.length,2);for(const exit of exits)assert.ok(Object.values(exit.position).every(Number.isFinite),map.id+' has valid floor coordinates');
  assert.ok(Math.hypot(exits[0].position.x-exits[1].position.x,exits[0].position.z-exits[1].position.z)>=2.2,map.id+' keeps both exits separately usable');
 }
});
