import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {absoluteUrl} from '../public/js/model-api.js';

test('every Backpack category has a safe, animated gameplay action', async () => {
  const game = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  for (const category of ['avatars','lands','props','wearables','pets','vehicles']) assert.match(game, new RegExp(`['\"]${category}['\"]`));
  assert.match(game, /rememberActiveBackpackItem\(asset\)/);
  assert.match(game, /asset\.type==='wearables'/);
  assert.match(game, /root\.userData\.gameMixer/);
  assert.match(game, /finally\{if\(button\.isConnected\)/);
  const start=game.indexOf('  function normalizeAvatarRecord('),end=game.indexOf('  function isActiveGlbAvatar(',start);
  assert.ok(start>=0&&end>start,'exercise the actual Backpack record normalizer');
  const normalize=vm.runInNewContext(game.slice(start,end)+'\nnormalizeAvatarRecord;', {absoluteUrl});
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:{location:new URL('https://frontend.test/model-explorer.html'),MUZIKAZ_API:{base:'https://api.test'}}});
  try{
    for(const [id,type,source,expected] of [
      ['bundled','avatars',{model_url:'/public/models/avatars/DAX.glb'},'https://frontend.test/public/models/avatars/DAX.glb'],
      ['uploaded','wearables',{assetUrl:'/uploads/models/hat.glb?revision=3'},'https://api.test/uploads/models/hat.glb?revision=3'],
      ['external','pets',{fileUrl:'https://creator.test/pet.glb?revision=2'},'https://creator.test/pet.glb?revision=2'],
      ['empty','props',{modelUrl:''},'']
    ]){
      const raw={id,type,name:'Backpack item',owner:'Creator',format:'GLB',scale:'1.5',...source},record=normalize(raw);
      assert.equal(record.modelUrl,expected,id+' keeps the correct asset service');
      assert.equal(record.id,id);assert.equal(record.type,type);assert.equal(record.name,raw.name);assert.equal(record.owner,raw.owner);
      assert.equal(record.format,'glb');assert.equal(record.scale,1.5);assert.equal(record.visibility,'public');assert.equal(record.status,'active');
    }
  }finally{if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;}
});

test('Builder Backpack cards pop playable models into the current game', async () => {
  const [game, models] = await Promise.all([
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/builder-models-3d.js', import.meta.url), 'utf8')
  ]);
  assert.match(game, /function deployPlayableBuilderAsset\(asset\)/);
  assert.match(game, /asset\.buildAssetId\) \{ closeBackpack\(\); deployPlayableBuilderAsset\(asset\)/);
  assert.doesNotMatch(game, /asset\.buildAssetId\).*toggleBuildMenu\(true\)/);
  for (const id of ['grand-floor','open-studio','connected-suite','garden-courtyard']) assert.match(models, new RegExp(`'${id}'`));
});

test('Backpack lands and the SVG-backed item collection deploy inside gameplay', async () => {
  const [game, manifest] = await Promise.all([
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/models/backpack-assets.json', import.meta.url), 'utf8').then(JSON.parse)
  ]);
  assert.match(game, /function deployPlayableLandLayout\(asset\)/);
  assert.match(game, /deployPlayableLandLayout\(asset\)/);
  assert.doesNotMatch(game, /window\.location\.assign\(asset\.builderUrl/);
  const dimensionalItems = manifest.assets.filter((asset) => asset.format === 'procedural-3d' && /\.svg$/.test(asset.thumbnailUrl || ''));
  assert.ok(dimensionalItems.length >= 6, 'offers a useful list instead of a single SVG-backed 3D item');
  for (const item of dimensionalItems) assert.ok(item.buildAssetId, `${item.name} has an in-world procedural model`);
});

test('owned care supplies appear in the wheel and consume through shared inventory before spawning', async () => {
  const game = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  assert.match(game, /\['supplies','Supplies'\]/);
  assert.match(game, /\[starter,\.\.\.ownedSupplies,/);
  assert.match(game, /supplyOwner:state.owner_id/);
  const deploy = game.slice(game.indexOf('async function deployBackpackAsset(asset)'));
  assert.ok(deploy.indexOf("asset?.type==='supplies'") < deploy.indexOf("serverCommand('spawn'"));
  assert.match(deploy, /session.owner_id!==asset.supplyOwner/);
  assert.match(deploy, /await sharedInventory.action\('use',asset.id\)/);
  assert.match(deploy, /careEffects.accept\(result\)/);
  assert.match(deploy, /ownedSupplies=ownedSupplies.filter\(item=>item.id!==asset.id\)/);
  assert.match(game, /asset.type==='supplies'\?'Consume'/);
  assert.match(game, /gameMarketplace.open\(backpackCategory==='supplies'\?'care':'upgrades'\)/);
});
