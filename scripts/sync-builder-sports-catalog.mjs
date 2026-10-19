import {readFile,writeFile} from 'node:fs/promises';
import {SPORTS_BUILDER_ITEMS,sportsBackpackAsset} from '../public/js/builder-sports-catalog.js';

const path=new URL('../public/models/backpack-assets.json',import.meta.url),before=await readFile(path,'utf8'),manifest=JSON.parse(before),items=new Map(SPORTS_BUILDER_ITEMS.map(item=>[item.id,sportsBackpackAsset(item)]));
manifest.assets=manifest.assets.map(asset=>{const sports=items.get(asset.id);if(!sports)return asset;items.delete(asset.id);return {...asset,...sports};});
manifest.assets.push(...items.values());
const stadium=manifest.assets.find(asset=>asset.id==='basketball-arena');
if(stadium){stadium.builderLayoutId='basketball-stadium';stadium.builderUrl='/environment-builder.html?layout=basketball-stadium';}
// Keep the manifest's existing ASCII JSON style so syncs only change records.
const after=JSON.stringify(manifest,null,2).replace(/[\u007f-\uffff]/g,char=>`\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`)+'\n';
if(process.argv.includes('--check')){
 if(before!==after){console.error('Sports Backpack records are out of date. Run node scripts/sync-builder-sports-catalog.mjs.');process.exitCode=1;}
 else console.log(`${SPORTS_BUILDER_ITEMS.length} native sports assets match the Backpack catalog.`);
}else{await writeFile(path,after);console.log(`Synced ${SPORTS_BUILDER_ITEMS.length} native sports assets into the Backpack catalog.`);}
