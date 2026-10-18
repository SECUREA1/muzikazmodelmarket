import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {ENTERABLE_BUILDINGS,BUILDING_DISTRICTS,createBuildingDistrict} from '../public/js/building-districts.js';
import {setBuildingCutaway,isBuildingRoof} from '../public/js/enterable-building-models.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {backpackPlacementModels} from '../public/js/builder-backpack-models.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
test('25 building shells have floors, open walk-in entrances and room for placed items',()=>{
 assert.equal(Object.keys(ENTERABLE_BUILDINGS).length,25);
 for(const [id,profile]of Object.entries(ENTERABLE_BUILDINGS)){
  const root=createBuilderModel(id);assert.equal(root.name,profile.name);assert.ok(root.userData.interiorBounds);assert.equal(root.userData.entrances.length,2);let floors=0;root.traverse(mesh=>{if(mesh.name.startsWith('BUILDER_WALKABLE_FLOOR'))floors++;});assert.ok(floors>=1);
  const environment={id,proceduralLand:true,builderScene:{layout:'urban-downtown',mapSize:160,objects:[{id:'building',modelId:id,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}}]}},collision=new ServerBuilderCollision();
  let p={x:0,y:0,z:-profile.depth/2-3};for(let i=0;i<Math.ceil((profile.depth/2+3)/.2);i++)p=collision.resolve(environment,p,{x:0,y:p.y-.04,z:p.z+.2},{});
  assert.ok(p.z>=-.21,id+' entrance is traversable');assert.ok(p.y>=.17&&p.y<=.2,id+' floor supports the player');
  const inside=collision.safeSpawn(environment,{x:2,y:.18,z:-profile.depth/2+2});assert.ok(inside.y>=.17&&inside.y<=.2,id+' interior has a safe arrival point');
 }
});
test('roof cutaway hides only roof groups, leaving floors and entry collision geometry intact',()=>{
 const root=createBuilderModel('dusty-saloon'),roof=root.getObjectByName('BUILDING_ROOF_dusty-saloon'),floor=root.getObjectByName('BUILDER_WALKABLE_FLOOR_dusty-saloon');assert.ok(roof);setBuildingCutaway(root,true);assert.equal(roof.visible,false);assert.equal(floor.visible,true);assert.equal(isBuildingRoof(roof.children[0]),true);assert.equal(isBuildingRoof(floor),false);setBuildingCutaway(root,false);assert.equal(roof.visible,true);
});
test('districts fit their expanded maps and provide playable spawns and independent furniture',()=>{
 for(const layout of Object.keys(BUILDING_DISTRICTS)){
  const scene=createBuildingDistrict(layout,40);assert.ok(scene.mapSize>=160);const manifest=compileBuilderScene(scene);assert.ok(manifest.spawn);
  const buildings=scene.objects.filter(item=>ENTERABLE_BUILDINGS[item.modelId]);assert.equal(buildings.length,BUILDING_DISTRICTS[layout].buildings.length);
  for(const object of buildings){const p=ENTERABLE_BUILDINGS[object.modelId];assert.ok(Math.abs(object.position.x)+p.width/2<scene.mapSize/2);assert.ok(Math.abs(object.position.z)+p.depth/2+5<scene.mapSize/2);}
  if(layout==='urban-building-showcase')assert.equal(buildings.length,25);else assert.ok(scene.objects.some(item=>item.groundOffset===.18));
 }
});
test('owned Backpack models preserve custom drawing settings and published model definitions inside a building',()=>{
 const configuration={extruded:true,depth:70,yaw:30,collisionMask:Array(256).fill(255),behavior:'quest',quest:{title:'Tavern supplies',requiredItems:['supply-crate']}},models=backpackPlacementModels({assets:[{id:'pack-chair',name:'Chair',function_data:{buildAssetId:'armchair'}}]},{ownedAssets:[{id:'custom-art',name:'Quest painting',type:'custom-item',format:'svg',renderKind:'image',thumbnailUrl:'data:image/png;base64,art',configuration},{id:'land',type:'land-deed'}]});
 assert.equal(models.length,2);assert.ok(models.every(model=>model.category==='backpack'));const art=models.find(model=>model.sourceId==='custom-art');assert.equal(art.renderKind,'image');assert.deepEqual(art.configuration,configuration);assert.equal(art.function_data.quest.title,'Tavern supplies');
 const saved=JSON.parse(JSON.stringify({mapSize:160,layout:'urban-downtown',placedModels:models,objects:[{id:'tavern',modelId:'frontier-tavern',position:{x:0,y:0,z:0}},{id:'painting',modelId:art.id,position:{x:3,y:.18,z:-2},functionalSettings:art.function_data}]})),manifest=compileBuilderScene(saved);assert.equal(manifest.actors.find(item=>item.objectId==='painting').gameplay.behavior,'quest');assert.equal(saved.placedModels.find(item=>item.id===art.id).configuration.depth,70);const world=new ServerBuilderCollision().world({id:'saved-interior',proceduralLand:true,builderScene:saved});assert.ok(world.walls.some(wall=>wall.objectId==='painting'));
});
test('building models and thumbnails are available through the native Backpack catalog',async()=>{
 const catalog=JSON.parse(await readFile('public/models/backpack-assets.json','utf8'));
 for(const [id,profile]of Object.entries(ENTERABLE_BUILDINGS)){const item=catalog.assets.find(item=>item.buildAssetId===id);assert.ok(item);assert.equal(item.builderCategory,'buildings');const svg=await readFile('.'+profile.thumbnailUrl,'utf8');assert.match(svg,/<title/);assert.match(svg,/<desc/);}
});
