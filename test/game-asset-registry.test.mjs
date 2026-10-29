import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
import {NATIVE_DESIGN_VERSION} from '../public/js/native-design-profile.js';

const root = new URL('../', import.meta.url);

test('unified registry exposes complete runtime metadata and valid authored models', async () => {
  const registry = JSON.parse(await readFile(new URL('public/models/game-asset-registry.json', root), 'utf8'));
  assert.ok(registry.assets.length > 80, 'project-wide discovery found the model library');
  const required = ['assetId','name','category','assetType','source','generated','modelPath','thumbnail','defaultTransform','materials','collision','physics','animations','interactions','inventoryCompatible','wearableCompatible','vehicleCompatible','mapCompatible','environmentCompatible','runtimeCompatible','singlePlayerCompatible','multiplayerCompatible'];
  for (const asset of registry.assets) {
    required.forEach(key => assert.ok(Object.hasOwn(asset, key), `${asset.assetId} has ${key}`));
    if (asset.modelPath) await access(new URL(asset.modelPath.replace(/^\//, ''), root));
    if (asset.generated) assert.match(asset.generator, /^(bottle|dynamite-bundle|carrot|bone|fish|cheese|terrain-slab|extruded-svg)$/);
    if (asset.native) {
      assert.equal(asset.visualDesign?.version,NATIVE_DESIGN_VERSION,asset.assetId+' retains its native pack design');
      assert.equal(normalizeCatalogModel(asset,0).visualDesign.version,NATIVE_DESIGN_VERSION);
    }
  }
  assert.equal(registry.audit.warnings.filter(issue => issue.level === 'error').length, 0);
  assert.equal(registry.assets.find(asset => asset.assetId === 'muzikaz-main').assetType, 'terrain', 'playable land is not a prop');
  assert.equal(registry.assets.find(asset => asset.assetId === 'drone-engine').assetType, 'vehicle');
  assert.equal(registry.assets.find(asset => asset.assetId === 'volt-wolf-wearable').attachment.socket, 'torso');
});

test('catalog normalization preserves pack design without modifying authored model material or UV metadata',()=>{
 const raw={id:'native-ship',name:'Ship',buildAssetId:'shipping-feeder',format:'procedural-3d',visualDesign:{version:NATIVE_DESIGN_VERSION,thumbnailUrl:'/public/images/native-designs/shipping-feeder.svg'}};
 const normalized=normalizeCatalogModel(raw,0);assert.deepEqual(normalized.visualDesign,raw.visualDesign);assert.notEqual(normalized.visualDesign,raw.visualDesign);
 normalized.visualDesign.version='local-preview';assert.equal(raw.visualDesign.version,NATIVE_DESIGN_VERSION);
 const authored={id:'authored-ship',name:'Authored ship',modelUrl:'/public/models/ship.glb',format:'glb',materials:{preserveOriginal:true},visualDesign:{version:'artist-release'}};
 assert.equal(normalizeCatalogModel(authored,0).visualDesign.version,'artist-release');assert.deepEqual(authored.materials,{preserveOriginal:true});
});

test('missing visuals are generated as shaped persistent recipes and loaded by the builder', async () => {
  const [models, builder] = await Promise.all([
    readFile(new URL('public/js/builder-models-3d.js', root), 'utf8'),
    readFile(new URL('environment-builder.js', root), 'utf8')
  ]);
  for (const recipe of ['bottle','dynamite-bundle','carrot','bone','fish','cheese','terrain-slab','extruded-svg']) assert.match(models, new RegExp(`recipe==='${recipe}'`));
  assert.match(builder, /game-asset-registry\.json/);
  assert.match(builder, /createGeneratedAsset\(model\)/);
  assert.match(builder, /GLB_LOAD_FAILURE/);
});
