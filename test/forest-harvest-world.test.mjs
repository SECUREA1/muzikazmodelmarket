import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {forestHarvestWorld} from '../forest-harvest-world.mjs';
import {FOREST_TREES,FOREST_STATIONS,FOREST_VEHICLES,FOREST_PLOTS} from '../public/js/forest-harvest-config.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {WorldAtlas} from '../world-atlas.mjs';
import {mapSectorKind,mapWheelSvg} from '../public/js/map-wheel-svg.js';
import {filterWorldCategory,filterWorlds} from '../public/js/world-map-picker.js';
import * as THREE from '../public/vendor/three/three.module.min.js';

test('forest destination remains registered offline and in the shared world directory',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'forest-world-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const manifest=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 assert.deepEqual(manifest.filter(map=>map.id==='forest-harvest'),[forestHarvestWorld()]);
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),[]);
 const map=environments.find(map=>map.id==='forest-harvest');assert.ok(map?.permanent&&map.multiplayer&&map.sharedWorld);
 assert.equal(mapSectorKind(map),'forest');assert.equal(map.roomId,'forest-harvest');
 assert.ok(map.portalTargets.includes('world-item-factory'));assert.ok(map.portalTargets.includes('skyscraper-construction'));
 for(const id of ['world-item-factory','skyscraper-construction'])assert.ok(environments.find(map=>map.id===id).portalTargets.includes('forest-harvest'));
 const rows=environments.map(env=>({env,count:0}));
 assert.equal(filterWorldCategory(rows,'forest')[0].env.id,'forest-harvest');
 assert.ok(filterWorlds(rows,'lumber furniture').some(row=>row.env.id==='forest-harvest'));
 assert.match(mapWheelSvg([{env:map,count:0}],map.id),/Forest Harvest/);
});

test('forestry stations, plot access and haul roads have supported clear ground',()=>{
 const map=forestHarvestWorld(),collision=new ServerBuilderCollision();
 const points=[map.spawn,...FOREST_STATIONS.map(station=>station.approach),...FOREST_PLOTS.map(plot=>({x:plot.center.x-24,y:.02,z:plot.center.z+17}))];
 for(const point of points){const floor=collision.groundAt(map,point,{entry:true});assert.ok(floor,'floor at '+JSON.stringify(point));assert.ok(collision.hasBodyClearance(map,floor,.38),'body clearance at '+JSON.stringify(point));}
 for(const vehicle of FOREST_VEHICLES){const object=map.builderScene.objects.find(object=>object.id===vehicle.id);assert.equal(object.functionalSettings.behavior,'vehicle');assert.equal(object.functionalSettings.forestVehicleId,vehicle.id);}
 let current={x:0,y:.02,z:69};
 for(const target of [{x:0,z:59},{x:0,z:-60},{x:-110,z:-60},{x:110,z:-60},{x:0,z:-60},{x:0,z:-120},{x:0,z:3},{x:102,z:3},{x:102,z:59}]){
  const origin={...current},steps=Math.ceil(Math.hypot(target.x-origin.x,target.z-origin.z)/.25);
  for(let i=1;i<=steps;i++)current=collision.resolve(map,current,{x:origin.x+(target.x-origin.x)*i/steps,y:current.y-.03,z:origin.z+(target.z-origin.z)*i/steps});
  assert.ok(Math.hypot(current.x-target.x,current.z-target.z)<.35,'connected haul road reaches '+JSON.stringify(target));
 }
 collision.clearPlacedWorlds();
});

test('instanced forest follows felling, stump removal and species replacement without static tree colliders',()=>{
 const scene=createBuilderLand(forestHarvestWorld()),tree=FOREST_TREES[0],index=0,matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),position=new THREE.Vector3(),rotation=new THREE.Quaternion();
 const treeScale=species=>{scene.getObjectByName('FOREST_'+species+'_trunk').getMatrixAt(index,matrix);matrix.decompose(position,rotation,scale);return scale.x;};
 assert.equal(scene.userData.forestTreeCount,48);assert.ok(scene.userData.forestDrawBatches<=36);
 assert.equal(treeScale(tree.speciesId),1);
 scene.userData.setForestHarvestState({trees:{[tree.id]:{...tree,phase:'felled'}},logs:{}});
 assert.equal(treeScale(tree.speciesId),0);
 const fallen=scene.getObjectByName('FOREST_'+tree.speciesId+'_fallen');fallen.getMatrixAt(index,matrix);matrix.decompose(position,rotation,scale);assert.equal(scale.x,1);
 scene.userData.setForestHarvestState({trees:{[tree.id]:{...tree,speciesId:'walnut',phase:'standing'}},logs:{a:{id:'a',position:{x:10,z:15}}}});
 assert.equal(treeScale(tree.speciesId),0);assert.equal(treeScale('walnut'),1);
 scene.getObjectByName('FOREST_BUCKED_LOGS').getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);assert.equal(scale.x,1);assert.equal(position.x,10);
 scene.userData.setForestHarvestState({trees:{[tree.id]:{...tree,phase:'cleared'}},logs:{}});assert.equal(treeScale(tree.speciesId),0);
 scene.traverse(node=>{if(node.isInstancedMesh)assert.equal(node.userData.collisionDisabled,true);});
 const geometries=new Set(),materials=new Set();scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of [].concat(node.material||[]))materials.add(material);});for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
});
