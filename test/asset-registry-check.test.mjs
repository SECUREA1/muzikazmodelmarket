import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,readFile,writeFile,stat,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/build-game-asset-registry.mjs', import.meta.url));
const registry = new URL('../public/models/game-asset-registry.json', import.meta.url);

test('registry check detects missing and stale generated artifacts without writing them or the project registry', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'asset-registry-check-'));
  t.after(() => rm(directory, {recursive:true,force:true}));
  const artifact = join(directory, 'registry.json');
  const original = await readFile(registry, 'utf8');
  await assert.rejects(run(process.execPath, [script, '--check', '--output='+artifact]), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /missing or out of date/);
    return true;
  });
  await assert.rejects(access(artifact), {code:'ENOENT'});

  await run(process.execPath, [script, '--output='+artifact]);
  const current = await readFile(artifact, 'utf8');
  const currentStat = await stat(artifact, {bigint:true});
  await run(process.execPath, [script, '--check', '--output='+artifact]);
  assert.equal(await readFile(artifact, 'utf8'), current);
  assert.equal((await stat(artifact, {bigint:true})).mtimeNs, currentStat.mtimeNs);

  const outdated = JSON.parse(current);
  outdated.assets = outdated.assets.filter(asset => asset.assetId !== 'builder-fitness-basketball-hoop');
  assert.equal(outdated.assets.length, JSON.parse(current).assets.length-1, 'fixture removes a real native catalog entry');
  const stale = JSON.stringify(outdated);
  await writeFile(artifact, stale);
  const staleStat = await stat(artifact, {bigint:true});
  await assert.rejects(run(process.execPath, [script, '--check', '--output='+artifact]), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /missing or out of date/);
    return true;
  });
  assert.equal(await readFile(artifact, 'utf8'), stale, 'failing check does not silently repair its input');
  assert.equal((await stat(artifact, {bigint:true})).mtimeNs, staleStat.mtimeNs);
  assert.equal(await readFile(registry, 'utf8'), original, 'artifact checks never mutate the repository registry');
});
