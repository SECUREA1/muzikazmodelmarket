import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('Builders Pack provides a floor, three rooms, and twenty labelled SVG models', async () => {
  const [html, script, modelFiles] = await Promise.all([
    readFile(new URL('../builder-market.html', import.meta.url), 'utf8'),
    readFile(new URL('../builder-market.js', import.meta.url), 'utf8'),
    readdir(new URL('../public/images/builder-pack/', import.meta.url))
  ]);

  assert.match(html, /Grand Build Floor/);
  assert.match(html, /40 × 40/);
  assert.match(html, /3 layouts/);
  assert.match(html, /20 models/);
  assert.equal((script.match(/name:'(?:Open Studio|Connected Suite|Garden Courtyard)'/g) || []).length, 3);
  assert.equal((script.match(/\['[a-z-]+','[^']+','(?:landscape|interior)'\]/g) || []).length, 20);
  assert.equal(modelFiles.filter((file) => file.endsWith('.svg')).length, 20);
});
