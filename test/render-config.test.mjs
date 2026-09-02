import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Render runs the live API and keeps every mutable admin store on its disk', async () => {
  const blueprint = await readFile(new URL('../render.yaml', import.meta.url), 'utf8');

  assert.match(blueprint, /runtime: node/);
  assert.match(blueprint, /startCommand: node server\.mjs/);
  assert.match(blueprint, /healthCheckPath: \/api\/health/);
  assert.match(blueprint, /mountPath: \/var\/data/);

  for (const setting of [
    'MUZIKAZ_DATA_DIR',
    'MUZIKAZ_USER_DATABASE_FILE',
    'MUZIKAZ_ACCOUNTS_FILE',
    'MUZIKAZ_PAYMENT_ORDERS_FILE',
    'MUZIKAZ_AVATAR_UPLOAD_DIR',
    'MUZIKAZ_ASSET_UPLOAD_DIR',
    'MUZIKAZ_ENVIRONMENT_UPLOAD_DIR',
    'MUZIKAZ_ENVIRONMENT_DATA_FILE',
  ]) {
    assert.match(blueprint, new RegExp(`key: ${setting}\\n\\s+value: /var/data/`));
  }
});

test('legacy Rust deployment exposes the complete admin Loadout generator contract', async () => {
  const server = await readFile(new URL('../src/main.rs', import.meta.url), 'utf8');

  for (const route of [
    '/api/admin/session',
    '/api/admin/logout',
    '/api/admin/access-codes',
    '/api/admin/loadout-codes',
  ]) {
    assert.match(server, new RegExp(route.replaceAll('/', '\\/')));
  }

  assert.match(server, /fn create_loadout_code/);
  assert.match(server, /fn admin_loadout_codes/);
  assert.match(server, /fn revoke_loadout_code/);
  assert.match(server, /loadout-codes-rust\.json/);
});
