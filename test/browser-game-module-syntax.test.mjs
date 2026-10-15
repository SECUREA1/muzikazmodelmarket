import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
test('game economy and gameplay browser modules parse as JavaScript modules',async()=>{
 for(const file of ['environments/builder-land.js','environments/environment-loader.js','authoritative-room-client.js','world-map-picker.js','house-explorer-glb.js','game-economy-client.js','game-utilities.js','in-game-market.js','shared-game-inventory.js','member-plot-browser.js','member-designer.js','settings-explorer-menu.js']){
 const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:await readFile(new URL('../public/js/'+file,import.meta.url),'utf8'),encoding:'utf8'});
 assert.equal(result.status,0,file+': '+result.stderr.slice(-1500));
 }
});
