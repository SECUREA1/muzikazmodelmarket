import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {SPORTS_BUILDER_ITEMS} from '../public/js/builder-sports-catalog.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {createBasketballStadium} from '../public/js/basketball-stadium.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';

const source=await readFile(new URL('../environment-builder.js',import.meta.url),'utf8');
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const definitions=between('const gameplayModels=','// A broad, metre-scaled deployment library.');
const starters=vm.runInNewContext(`${definitions}\ngameplayModels`,{SPORTS_BUILDER_ITEMS,ARCADE_PARTS:[]});
const modelFor=id=>starters.find(item=>item.id===id);

test('every native sports item appears in its editor filter and survives scene compilation',()=>{
 const nodes=new Map(['#library-count','#library-grid'].map(id=>[id,{}]));
 const render=vm.runInNewContext(`${between('function renderLibrary(','function makeObject(')}\nrenderLibrary`,{
  activeFilter:'all',models:()=>starters,$:id=>nodes.get(id),libraryButton:item=>`<button data-model="${item.id}">${item.name}</button>`
 });
 let sequence=0;
 const make=vm.runInNewContext(`${between('function makeObject(','const generatedWorlds=')}\nmakeObject`,{
  modelFor,uid:()=>`sports-${++sequence}`,terrainHeight:()=>0,colors:['#fff'],defaultAvatarLook:()=>({})
 });
 for(const category of ['basketball','hockey']){
  render(category);
  const items=SPORTS_BUILDER_ITEMS.filter(item=>item.category===category);
  assert.ok(items.length>15,`${category} includes the complete stadium parts`);
  assert.equal(nodes.get('#library-count').textContent,items.length);
  for(const item of items)assert.ok(nodes.get('#library-grid').innerHTML.includes(`data-model="${item.id}"`),item.id);
  const scene=JSON.parse(JSON.stringify({id:category,layout:'grand-floor',objects:items.map(item=>make(item.id))}));
  const manifest=compileBuilderScene(scene);
  assert.equal(manifest.objectCount,items.length);
  manifest.objects.forEach((object,index)=>assert.equal(object.asset.buildAssetId,items[index].id));
 }
});

test('court pieces retain their authored floor and rim heights after editor grounding',()=>{
 const prepare=vm.runInNewContext(`${between('function prepareRoot(','async function templateFor(')}\nprepareRoot`,{THREE});
 for(const id of ['basketball-stadium','basketball-court','basketball-court-floor','hockey-rink','hockey-ice-surface']){
  const root=prepare(createBuilderModel(id),modelFor(id));
  const object={id,modelId:id,position:{x:2,y:0,z:3},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},groundOffset:0,materialSettings:{useAccent:false},avatarSettings:{},animationState:{speed:1}};
  const update=vm.runInNewContext(`${between('function updateTransform(','function rebuildAll(')}\nupdateTransform`,{THREE,runtime:new Map([[id,{root}]]),groundAt:()=>0,selectedId:null,modelFor});
  update(object);root.updateMatrixWorld(true);
  assert.equal(root.position.y,0,`${id} keeps its physical origin instead of lifting the slab`);
  if(id.startsWith('basketball-')&&id!=='basketball-court-floor'){
   const rims=[];root.traverse(node=>{if(node.name==='BASKETBALL_RIM')rims.push(node.getWorldPosition(new THREE.Vector3()));});
   assert.equal(rims.length,2);for(const rim of rims)assert.ok(Math.abs(rim.y-3.05)<1e-6);
  }
 }
});

test('the basketball template previews the full stadium with a cutaway and loads the same game geometry',()=>{
 const worldDressing=new THREE.Group(),sceneData={layout:'basketball-stadium'};
 const add=vm.runInNewContext(`${between('function addWorldDressing(','function shapeTerrain(')}\naddWorldDressing`,{THREE,sceneData,worldDressing,createBasketballStadium});
 add();
 const preview=worldDressing.children[0];
 assert.equal(preview.name,'MUZIKAZ_BASKETBALL_ARENA');
 assert.equal(preview.getObjectByName('ARENA_ROOF_CEILING').visible,false,'the editing view exposes the whole court');
 const game=createBuilderLand({id:'custom-court',builderScene:{layout:sceneData.layout,mapSize:80,objects:[]}});
 assert.equal(game.getObjectByName('ARENA_ROOF_CEILING').visible,true,'the saved game retains its complete roof');
 for(const name of ['BASKETBALL_RIM','ARENA_LIVE_JUMBOTRON','ARENA_TEAM_BENCH','ARENA_BROADCAST_LIGHT'])assert.ok(game.getObjectByName(name),name);
});

test('large arena items expand the editing land before placement',()=>{
 const sceneData={mapSize:40};let shapes=0;
 const ensure=vm.runInNewContext(`${between('function ensureItemFitsLand(','async function beginPlacement(')}\nensureItemFitsLand`,{sceneData,applyMapSize:size=>{sceneData.mapSize=size},shapeTerrain:()=>shapes++});
 ensure(modelFor('basketball-stadium'));assert.equal(sceneData.mapSize,80);assert.equal(shapes,1);
 ensure(modelFor('basketball-hoop'));assert.equal(sceneData.mapSize,80);assert.equal(shapes,1);
 ensure(modelFor('hockey-arena'));assert.equal(sceneData.mapSize,120);assert.equal(shapes,2);
});

test('the complete basketball venue fits the editing camera on narrow and wide screens',()=>{
 const worldDressing=new THREE.Group();worldDressing.add(createBasketballStadium(THREE));
 const bounds=new THREE.Box3().setFromObject(worldDressing);
 for(const aspect of [.55,1,1.8]){
  const camera=new THREE.PerspectiveCamera(48,aspect,.05,120),controls={maxDistance:55,target:new THREE.Vector3(),update(){camera.lookAt(this.target);camera.updateMatrixWorld();}};
  const frame=vm.runInNewContext(`${between('function frameBounds(','function updateLayout(')}\nframeSportsLayout`,{THREE,sceneData:{layout:'basketball-stadium'},worldDressing,camera,controls,world:{fog:{}}});
  frame();
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
   const projected=new THREE.Vector3(x,y,z).project(camera);
   assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1,`${aspect} aspect shows the entire venue`);
  }
 }
});

test('resizing to a mobile viewport refits the stadium instead of clipping its sides',()=>{
 const worldDressing=new THREE.Group();worldDressing.add(createBasketballStadium(THREE));
 const bounds=new THREE.Box3().setFromObject(worldDressing),camera=new THREE.PerspectiveCamera(48,1,.05,120);
 const controls={maxDistance:55,target:new THREE.Vector3(),update(){camera.lookAt(this.target);camera.updateMatrixWorld();}};
 const domElement={width:0,height:0,parentElement:{getBoundingClientRect:()=>({width:220,height:400})}};
 const renderer={domElement,getPixelRatio:()=>1,setSize(width,height){domElement.width=width;domElement.height=height;}};
 const api=vm.runInNewContext(`${between('function frameBounds(','function updateLayout(')}\n${between('function resize(){','function animate(){')}\n({frameSportsLayout,resize})`,{THREE,sceneData:{layout:'basketball-stadium'},worldDressing,camera,controls,renderer,world:{fog:{}}});
 api.frameSportsLayout();api.resize();assert.equal(camera.aspect,.55);
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  const projected=new THREE.Vector3(x,y,z).project(camera);
  assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1);
 }
});
