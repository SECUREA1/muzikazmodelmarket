import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditWorldItems} from '../scripts/audit-world-items.mjs';
import {PRISON_ITEMS} from '../public/js/prison-items.js';
import {GAME_ECONOMY,GAME_BUNDLES} from '../game-economy.mjs';
import {ensureWorldSupply,supplyItem} from '../world-supply.mjs';
const execute=promisify(execFile);

test('authored repository, runtime, Commons and district world items all resolve to renderable finite-supply market entries',async()=>{
 const report=await auditWorldItems();
 assert.ok(report.counts.worlds>=45);assert.ok(report.counts.publicMapInstances>5000);assert.ok(report.counts.worldMarketItems>=200);
 assert.ok(report.counts.nativeDefinitions>=475);assert.ok(report.counts.authoredModelFiles>=46);
 for(const [field,issues]of Object.entries(report))if(Array.isArray(issues)&&field!=='worlds')assert.deepEqual(issues,[],field);
 for(const id of ['public-commons','world-district-neon-docks','muzikaz-airport','hormuz-shipping','ironwood-prison'])assert.ok(report.worlds.some(world=>world.id===id),id);
 assert.ok(report.counts.runtimeWorldRenderers>=1);assert.ok(report.counts.earnedCollectibles>=Object.keys(PRISON_ITEMS).length);
 assert.ok(report.worlds.some(world=>world.glbInstances>0),'base GLB world models are included');
});

test('registry discovery preserves manifest privacy exclusions while discovering real new GLBs',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'world-item-discovery-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await mkdir(join(directory,'scripts'),{recursive:true});await mkdir(join(directory,'public/models'),{recursive:true});
 const original=await readFile(new URL('../scripts/build-game-asset-registry.mjs',import.meta.url),'utf8');
 const source=original.replace("from '../public/js/builder-catalog.js'",`from '${new URL('../public/js/builder-catalog.js',import.meta.url).href}'`);
 await writeFile(join(directory,'scripts/build-game-asset-registry.mjs'),source);
 await writeFile(join(directory,'public/models/backpack-assets.json'),JSON.stringify({assets:[]}));
 await writeFile(join(directory,'public/models/toolkit-assets.json'),JSON.stringify({assets:[]}));
 await writeFile(join(directory,'public/models/glb-models.json'),JSON.stringify({models:[{id:'private-model',name:'Private model',visibility:'private',modelUrl:'/public/models/private%20model.glb'},{id:'retired-model',name:'Retired model',status:'inactive',modelUrl:'/public/models/retired.glb'}]}));
 const bytes=Buffer.alloc(12);bytes.write('glTF');bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(12,8);
 for(const name of ['private model','retired','new-public'])await writeFile(join(directory,'public/models/'+name+'.glb'),bytes);
 await execute(process.execPath,[join(directory,'scripts/build-game-asset-registry.mjs')],{cwd:directory});
 const registry=JSON.parse(await readFile(join(directory,'public/models/game-asset-registry.json'),'utf8'));
 assert.ok(registry.assets.some(item=>item.modelPath==='/public/models/new-public.glb'&&!item.generated));
 for(const name of ['private model','retired'])assert.equal(registry.assets.some(item=>item.modelPath==='/public/models/'+name+'.glb'),false,name+' cannot be republished by filesystem discovery');
});


test('Ironwood keepsakes retain earned canonical identities and cannot become factory supply recipes',()=>{
 const data={};ensureWorldSupply(data);
 for(const id of Object.keys(PRISON_ITEMS)){
  const entries=GAME_ECONOMY.filter(item=>item.buildAssetId===id);assert.equal(entries.length,1,id+' canonical market identity');
  const item=entries[0];assert.equal(item.earnedOnly,true);assert.equal(item.tradable,false);assert.equal(item.priceMzk,0);assert.equal(item.useCostMzk,0);
  assert.equal(item.sku,'backpack:builder-'+id);
  assert.equal(GAME_BUNDLES.some(bundle=>bundle.entries.some(entry=>entry.sku===item.sku)),false);
  assert.throws(()=>supplyItem(data,item),/not registered/,id+' must be earned through its prison receipt');
  assert.equal(Object.values(data.worldSupply.catalog).some(entry=>entry.buildAssetId===id),false);
 }
});
