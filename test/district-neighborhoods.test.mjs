import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DISTRICT_DESIGNS,districtNeighborhood} from '../district-neighborhoods.mjs';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {districtDestinations,districtLocations} from '../public/js/district-map.js';
import {INTERACTIVE_DEVICES} from '../public/js/interactive-devices.js';
test('eight custom districts have unique landmarks made of renderable destructible catalog parts',()=>{
 const titles=new Set(),signatures=new Set(),ids=new Set();
 for(const region of Object.keys(DISTRICT_DESIGNS)){
  const result=districtNeighborhood({atlasDistrict:{id:region,page:0}});titles.add(result.title);signatures.add(JSON.stringify(result.objects.map(item=>[item.modelId,item.position])));assert.ok(result.locations.length>=3);assert.ok(result.objects.length>100);
  assert.equal(new Set(result.objects.map(item=>item.id)).size,result.objects.length);
  for(const item of result.objects){ids.add(item.modelId);assert.ok(Math.abs(item.position.x)>3&&Math.abs(item.position.z)>3);assert.ok(Object.values(item.position).every(Number.isFinite));if(item.functionalSettings.device)assert.ok(INTERACTIVE_DEVICES[item.functionalSettings.device]);}
  const annex=districtNeighborhood({atlasDistrict:{id:region,page:1}});assert.equal(annex.locations.length,1);assert.ok(annex.objects.length<result.objects.length);
 }
 assert.equal(titles.size,8);assert.equal(signatures.size,8);
 for(const id of ids){const model=createBuilderModel(id);assert.ok(model,id);model.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});}
 const harbor=districtNeighborhood({atlasDistrict:{id:'neon-docks'}});assert.ok(harbor.objects.some(item=>item.functionalSettings.behavior==='door'));assert.ok(harbor.objects.some(item=>item.functionalSettings.behavior==='switch'));assert.ok(harbor.objects.some(item=>item.modelId==='material:metal-truss'));
});
test('atlas upgrades districts once and the directory uses real deed identities and regional membership',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'district-scenes-'));t.after(()=>rm(dir,{recursive:true,force:true}));const atlas=new WorldAtlas(join(dir,'atlas.json'));
 const deeds=[{id:'dock-deed',name:'Harbor estate',ownerId:'account:sailor',ownerName:'Sailor',worldId:'neon-docks',hostedSpace:{environmentId:'public-commons',name:'Harbor estate'}}];
 const {environments}=await synchronizeWorldDirectory(atlas,[],deeds);const harbor=environments.find(map=>map.id==='world-district-neon-docks');assert.ok(districtLocations(harbor).some(place=>place.id==='harbor-crane'));
 const destinations=districtDestinations(harbor,environments.map(map=>({mapId:map.id,districtId:map.districtId,name:map.name,deedId:map.deedId,ownerName:map.ownerName})));
 const deed=destinations.find(item=>item.deedId==='dock-deed');assert.ok(deed);assert.equal(deed.ownerName,'Sailor');assert.ok(!destinations.some(item=>item.mapId==='world-district-echo-gardens'));
 const before=await atlas.read();await synchronizeWorldDirectory(atlas,[],deeds);assert.equal((await atlas.read()).revision,before.revision);
});
