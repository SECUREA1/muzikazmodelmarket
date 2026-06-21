import { access, readFile } from 'node:fs/promises';

const requiredFiles = ['dist/index.html', 'dist/styles.css', 'dist/script.js', 'dist/reference.png'];

await Promise.all(requiredFiles.map((file) => access(file)));

const html = await readFile('dist/index.html', 'utf8');
for (const asset of ['styles.css', 'script.js', 'reference.png']) {
  if (!html.includes(asset) && asset !== 'reference.png') {
    throw new Error(`index.html does not reference ${asset}`);
  }
}

const css = await readFile('dist/styles.css', 'utf8');
if (!css.includes("url('reference.png')")) {
  throw new Error('styles.css does not reference the hero artwork.');
}

console.log('Static build output contains required files and references.');
