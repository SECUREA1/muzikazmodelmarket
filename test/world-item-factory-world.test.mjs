import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {worldItemFactoryWorld} from '../world-item-factory-world.mjs';
import {WORLD_ITEM_FACTORY_ID,WORLD_ITEM_FACTORY_STATIONS,nearestWorldFactoryStation} from '../public/js/world-item-factory-config.js';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {WorldAtlas} from '../world-atlas.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {mapSectorKind,mapWheelSvg} from '../public/js/map-wheel-svg.js';
import {filterWorlds,filterWorldCategory,sortWorlds} from '../public/js/world-map-picker.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {shippingWorld} from '../shipping-world.mjs';
import {missileFactoryWorld} from '../missile-factory-world.mjs';

test('World Item Factory is a permanent, featured, searchable map in both the runtime and offline directory',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'item-factory-map-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const manifest=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 assert.equal(manifest.filter(map=>map.id===WORLD_ITEM_FACTORY_ID).length,1);
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),[]),map=environments.find(map=>map.id===WORLD_ITEM_FACTORY_ID);
 assert.ok(map?.permanent&&map.playable&&map.multiplayer&&map.sharedWorld);assert.equal(map.roomId,WORLD_ITEM_FACTORY_ID);
 assert.match(map.playUrl,/environment=world-item-factory/);assert.equal(mapSectorKind(map),'factory');
 assert.ok(map.portalTargets.includes('hormuz-shipping'));assert.ok(map.portalTargets.includes('public-commons'));
 assert.equal(environments.find(map=>map.id==='hormuz-shipping').portalTargets.includes(WORLD_ITEM_FACTORY_ID),true);
 const rows=environments.map(env=>({env,count:0}));assert.equal(sortWorlds(rows)[0].env.id,WORLD_ITEM_FACTORY_ID);
 assert.ok(filterWorlds(rows,'World Item Factory').some(row=>row.env.id===WORLD_ITEM_FACTORY_ID));
 assert.ok(filterWorldCategory(rows,'factory').some(row=>row.env.id===WORLD_ITEM_FACTORY_ID));
 assert.match(mapWheelSvg([{env:map,count:0}],map.id),/World Factory/);
 for(const source of [shippingWorld(),missileFactoryWorld()])assert.ok(source.builderScene.objects.some(object=>object.functionalSettings?.portal?.targetMapId===WORLD_ITEM_FACTORY_ID));
 for(const object of map.builderScene.objects)assert.ok(GAME_ECONOMY.some(item=>item.buildAssetId===object.modelId),object.modelId+' uses the existing marketplace item');
});

test('all four physical stations have reachable operator pads and shared server/browser geometry',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'item-factory-walk-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const map=worldItemFactoryWorld(),runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>1000000});
 const state=await runtime.command(map.id,map,{accountId:'factory-map-reviewer',username:'Reviewer'},{action:'join',requestId:'factory-arrive',radToxEnabled:false,deferRadTox:true});
 assert.equal(state.players[state.selfId].health,100);assert.equal(state.radTox,null);
 let current={...state.players[state.selfId].position};
 const route=[[0,0],[-36,-13],[-12,-13],[12,-13],[36,-13],[0,0],[22,43],[22,49],[22,43],[-22,43],[-22,49]];
 for(const [x,z] of route){
  const origin={...current},distance=Math.hypot(x-origin.x,z-origin.z),steps=Math.ceil(distance/.2);
  for(let step=1;step<=steps;step++){const fraction=step/steps;current=runtime.collision.resolve(map,current,{x:origin.x+(x-origin.x)*fraction,y:current.y-.03,z:origin.z+(z-origin.z)*fraction},state.actors,state.objects);}
  assert.ok(Math.hypot(current.x-x,current.z-z)<.25,'connected walking path reaches '+x+','+z+' from '+JSON.stringify(current));
 }
 for(const station of WORLD_ITEM_FACTORY_STATIONS){
  const floor=runtime.collision.groundAt(map,station.approach,{entry:true,actors:state.actors,objects:state.objects});assert.ok(floor,station.name);
  assert.ok(runtime.collision.hasBodyClearance(map,floor,.38,{actors:state.actors,objects:state.objects}),station.name+' operator pad is clear');
  assert.equal(nearestWorldFactoryStation(map,station.approach)?.stageId,station.stageId);
 }
 const scene=createBuilderLand(map);assert.equal(scene.userData.worldItemFactory,true);
 assert.ok(scene.children.some(child=>child.name==='FACTORY_GANTRY_BEAM'));
 scene.traverse(object=>{object.geometry?.dispose();for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[])material.dispose();});
});
