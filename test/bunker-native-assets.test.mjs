import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {BUNKER_ITEMS,bunkerItemSettings} from '../public/js/bunker-items.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {nativeBuilderItem} from '../public/js/native-builder-items.js';
import {builderSections,libraryModels} from '../public/js/builder-library.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
import {setBuildingCutaway} from '../public/js/enterable-building-models.js';
import {cloneBuilderRuntime} from '../public/js/builder-runtime-clone.js';

test('bunker collection has renderable, bounded native models and real vector artwork',async()=>{
 assert.equal(BUNKER_ITEMS.length,24);
 for(const item of BUNKER_ITEMS){
  const root=createBuilderModel(item.id);assert.ok(root,item.id);assert.equal(root.userData.modelId,item.id);
  let meshes=0,triangles=0,lights=0;root.traverse(node=>{lights+=Boolean(node.isLight);if(!node.isMesh)return;meshes++;const geo=node.geometry,pos=geo.attributes.position;assert.ok(pos?.count);for(const value of pos.array)assert.ok(Number.isFinite(value),item.id);triangles+=(geo.index?.count||pos.count)/3;});
  assert.ok(meshes>=5&&meshes<100,item.id+' has authored geometry within a reuse budget');assert.ok(triangles<30000,item.id);assert.equal(lights,0);
  const bounds=new T.Box3().setFromObject(root);assert.ok([...bounds.min,...bounds.max].every(Number.isFinite));assert.ok(bounds.min.y>=-.04,item.id+' remains grounded');const size=bounds.getSize(new T.Vector3());if(item.id==='bunker-access-stairs')assert.ok(size.x<6.7&&size.y<16.4&&size.z<33.5);else if(item.id==='bunker-blast-shutter')assert.ok(size.x<6.7&&size.y<4.3&&size.z<1.1);else assert.ok(Math.max(...size)<4.1,item.id);
  const svg=await readFile(new URL('..'+nativeBuilderItem(item.id).thumbnailUrl,import.meta.url),'utf8');assert.match(svg,/<svg/);assert.match(svg,/<title/);assert.doesNotMatch(svg,/<image\b|https?:\/\/(?!www.w3.org)/);
 }
});

test('physical bunker floor alone is offered for authoritative safe arrivals',()=>{
 for(const id of ['bunker-floor','bunker-ceiling']){
  const root=createBuilderModel(id),floors=[];root.traverse(node=>{if(node.userData.walkableFloor)floors.push(node);});
  assert.equal(floors.length,id==='bunker-floor'?1:0);
  if(floors.length){assert.match(floors[0].name,/^BUILDER_WALKABLE_FLOOR/);const bounds=new T.Box3().setFromObject(floors[0]);assert.ok(Math.abs(bounds.max.y-.2)<1e-7);}
 }
});

test('every bunker SKU retains native identity and supported controls in a purchased placement',()=>{
 for(const authored of BUNKER_ITEMS){
  const offers=GAME_ECONOMY.filter(item=>item.buildAssetId===authored.id);assert.equal(offers.length,1,authored.id+' has one canonical offer');const offer=offers[0];assert.equal(offer.sku,'native:'+authored.id);assert.equal(offer.priceMzk,authored.priceMzk);assert.equal(offer.function_data.behavior,authored.behavior);assert.equal(offer.format,'procedural-3d');
  const normalized=normalizeCatalogModel(offer,0);assert.equal(normalized.buildAssetId,authored.id);assert.equal(normalized.behavior,authored.behavior);assert.ok(builderSections(normalized).has('bunker'));
  if(authored.behavior==='talk')assert.ok(normalized.dialogueSettings?.text,authored.id+' keeps guidance');
 }
 assert.equal(libraryModels(BUNKER_ITEMS,'bunker').length,24);
 assert.equal(bunkerItemSettings('bunker-med-station').value,35);assert.equal(bunkerItemSettings('bunker-power-core').behavior,'switch');assert.equal(bunkerItemSettings('bunker-blast-door').behavior,'door');assert.equal(bunkerItemSettings('bunker-bunk').behavior,'seat');
});

test('bunker local effects preserve placement and clone materials remain independent',()=>{
 const root=createBuilderModel('bunker-power-core');root.position.set(2,3,4);root.rotation.y=.25;const placement=[...root.position,...root.quaternion,...root.scale];updateBuilderModels(root,2);assert.deepEqual([...root.position,...root.quaternion,...root.scale],placement);
 const rotor=root.getObjectByName('CORE_ROTATING_INDUCTION_RING');assert.ok(rotor.rotation.y!==0);const first=rotor.rotation.y;updateBuilderModels(root,2);assert.equal(rotor.rotation.y,first);
 root.userData.animationState={enabled:false};updateBuilderModels(root,4);assert.equal(rotor.rotation.y,first);
 const copy=cloneBuilderRuntime(root);assert.ok(copy.getObjectByName('CORE_ROTATING_INDUCTION_RING'));root.userData.animationState={enabled:true};copy.userData.animationState={enabled:true};updateBuilderModels(copy,6);assert.equal(rotor.rotation.y,first);assert.notEqual(copy.getObjectByName('CORE_ROTATING_INDUCTION_RING').rotation.y,first);
 const originalLamp=root.getObjectByName('INDUCTION_MARKER'),copiedLamp=copy.getObjectByName('INDUCTION_MARKER');assert.notEqual(originalLamp.material,copiedLamp.material);const intensity=originalLamp.material.emissiveIntensity;copiedLamp.material.emissiveIntensity=.11;assert.equal(originalLamp.material.emissiveIntensity,intensity);
});


test('moving bunker crew never leave static collision bodies and react to resident speech',()=>{
 for(const id of ['bunker-hacker','bunker-engineer']){
  const root=createBuilderModel(id);assert.equal(root.userData.collider,false);root.traverse(node=>{if(node.isMesh)assert.equal(node.userData.collisionDisabled,true);});
  root.userData.residentState={moving:true,speaking:true};updateBuilderModels(root,1);assert.ok(Math.abs(root.getObjectByName('BUNKER_LEFT_LEG').rotation.x)>0);const speaking=root.getObjectByName('BUNKER_HEAD').rotation.x;root.userData.residentState={moving:false,speaking:false};updateBuilderModels(root,1);assert.equal(root.getObjectByName('BUNKER_LEFT_LEG').rotation.x,0);assert.notEqual(root.getObjectByName('BUNKER_HEAD').rotation.x,speaking);
 }
});

test('shared authoritative switch state wins over stale local glow state',()=>{
 const root=createBuilderModel('bunker-power-core'),indicator=root.getObjectByName('CORE_PRESSURE_DISPLAY_CODE_LINE');
 root.userData.switched=true;root.userData.serverSwitched=false;updateBuilderModels(root,1);assert.equal(indicator.material.emissiveIntensity,.1);
 root.userData.switched=false;root.userData.serverSwitched=true;updateBuilderModels(root,1);assert.ok(indicator.material.emissiveIntensity>.5);
});

test('bunker ceilings use the existing Builder interior-view control without changing gameplay metadata',()=>{const ceiling=createBuilderModel('bunker-ceiling');assert.equal(ceiling.visible,true);setBuildingCutaway(ceiling,true);assert.equal(ceiling.visible,false);setBuildingCutaway(ceiling,false);assert.equal(ceiling.visible,true);});


test('the protected descent has an exact upward walkable ramp and a removable tunnel roof',()=>{
 const root=createBuilderModel('bunker-access-stairs'),floor=root.getObjectByName('BUILDER_WALKABLE_FLOOR_BUNKER_ACCESS');
 assert.equal(floor.userData.walkableFloor,true);root.updateMatrixWorld(true);
 for(const z of [-15.9,-8,0,8,15.9]){
  const hit=new T.Raycaster(new T.Vector3(0,25,z),new T.Vector3(0,-1,0)).intersectObject(floor,false)[0];
  assert.ok(hit,'walkable descent at '+z);assert.ok(Math.abs(hit.point.y-(.2+(z+16)*.375))<1e-5);assert.ok(hit.face.normal.y>.9);
 }
 const roof=root.getObjectByName('DESCENT_OVERHEAD_ROOF');assert.equal(roof.userData.buildingRoof,true);setBuildingCutaway(root,true);assert.equal(roof.visible,false);assert.equal(floor.visible,true);
});

test('new defense equipment keeps supported native roles and powered filtration',()=>{
 const roles={'bunker-alert-console':['talk','alerts'],'bunker-alarm-beacon':['decor','alarm'],'bunker-filtration-unit':['switch','filtration'],'bunker-blast-shutter':['door','blast-door'],'bunker-radiation-monitor':['talk','radiation'],'bunker-emergency-locker':['talk','supplies'],'bunker-water-reserve':['talk','water']};
 for(const [id,[behavior,role]]of Object.entries(roles)){assert.equal(bunkerItemSettings(id).behavior,behavior);assert.equal(bunkerItemSettings(id).bunkerSystem,role);}
 const filter=createBuilderModel('bunker-filtration-unit'),rotor=filter.getObjectByName('LIFE_SUPPORT_IMPELLER');filter.userData.serverSwitched=false;updateBuilderModels(filter,2);assert.equal(rotor.rotation.z,0);filter.userData.serverSwitched=true;updateBuilderModels(filter,2);assert.equal(rotor.rotation.z,4);
});

test('alarms follow live warning states with isolated materials and static reduced-motion indicators',()=>{
 const root=createBuilderModel('bunker-alarm-beacon'),copy=cloneBuilderRuntime(root),lamp=root.getObjectByName('EMERGENCY_SIGNAL_DOME'),other=copy.getObjectByName('EMERGENCY_SIGNAL_DOME');
 assert.notEqual(lamp.material,other.material);root.userData.bunkerAlertState={level:'danger'};root.userData.animationState={enabled:false};updateBuilderModels(root,2);assert.equal(lamp.material.color.getHex(),0xff5466);assert.equal(lamp.material.emissiveIntensity,.95);assert.notEqual(other.material.color.getHex(),lamp.material.color.getHex());
 root.userData.animationState={enabled:true};root.userData.residentState={reducedMotion:true};root.userData.bunkerAlertState={level:'all-clear'};updateBuilderModels(root,3);assert.equal(lamp.material.color.getHex(),0x8dde6b);assert.equal(lamp.material.emissiveIntensity,.45);
});


test('the protected descent remains clear for a player along its full physical slope',()=>{
 const collision=new ServerBuilderCollision(),environment={id:'bunker-access-asset-regression',proceduralLand:true,builderScene:{layout:'underground-bunker',mapSize:80,objects:[{id:'physical-descent',modelId:'bunker-access-stairs',asset:{buildAssetId:'bunker-access-stairs'},position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},placementAnchor:'collider-base',functionalSettings:{behavior:'decor'}}]}};
 try{for(let z=-15;z<=15;z+=1){const point={x:0,y:.22+(z+16)*.375,z};assert.equal(collision.hasBodyClearance(environment,point,.38),true,'player clearance at descent z='+z);}}
 finally{collision.clearWorlds();}
});
