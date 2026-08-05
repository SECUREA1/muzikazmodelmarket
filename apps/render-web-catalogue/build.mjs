import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'app.js', 'styles.css']) {
  await cp(path.join(root, file), path.join(dist, file));
}
await mkdir(path.join(dist, 'models'), { recursive: true });
await cp(path.resolve(root, '../../public/models'), path.join(dist, 'models'), { recursive: true });
console.log('Built XREAL spatial model catalogue.');
