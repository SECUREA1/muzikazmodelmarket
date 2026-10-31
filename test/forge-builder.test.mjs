import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {forgeWorld} from '../forge-world.mjs';
import {FORGE_ITEMS,forgeItemSettings} from '../public/js/forge-items.js';
import {FORGE_BUILDER_LAYOUT,createForgeBuilderScene,editableForgeScene,forgeBuilderLayoutMeta} from '../public/js/forge-builder.js';
import {isForgeEnvironment,forgeStations} from '../public/js/forge-config.js';
import {editableMapScene,nativeItemGameplay,mapSourceLayout} from '../public/js/editable-map-import.js';
import {BUILDER_SECTIONS,builderSections,libraryModels} from '../public/js/builder-library.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';

const world=scene=>({id:scene.id,game:scene.sourceGame,forge:scene.sourceForge,builderScene:scene});

test('forge map copies retain independent objects, gameplay, residents and station working points',()=>{
 const source=forgeWorld(),before=structuredClone(source),draft=editableMapScene(source,{id:'my-forge'});
 assert.deepEqual(source,before,'copying never changes the permanent forge');
 assert.equal(draft.sourceGame,'forge');assert.equal(draft.sourceLayout,'forge');assert.ok(draft.sourceForge.enabled);assert.ok(isForgeEnvironment(world(draft)));
 assert.equal(draft.objects.length,source.builderScene.objects.length);assert.deepEqual(draft.objects,source.builderScene.objects);
 assert.deepEqual(draft.sourceSpawn,source.spawn);assert.ok(draft.layoutMeta.residents.length>=3);assert.ok(draft.layoutMeta.locations.length>=6);
 const stations=forgeStations(world(draft));assert.ok(stations.length>=6);
 const station=stations[0],object=draft.objects.find(row=>row.id===station.id);assert.ok(object);
 object.position.x+=10;object.rotation.y=Math.PI/2;object.scale={x:1.5,y:1,z:2};
 const moved=forgeStations(world(draft)).find(row=>row.id===station.id);assert.equal(moved.position.x,object.position.x);assert.notDeepEqual(moved.approach,station.approach);
 assert.deepEqual(source,before);
 const manifest=compileBuilderScene(draft);assert.equal(manifest.objects.length,draft.objects.length);assert.ok(manifest.actors.some(row=>row.gameplay.forgeStation));
});

test('forge save and restore keep moved, disabled and deleted stations without respawning them',()=>{
 const scene=createForgeBuilderScene({id:'forge-draft'}),station=scene.objects.find(row=>typeof row.functionalSettings?.forgeStation==='string');assert.ok(station);
 station.position={x:12,y:0,z:9};station.functionalSettings.active=false;
 const removed=scene.objects.find(row=>row.id!==station.id&&typeof row.functionalSettings?.forgeStation==='string');assert.ok(removed);
 scene.objects=scene.objects.filter(row=>row.id!==removed.id);
 const once=editableForgeScene(scene),twice=editableForgeScene(once);assert.deepEqual(twice.objects,scene.objects);
 const active=forgeStations(world(twice));assert.ok(!active.some(row=>row.id===station.id));assert.ok(!active.some(row=>row.id===removed.id));
 const meta=forgeBuilderLayoutMeta(twice,FORGE_BUILDER_LAYOUT);assert.ok(meta.forge.enabled);assert.deepEqual(meta.residents,scene.layoutMeta.residents);assert.ok(meta.locations.every(row=>row.id!==station.id&&row.id!==removed.id),'disabled and deleted workstations disappear from navigation');
 assert.deepEqual(forgeStations(world(editableForgeScene({...twice,objects:[]}))),[],'clearing a draft keeps it empty');
});

test('forge library has every priced native item and authored gameplay survives compilation',()=>{
 assert.ok(BUILDER_SECTIONS.some(([id])=>id==='forge'));assert.equal(mapSourceLayout({game:'forge'}),'forge');
 const models=Object.entries(FORGE_ITEMS).map(([id,item])=>({id,buildAssetId:id,name:item.name,...nativeItemGameplay(id)}));
 assert.equal(libraryModels(models,'forge').length,Object.keys(FORGE_ITEMS).length);
 for(const model of models){const settings=forgeItemSettings(model.id);assert.ok(builderSections(model).has('forge'));assert.equal(model.priceMzk,FORGE_ITEMS[model.id].priceMzk);assert.deepEqual(model.function_data,settings);}
 const js=readFileSync(new URL('../environment-builder.js',import.meta.url),'utf8'),html=readFileSync(new URL('../environment-builder.html',import.meta.url),'utf8');
 assert.match(js,/forgeBuilderLayoutMeta\(sceneData/);assert.match(js,/createForgeBuilderScene/);assert.match(js,/sourceForge/);assert.match(html,/id="forge-station-role"/);assert.match(html,/id="forge-crew-greeting"/);
});
