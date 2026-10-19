import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {worldTravelObjects,portalArrivalPosition} from '../server-world-travel.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldAtlas } from '../world-atlas.mjs';
import { synchronizeWorldDirectory } from '../world-directory.mjs';
import { sortWorlds, filterWorlds } from '../public/js/world-map-picker.js';
import { filterAtlasLocations, atlasLocationPosition } from '../public/js/index-atlas-directory.js';
import { worldPreviewData } from '../public/js/world-preview-data.js';

test('the permanent basketball destination survives an empty publication list and a directory restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'permanent-basketball-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'atlas.json');
  let result = await synchronizeWorldDirectory(new WorldAtlas(file), []);
  let arena = result.environments.find(map => map.id === 'basketball-arena');
  assert.ok(arena); assert.equal(arena.permanent, true); assert.equal(arena.canDelete, false); assert.equal(arena.canEdit, false);
  assert.equal(arena.roomId, 'basketball-arena'); assert.ok(arena.sharedWorld && arena.publicDestination);
  const district = result.environments.find(map => map.id === arena.districtId);
  assert.ok(district.builderScene.objects.some(object => object.atlasDestination === arena.id));
  const originalCell = Object.values(result.atlas.cells).find(cell => cell.mapId === arena.id);
  result = await synchronizeWorldDirectory(new WorldAtlas(file), [{ id: 'basketball-arena', name: 'Override', visibility: 'private', playable: false }]);
  arena = result.environments.find(map => map.id === 'basketball-arena');
  assert.equal(arena.name, 'MUZIKAZ Basketball Arena'); assert.equal(arena.visibility, 'public');
  const restoredCell = Object.values(result.atlas.cells).find(cell => cell.mapId === arena.id);
  assert.deepEqual([restoredCell.column, restoredCell.row], [originalCell.column, originalCell.row]);
  assert.equal(restoredCell.permanent, true);
});

test('the court is discoverable in the map wheel and location index even with no active players', () => {
  const arena = { id: 'basketball-arena', mapId: 'basketball-arena', name: 'MUZIKAZ Basketball Arena', permanent: true, ownerName: 'MUZIKAZ', column: 1, row: 0 };
  const worlds = [{ env: { id: 'quiet' }, count: 0 }, { env: arena, count: 0 }, { env: { id: 'busy' }, count: 3 }];
  assert.deepEqual(sortWorlds(worlds).map(item => item.env.id), ['basketball-arena', 'busy', 'quiet']);
  assert.equal(filterWorlds(worlds, 'basketball')[0].env.id, arena.id);
  assert.equal(filterAtlasLocations([arena], 'basketball')[0].mapId, arena.id);
  assert.equal(atlasLocationPosition(arena).mapId, arena.id);
  assert.equal(worldPreviewData(arena).basketball, true);
});

test('stadium return portals and incoming arrivals stay on the concourse, clear of the playing court',async()=>{
 const records=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 const environment={...records.find(map=>map.id==='basketball-arena'),travelPortals:[{mapId:'public-commons',name:'Public Commons'}]};
 const collision=new ServerBuilderCollision(),portals=worldTravelObjects(environment,collision);assert.equal(portals.length,1);assert.ok(Math.abs(portals[0].position.x)>=9||Math.abs(portals[0].position.z)>=16);
 const arrival=portalArrivalPosition(environment,compileBuilderScene({objects:portals}),'public-commons',collision,{},{});assert.ok(Math.abs(arrival.x)>8.12||Math.abs(arrival.z)>14.825);
});

test('existing saved stadium rooms refresh legacy return portals off the court after the upgrade',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'basketball-legacy-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const records=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 const environment={...records.find(map=>map.id==='basketball-arena'),contentUpdatedAt:'saved-court-v1',travelPortals:[{mapId:'public-commons',name:'Public Commons'}]};
 const store=new SharedRoomStore(join(directory,'rooms.json')),rooms=new AuthoritativeRooms({store,now:()=>100000});await rooms.snapshot(environment.id,environment);
 await store.update(environment.id,room=>{room.simulation.environmentUpdatedAt=environment.id+':'+environment.contentUpdatedAt+':'+JSON.stringify(environment.travelPortals);room.simulation.actors['world-return-0'].position={x:0,y:0,z:0};});
 const state=await new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>100050}).snapshot(environment.id,environment),portal=state.actors['world-return-0'];
 assert.ok(Math.abs(portal.position.x)>=9||Math.abs(portal.position.z)>=16);
});
