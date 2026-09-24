import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('VibeVerse exposes a compact searchable function menu', async () => {
  const [html, script, styles] = await Promise.all([
    readFile(new URL('../model-explorer.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/explorer-options-menu.js', import.meta.url), 'utf8'),
    readFile(new URL('../styles.css', import.meta.url), 'utf8')
  ]);

  assert.match(html, /id="explorer-options-toggle"[^>]+aria-expanded="false"/);
  assert.match(html, /id="explorer-options-search"[^>]+type="search"/);
  assert.equal((html.match(/data-option-keywords=/g) || []).length, 8);
  assert.match(script, /terms\.every\(\(term\) => searchableText\.includes\(term\)\)/);
  assert.equal((html.match(/data-explorer-workspace(?=[ >])/g) || []).length, 4);
  assert.equal((html.match(/data-explorer-view=/g) || []).length, 8);
  assert.match(script, /workspace\.hidden = !selected/);
  assert.match(script, /window\.addEventListener\('popstate'/);
  assert.match(styles, /\.explorer-options__panel\[hidden\]\{display:none\}/);
  assert.match(styles, /\[data-explorer-workspace\]\[hidden\]\{display:none!important\}/);
});
