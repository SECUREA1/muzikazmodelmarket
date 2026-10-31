import test from 'node:test';
import assert from 'node:assert/strict';
import {bunkerDefenseReading} from '../public/js/bunker-defense-ui.js';
import {bunkerMarketKits,isBunkerMarketItem} from '../public/js/bunker-market.js';
import {GAME_ECONOMY,GAME_BUNDLES} from '../game-economy.mjs';
import {bunkerWorld} from '../bunker-world.mjs';
import {nativeMarketCatalog} from '../native-market-catalog.mjs';

test('defense reading follows current player cover, real alert, crew response and active objective',()=>{
 const state={bunkerDefense:{alarm:{id:'strike',active:true,kind:'airstrike',level:'warning',message:'Descend and seal the shutter.'},systems:{power:{ready:true},filtration:{ready:true},sealed:true},protection:{surface:{underground:false,blastProtected:false,falloutProtected:false},inside:{underground:true,blastProtected:true,falloutProtected:true}}},players:{inside:{vehicleMission:{status:'active',title:'Seal the vault',index:1,checkpoints:[{name:'Seal shutter'},{name:'Enable filtration'}]}}},actors:{rook:{id:'rook',active:true,resident:{bunker:true,name:'Rook',bunkerResponse:{message:'Checking filtration'}}},visitor:{id:'visitor',resident:{name:'Visitor'}}}};
 const exposed=bunkerDefenseReading(state,'surface'),protectedVisitor=bunkerDefenseReading(state,'inside');
 assert.equal(exposed.cover,'Outside underground cover');assert.equal(exposed.protection.blastProtected,false);
 assert.equal(protectedVisitor.cover,'Underground cover');assert.equal(protectedVisitor.protection.falloutProtected,true);
 assert.equal(protectedVisitor.status,'Descend and seal the shutter.');assert.equal(protectedVisitor.point.name,'Enable filtration');assert.equal(protectedVisitor.crew.length,1);assert.equal(protectedVisitor.crew[0].resident.bunkerResponse.message,'Checking filtration');
 assert.equal(bunkerDefenseReading(null,'inside'),null);
});

test('curated bunker kits route all equipment through canonical priced market SKUs and existing bundles',()=>{
 const world=bunkerWorld(),catalog=nativeMarketCatalog(GAME_ECONOMY,[world]),items=catalog.items.filter(isBunkerMarketItem),map=catalog.maps[0];
 assert.equal(items.length,24);assert.equal(isBunkerMarketItem(map),true);
 const kits=bunkerMarketKits([...catalog.items,...catalog.maps]);assert.equal(kits.length,3);assert.equal(kits.reduce((sum,kit)=>sum+kit.items.length,0),12);
 for(const kit of kits)for(const item of kit.items){assert.ok(item.sku.startsWith('native:bunker-'));assert.ok(item.priceMzk>0);assert.ok(map.components.some(component=>component.sku===item.sku));assert.ok(GAME_BUNDLES.some(bundle=>bundle.entries.some(entry=>entry.sku===item.sku)),'canonical item included in normal market bundles');}
 assert.equal(isBunkerMarketItem({buildAssetId:'unrelated'}),false);
});

test('server alarm projection controls a placed beacon without changing its authored transform',async()=>{
 const {createBuilderModel,updateBuilderModels}=await import('../public/js/builder-models-3d.js');
 const {projectServerActor}=await import('../public/js/server-scene-projection.js');
 const root=createBuilderModel('bunker-alarm-beacon');
 const actor={id:'alarm',modelId:'bunker-alarm-beacon',position:{x:3,y:-9,z:4},rotation:{x:0,y:.3,z:0},active:true,bunkerAlertState:{id:'incoming',level:'danger',phase:'impact',threat:'airstrike'}};
 projectServerActor(root,actor);updateBuilderModels(root,2);
 assert.deepEqual(root.userData.bunkerAlertState,actor.bunkerAlertState);assert.deepEqual(root.position.toArray(),[3,-9,4]);
 const indicator=[];root.traverse(node=>{if(node.userData.bunkerAlarm)indicator.push(node);});assert.ok(indicator.length);
 assert.ok(indicator.every(node=>node.material.color.getHex()===0xff5466));
 actor.bunkerAlertState={id:'incoming',level:'all-clear',phase:'all-clear',threat:'airstrike'};projectServerActor(root,actor);updateBuilderModels(root,3);
 assert.ok(indicator.every(node=>node.material.color.getHex()===0x8dde6b));
});

test('legacy compact snapshots retain decor beacons when their alarm state changes',async()=>{
 const {compactRoomSnapshot}=await import('../public/js/room-snapshot.js');
 const state={sceneVersion:'alarm-map',actors:{beacon:{id:'beacon',health:100,active:true,definition:{gameplay:{behavior:'decor'}},bunkerAlertState:{level:'danger'}}}};
 const compact=compactRoomSnapshot(state,{action:'input',snapshotMode:'compact',sceneVersion:'alarm-map',snapshotProtocol:1},{id:'bunker'});
 assert.equal(compact.actors.beacon.bunkerAlertState.level,'danger');
});

test('surface airstrike effects follow impact timing and never appear inside the protected rooms',async()=>{
 const THREE=await import('../public/vendor/three/three.module.min.js');
 const {createBunkerStrikeEffects}=await import('../public/js/bunker-strike-effects.js');
 const scene=new THREE.Scene(),effects=createBunkerStrikeEffects({scene}),world=bunkerWorld();
 const snapshot={serverTime:10000,bunkerDefense:{airstrike:{id:'strike',phase:'impact',impactAt:10000}}};
 effects.update(snapshot,world,{x:0,y:0,z:70},1);assert.equal(effects.snapshot().visible,true);assert.equal(scene.getObjectByName('BUNKER_SURFACE_AIRSTRIKES').children.length,3);
 effects.update(snapshot,world,{x:0,y:-12,z:26},1.5);assert.equal(effects.snapshot().visible,false);
 effects.update(snapshot,world,{x:0,y:0,z:70},2,{reducedMotion:true});
 scene.getObjectByName('BUNKER_SURFACE_AIRSTRIKES').traverse(node=>{if(/AIRSTRIKE_FLASH|AIRSTRIKE_PRESSURE/.test(node.name))assert.equal(node.visible,false);});
 effects.update({...snapshot,serverTime:24000},world,{x:0,y:0,z:70},3);assert.equal(effects.snapshot().visible,false);
 effects.dispose();assert.equal(scene.children.length,0);
});

test('editable bunker copies retain underground emergency objectives and protection wiring',async()=>{
 const {editableMapScene}=await import('../public/js/editable-map-import.js');
 const {doomsdayForEnvironment}=await import('../public/js/doomsday-config.js');
 const {bunkerDefenseConfig}=await import('../public/js/bunker-defense-rules.js');
 const world=bunkerWorld(),scene=editableMapScene(world,{id:'custom-defense'}),copy={id:'custom-defense',source:'custom-builder',spawn:world.spawn,builderScene:scene};
 const objectives=doomsdayForEnvironment(copy).objectives;assert.equal(objectives.length,3);assert.ok(objectives.every(objective=>objective.position.y<-10));
 const config=bunkerDefenseConfig(copy);assert.ok(config?.enabled);assert.equal(config.undergroundLevel,-12);assert.ok(scene.objects.some(object=>object.id===config.stations.filtration));
});

test('nearby alert consoles open live shelter controls only within actual interaction reach',async()=>{
 const {nearestBunkerControl}=await import('../public/js/bunker-defense-ui.js');
 const world=bunkerWorld(),actors={console:{id:'console',modelId:'bunker-alert-console',position:{x:0,y:-12,z:26},active:true,definition:{gameplay:{bunkerSystem:'alerts',interactionDistance:3.5}}}};
 assert.equal(nearestBunkerControl({actors},{x:1,y:-12,z:26},world)?.id,'console');
 assert.equal(nearestBunkerControl({actors},{x:0,y:0,z:26},world),null,'surface point directly above cannot use the underground console');
 assert.equal(nearestBunkerControl({actors},{x:0,y:-12,z:31},world),null);
 actors.console.active=false;assert.equal(nearestBunkerControl({actors},{x:0,y:-12,z:26},world),null);
});
