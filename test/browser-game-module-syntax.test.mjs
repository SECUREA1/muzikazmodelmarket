import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
test('game economy and gameplay browser modules parse as JavaScript modules',async()=>{
 for(const file of ['explorer-camera.js','game-camera.js','arcade-game.js','arcade-park.js','arcade-rules.js','arcade-runtime.js','sports-surfaces.js','arcade-3d-games.js','arcade-navigation.js','hockey-camera.js','arcade-builder-runtime.js','hockey-rules.js','hockey-officials.js','hockey-facilities.js','hockey-models.js','hockey-game.js','game-item-pricing.js','market-item-preview.js','shared-market-catalog.js','walking-motion.js','world-navigation.js','play-access.js','owned-item-placement.js','server-scene-projection.js','menu-shortcut-icons.js','crib-multiplayer.js','shared-enemy-animation.js','shared-game-inventory.js','in-game-market.js','game-economy-client.js','rpg-combat-rules.js','match-results.js','backpack-files.js','shared-market-catalog.js','ethereum-member-login.js','library-market.js','page-navigation.js','custom-item-toolkit.js','world-atlas.js','environments/server-streets.js','environments/builder-land.js','environments/slime-floor.js','environments/environment-loader.js','authoritative-room-client.js','world-map-picker.js','house-explorer-glb.js','game-economy-client.js','game-utilities.js','in-game-market.js','shared-game-inventory.js','member-plot-browser.js','member-designer.js','settings-explorer-menu.js']){
 const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:await readFile(new URL('../public/js/'+file,import.meta.url),'utf8'),encoding:'utf8'});
 assert.equal(result.status,0,file+': '+result.stderr.slice(-1500));
 }
});

