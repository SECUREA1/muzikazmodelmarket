import {httpSecurityHeaders} from '../http-security.mjs';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';

const root = new URL('..', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const staticExtensions = new Set(['.html', '.css', '.js', '.json', '.png', '.svg', '.jpg', '.jpeg', '.webp', '.ico', '.txt', '.xml', '.webmanifest']);
const ignoredNames = new Set(['dist', 'node_modules', '.git', 'scripts', 'package-lock.json', 'package.json', 'render.yaml']);
const requiredDirectories = [
  // The explorers import these modules at runtime, including the IE-safe RAD-TOX launcher.
  'public',
  '.well-known',
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

// Netlify/Cloudflare Pages understand this file; other static hosts need
// equivalent edge configuration. Node responses use the same policy directly.
const edgeHeaders='/*\n'+Object.entries(httpSecurityHeaders({production:true})).map(([key,value])=>'  '+key+': '+value).join('\n')+'\n/api/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n/uploads/*\n  Cache-Control: private, no-store\n  X-Robots-Tag: noindex, nofollow\n';
await writeFile(new URL('_headers',dist),edgeHeaders);
console.log('Built optimized static site into dist/.');
