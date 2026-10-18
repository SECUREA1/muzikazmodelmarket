import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {filterAtlasLocations,atlasLocationPosition} from '../public/js/index-atlas-directory.js';
test('the index directory includes all server maps and searches districts, creators and deeds',()=>{
 const maps=Array.from({length:165},(_,i)=>({mapId:'map-'+i,name:'Saved map '+i,ownerName:'Alice',districtName:'Neon Docks',column:i%10,row:Math.floor(i/10)}));maps.push({mapId:'plot-deed-77',name:'Estate',ownerName:'Bob',deedId:'deed-77'});
 assert.equal(filterAtlasLocations(maps).length,166);assert.equal(filterAtlasLocations(maps,'alice neon').length,165);assert.equal(filterAtlasLocations(maps,'deed-77')[0].mapId,'plot-deed-77');
 for(const map of maps){const position=atlasLocationPosition(map);assert.equal(position.mapId,map.mapId);assert.ok(position.x>=0&&position.x<=100);assert.ok(position.y>=0&&position.y<=100);}
});
test('the illustrated map form and live atlas styles have independent scopes',async()=>{
 const [html,css,source]=await Promise.all([readFile(new URL('../index.html',import.meta.url),'utf8'),readFile(new URL('../public/assets/world-atlas.css',import.meta.url),'utf8'),readFile(new URL('../public/js/world-atlas.js',import.meta.url),'utf8')]);
 for(const id of ['world-destination-search','world-live-destination','world-live-locations','world-destinations-refresh'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(css.includes('.world-atlas-live-panel'));assert.ok(!/\.world-atlas(?![\w-])/.test(css));assert.match(source,/classList.add\('world-atlas-live-panel'\)/);
});
