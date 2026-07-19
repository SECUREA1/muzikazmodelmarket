import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('compatibility launcher remains ES5-safe', async () => { const source = await readFile('public/js/rad-tox-launcher.js', 'utf8'); assert.match(source, /compatibility-mode/); assert.doesNotMatch(source, /(?:const |let |=>|`|\?\.)/); });
test('game source has no runtime CDN imports', async () => { const source = await readFile('public/js/house-explorer-glb.js', 'utf8'); const loader = await readFile('public/js/environments/environment-loader.js', 'utf8'); assert.doesNotMatch(source + loader, /https:\/\/(?:cdn\.jsdelivr|unpkg|gstatic)/); });

test('Render builds static game bundles before starting the Rust server', async () => {
  const render = await readFile('render.yaml', 'utf8');
  assert.match(render, /buildCommand: npm install --no-package-lock && npm run build && cargo build --release/);
});
