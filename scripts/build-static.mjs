import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { build } from 'esbuild';
const root = new URL('..', import.meta.url), dist = new URL('../dist/', import.meta.url);
const staticExtensions = new Set(['.html','.css','.js','.json','.png','.svg','.jpg','.jpeg','.webp','.ico','.txt','.xml','.webmanifest']);
const ignoredNames = new Set(['dist','node_modules','.git','scripts','package-lock.json','package.json','render.yaml','tests']);
const requiredDirectories=['public','muzikaz_high_level_image_pack1/04_collection_tiles','muzikaz_high_level_image_pack1/05_merch'];
async function copyDir(path){try{await stat(new URL(path+'/',root));await cp(new URL(path+'/',root),new URL(path+'/',dist),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}}
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const entry of await readdir(root,{withFileTypes:true})){if(ignoredNames.has(entry.name)||entry.isDirectory())continue;const details=await stat(new URL(entry.name,root));if(details.isFile()&&staticExtensions.has(extname(entry.name).toLowerCase()))await cp(new URL(entry.name,root),new URL(entry.name,dist));}
for(const dir of requiredDirectories)await copyDir(dir);
await build({entryPoints:{'house-explorer':'public/js/house-explorer-glb.js','model-viewer':'public/js/model-viewer-entry.js'},outdir:'dist/assets',bundle:true,format:'esm',splitting:true,platform:'browser',target:['es2020'],entryNames:'[name]-[hash]',chunkNames:'chunks/[name]-[hash]',assetNames:'assets/[name]-[hash]',logLevel:'info'});
await build({entryPoints:['script.js'],outfile:'dist/script.js',bundle:true,format:'iife',platform:'browser',target:['es5'],logLevel:'info'});
// Stable HTML aliases resolve to hashed files without runtime CDNs and work on nested routes.
const { writeFile, readFile: rf } = await import('node:fs/promises'); const files=await readdir('dist/assets');
for(const logical of ['house-explorer','model-viewer']){const file=files.find(x=>x.startsWith(logical+'-')&&x.endsWith('.js'));if(!file)throw new Error('Missing bundle: '+logical);await writeFile('dist/assets/'+logical+'.js',`import './${file}';\n`);}
// Decoder WASM/JS assets are local and cacheable alongside bundles.
for(const [from,to] of [['node_modules/three/examples/jsm/libs/draco','dist/assets/decoders/draco'],['node_modules/three/examples/jsm/libs/basis','dist/assets/decoders/basis']]) await cp(from,to,{recursive:true});
console.log('Built static site with local hashed game bundles into dist/.');
