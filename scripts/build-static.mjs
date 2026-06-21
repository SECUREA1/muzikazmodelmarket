import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { extname } from 'node:path';

const root = new URL('..', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const staticExtensions = new Set(['.html', '.css', '.js', '.json', '.png', '.svg', '.jpg', '.jpeg', '.webp', '.ico', '.txt']);
const ignoredNames = new Set(['dist', 'node_modules', '.git', 'scripts', 'package-lock.json', 'package.json', 'render.yaml']);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (ignoredNames.has(entry.name)) continue;

  const source = new URL(entry.name, root);
  const destination = new URL(entry.name, dist);

  if (entry.isDirectory()) {
    await cp(source, destination, { recursive: true });
    continue;
  }

  const details = await stat(source);
  if (details.isFile() && staticExtensions.has(extname(entry.name).toLowerCase())) {
    await cp(source, destination);
  }
}

console.log('Built static site into dist/.');
