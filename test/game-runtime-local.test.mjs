import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';

test('game engine module graph and compressed model decoders are hosted locally',async()=>{
 const seen=new Set();
 async function visit(url){
  if(seen.has(url.href))return;seen.add(url.href);
  const source=await readFile(url,'utf8');
  for(const match of source.matchAll(/^import\s+(?:[^;]*?\sfrom\s*)?['"]([^'"]+)['"]/gm)){
   const spec=match[1];assert.ok(spec.startsWith('.'),`${url.pathname}: external dependency ${spec}`);
   const next=new URL(spec,url);if(next.pathname.endsWith('.js'))await visit(next);
  }
 }
 await visit(new URL('../public/js/house-explorer-glb.js',import.meta.url));
 for(const name of ['basis/basis_transcoder.js','basis/basis_transcoder.wasm','draco/gltf/draco_wasm_wrapper.js','draco/gltf/draco_decoder.wasm','draco/gltf/draco_decoder.js'])await access(new URL('../public/vendor/three/addons/libs/'+name,import.meta.url));
 assert.ok(seen.size>30);
});
