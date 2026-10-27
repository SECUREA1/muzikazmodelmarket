import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('public native market links map components to canonical purchases and preserves runtime data in Backpack', {timeout:30000}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'native-market-api-'));
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  let stderr = '';
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd:new URL('..', import.meta.url),
    env:{...process.env, PORT:String(port), MUZIKAZ_DATA_DIR:directory,
      MUZIKAZ_USER_DATABASE_FILE:join(directory,'users.json'), MUZIKAZ_ACCOUNTS_FILE:join(directory,'accounts.json'),
      MUZIKAZ_PAYMENT_ORDERS_FILE:join(directory,'payments.json'), MUZIKAZ_CUSTOM_MAPS_FILE:join(directory,'custom-maps.json'),
      MUZIKAZ_ENVIRONMENT_DATA_FILE:join(directory,'environments.json'), MUZIKAZ_AVATAR_UPLOAD_DIR:join(directory,'avatars'),
      MUZIKAZ_ASSET_UPLOAD_DIR:join(directory,'assets'), MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(directory,'environment-uploads')},
    stdio:['ignore','ignore','pipe']
  });
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-8000); });
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child,'exit'); child.kill('SIGTERM'); await exited; }
    await rm(directory,{recursive:true,force:true});
  });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Native market server stopped: ${stderr}`);
    try { if ((await fetch(base+'/api/health')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve,50));
  }
  assert.ok(ready, 'native market server became ready: '+stderr);
  async function request(path,{headers={},body}={}) {
    const response = await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
    return {response,...await response.json()};
  }

  const publicCatalog = await request('/api/market/catalog');
  assert.equal(publicCatalog.response.status,200,'the full native catalog is publicly browsable');
  const upgrades = publicCatalog.data.filter(item => item.source === 'upgrade');
  assert.equal(upgrades.filter(item => item.native).length,GAME_ECONOMY.filter(item => item.native).length);
  assert.deepEqual(new Set(upgrades.map(item => item.sku)),new Set(GAME_ECONOMY.map(item => item.sku)),'all canonical SKUs appear in the public market');
  const bySku = new Map(upgrades.map(item => [item.sku,item]));
  for (const definition of Object.values(NATIVE_BUILDER_ITEMS)) {
    assert.ok(upgrades.some(item => item.buildAssetId === definition.id && item.native),'native definition is market integrated: '+definition.id);
  }

  const environments = (await request('/api/environments')).data;
  const templates = publicCatalog.data.filter(item => item.source === 'native-map');
  assert.ok(templates.length > 0,'public generated worlds expose reusable templates');
  let unresolvedCount = 0;
  const unresolvedIds = new Set(), missingNative = new Set();
  for (const template of templates) {
    const map = environments.find(map => map.id === template.worldId);
    assert.ok(map,'each template identifies its live public environment');
    const scene=map.builderScene || map.placementScene || {};
    assert.equal(template.itemCount,scene.objects?.length || (scene.nativeComponents || []).reduce((sum,part)=>sum+(Number(part.count)||1),0));
    assert.equal(template.components.reduce((sum,item) => sum+item.count,0),template.itemCount,'component quantities cover every object in '+template.worldId);
    for (const component of template.components) {
      if (!component.sku) {
        unresolvedCount += component.count;
        unresolvedIds.add(component.buildAssetId);
        if (NATIVE_BUILDER_ITEMS[component.buildAssetId]) missingNative.add(component.buildAssetId);
        continue;
      }
      const item = bySku.get(component.sku);
      assert.ok(item,'map component links to a purchasable canonical SKU: '+component.sku);
      assert.ok(item.nativeMaps.some(usage => usage.id === template.worldId && usage.count === component.count),'canonical item links back to the map and its exact quantity');
    }
  }
  t.diagnostic(`${upgrades.filter(item => item.native).length} native items; ${templates.length} map templates; ${unresolvedCount} unresolved object references (${[...unresolvedIds].sort().join(', ') || 'none'}).`);
  assert.deepEqual([...missingNative],[],'all native map references resolve to market SKUs');

  const airport = templates.find(item => item.worldId === 'muzikaz-airport');
  assert.ok(airport);
  const airportScene = environments.find(item => item.id === airport.worldId).builderScene;
  for (const modelId of ['corsair-aircraft','material:rubber-tile','studio-desk']) {
    const count = airportScene.objects.filter(object => object.modelId === modelId).length;
    const component = airport.components.find(item => item.buildAssetId === modelId);
    assert.ok(count > 0 && component?.sku,'airport functional and structural pieces are sold individually: '+modelId);
    assert.equal(component.count,count,'airport bill of materials retains quantity for '+modelId);
  }
  assert.match(airport.builderUrl,/layout=repository-muzikaz-airport/);
  assert.match(airport.visitUrl,/environment=muzikaz-airport/);

  const login = await request('/api/access/free-play',{body:{username:'NativeMarketPlayer',password:'native-market-test-password'}});
  assert.equal(login.response.status,200);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  const headers = {Cookie:cookie,'X-CSRF-Token':login.data.csrfToken};
  const before = (await request('/api/economy',{headers})).data;
  const selections = ['portal-door','corsair-aircraft','hockey-stick'].map(id => upgrades.find(item => item.buildAssetId === id));
  let spent = 0;
  for (const item of selections) {
    assert.ok(item && !item.basic);
    const body = {sku:item.sku,requestId:'native-api-'+item.buildAssetId};
    assert.equal((await request('/api/economy/buy',{body})).response.status,401,'purchases require an account');
    assert.equal((await request('/api/economy/buy',{headers:{Cookie:cookie},body})).code,'CSRF_INVALID');
    const purchase = await request('/api/economy/buy',{headers,body});
    assert.equal(purchase.response.status,200,purchase.message);
    const replay = await request('/api/economy/buy',{headers,body});
    assert.equal(replay.response.status,200);
    assert.equal(replay.data.id,purchase.data.id,'retries retain the original receipt');
    spent += item.priceMzk;
  }
  const after = (await request('/api/economy',{headers})).data;
  assert.equal(after.balance,before.balance-spent,'native purchases debit the shared balance exactly once');
  for (const item of selections) {
    const owned = after.ownedAssets.filter(asset => asset.economySku === item.sku);
    assert.equal(owned.length,1,'one owned native copy survives replay');
    assert.equal(owned[0].buildAssetId,item.buildAssetId);
    assert.equal(owned[0].behavior,item.behavior);
    assert.deepEqual(owned[0].function_data,item.function_data,'Backpack retains native interaction settings');
    for (const key of ['vehicleSettings','animationState']) if (item[key]) assert.deepEqual(owned[0][key],item[key]);
    assert.equal(after.items.find(asset => asset.sku === item.sku).owned,true);
  }
  const backpack = (await request('/api/wallet/state',{headers})).data;
  for (const item of selections) assert.equal(backpack.items.filter(asset => asset.economySku === item.sku).length,1,'the same purchase is durable in member Backpack');
});
