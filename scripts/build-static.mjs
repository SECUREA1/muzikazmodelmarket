import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { extname } from 'node:path';

const root = new URL('..', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const staticExtensions = new Set(['.html', '.css', '.js', '.json', '.png', '.svg', '.jpg', '.jpeg', '.webp', '.ico', '.txt', '.xml', '.webmanifest']);
const ignoredNames = new Set(['dist', 'node_modules', '.git', 'scripts', 'package-lock.json', 'package.json', 'render.yaml']);
const requiredDirectories = [
  'public',
  'muzikaz_high_level_image_pack1/04_collection_tiles',
  'muzikaz_high_level_image_pack1/05_merch',
];

async function copyRequiredDirectory(path) {
  const source = new URL(`${path}/`, root);
  const destination = new URL(`${path}/`, dist);

  try {
    await stat(source);
    await cp(source, destination, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (ignoredNames.has(entry.name) || entry.isDirectory()) continue;

  const details = await stat(new URL(entry.name, root));
  if (details.isFile() && staticExtensions.has(extname(entry.name).toLowerCase())) {
    await cp(new URL(entry.name, root), new URL(entry.name, dist));
  }
}

for (const directory of requiredDirectories) {
  await copyRequiredDirectory(directory);
}

console.log('Built optimized static site into dist/.');
