import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {forgeWorld} from '../forge-world.mjs';
import {WorldAtlas,defaultStreets,attachAtlas} from '../world-atlas.mjs';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {replaceServerStreets} from '../public/js/environments/server-streets.js';
import {disposeModelResources} from '../public/js/game-graphics-resources.js';

test('the village replaces old generated city streets with its authored walking network',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'forge-village-roads-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(dir,'atlas.json')),map=forgeWorld();await atlas.synchronize([map]);
 const memberRoad={id:'smith-added-road',name:'Smith’s private walk',createdBy:'Smith',from:{x:90,z:0},to:{x:90,z:20},width:3};
 await atlas.transaction(data=>{const cell=Object.values(data.cells).find(cell=>cell.mapId===map.id);cell.streets=[...defaultStreets(map.id,224),memberRoad];data.revision++;});
 const data=await atlas.synchronize([map]),live=attachAtlas(map,data);
 assert.deepEqual(live.streets.map(street=>street.id).sort(),[...map.streets,memberRoad].map(street=>street.id).sort());
 assert.ok(live.streets.some(street=>street.name==='Bellows Lane'));assert.ok(live.streets.every(street=>!/^street-\d+$/.test(street.id)),'obsolete generated roads do not cross the smithy');
});

test('live street updates cannot cover the authored forge floors with city asphalt or signs',()=>{
 const map=forgeWorld(),root=createBuilderLand(map);assert.equal(root.userData.forgeVillage,true);assert.equal(root.getObjectByName('SERVER_STREETS'),undefined);
 replaceServerStreets(root,defaultStreets(map.id,224),{labels:true});assert.equal(root.getObjectByName('SERVER_STREETS'),undefined);
 disposeModelResources(root);
});
