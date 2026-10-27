import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {browserModuleSpecifiers,verifyBrowserModuleGraph} from '../scripts/check-browser-modules.mjs';

async function fixture(t,files){const root=await mkdtemp(join(tmpdir(),'browser-module-graph-'));t.after(()=>rm(root,{recursive:true,force:true}));for(const [path,source]of Object.entries(files)){const file=join(root,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,source);}return root;}

test('browser module imports exclude comments, strings, worker source and bare packages',()=>{
 const source=`import 'three';\nimport { scene } from './graphics.js?v=updated#scene';\nexport * from './shared.js';\nvoid import('./world.js', { with: { type: 'javascript' }});\n// import './missing-comment.js';\n/* export * from './missing-block.js'; */\nconst sample = "import('./missing-string.js')";\nconst worker = \`import './missing-worker.js';\`;\nvoid import(computedPath);`;
 assert.deepEqual(browserModuleSpecifiers(source),['./graphics.js?v=updated#scene','./shared.js','./world.js']);
});

test('the deployed graph follows graphics, root URLs, query strings and cyclic dependencies',async t=>{
 const root=await fixture(t,{'entry.js':"import './graphics.js?v=release#graphics'; export * from './shared.js'; void import('./worlds/native.js');",'graphics.js':"import '/public/vendor/three.js'; import './shared.js';",'shared.js':"import './graphics.js'; export const shared=true;",'worlds/native.js':"export const native=true;",'public/vendor/three.js':"export const renderer=true;"});
 const result=await verifyBrowserModuleGraph({root,entries:['entry.js']});assert.equal(result.files.length,5);assert.ok(result.files.includes('public/vendor/three.js'));assert.equal(result.imports,6);
});

test('missing upgraded graphics dependencies fail the build with the importing module and exact path',async t=>{
 const root=await fixture(t,{'entry.js':"import './graphics.js';",'graphics.js':"import './missing-upgrade.js?v=current';"});
 await assert.rejects(verifyBrowserModuleGraph({root,entries:['entry.js']}),/missing-upgrade\.js\?v=current imported by graphics\.js is missing/);
});

test('a browser import cannot silently resolve a source file outside the deployed build',async t=>{
 const root=await fixture(t,{'entry.js':"import '../server.mjs';"});await assert.rejects(verifyBrowserModuleGraph({root,entries:['entry.js']}),/escapes the static build/);
});


test('quotes and comment-like text inside regular expressions do not hide real imports',()=>{
 assert.deepEqual(browserModuleSpecifiers("const matcher=/[\"']/; const url=/^https?:\\/\\//; void import('./real-world.js');"),['./real-world.js']);
});
