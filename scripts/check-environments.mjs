import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const manifestPath = 'public/models/environments/environments.json';
const records = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!Array.isArray(records) || records.length < 3) throw new Error('Environment manifest must include main, upper, and full-house records.');
for (const required of ['muzikaz-main', 'muzikaz-upper', 'muzikaz-full-house']) {
  if (!records.some((record) => record.id === required)) throw new Error(`Missing ${required} environment.`);
}
for (const record of records) {
  const urls = record.modelUrls || [record.modelUrl];
  if (!record.id || !record.name || !urls.length) throw new Error(`Invalid environment record: ${record.id || 'unknown'}`);
  for (const url of urls) {
    if (!url.startsWith('/public/models/environments/') || !url.endsWith('.glb')) throw new Error(`Repository environment URL must point to a GLB: ${url}`);
    const path = url.replace(/^\//, '');
    const buffer = await readFile(path);
    if (buffer.slice(0, 4).toString('utf8') !== 'glTF') throw new Error(`${path} is not a binary glTF GLB.`);
    const details = await stat(path);
    if (!details.size) throw new Error(`${path} is empty.`);
  }
  if (!record.spawn || !Number.isFinite(Number(record.spawn.y))) throw new Error(`${record.id} needs spawn metadata.`);
}
console.log(`Validated ${records.length} repository environment records and GLB headers.`);
