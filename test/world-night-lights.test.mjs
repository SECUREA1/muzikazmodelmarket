import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createEnterableBuilding} from '../public/js/enterable-building-models.js';
import {createWorldNightLights,worldNightStrength} from '../public/js/world-night-lights.js';
import {createDayNightLighting} from '../public/js/environments/day-night-lighting.js';

const night={outdoors:true,daylight:0},day={outdoors:true,daylight:1};
function setup(options={}){const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);return {scene,root,manager:createWorldNightLights({scene,...options})};}

test('night illuminates real building windows and entries while preserving authored daytime materials',()=>{
 const {scene,root,manager}=setup(),building=createEnterableBuilding(THREE,'general-store');root.add(building);
 const window=building.getObjectByName('BUILDING_WINDOW'),original=window.material,originalColor=original.color.clone(),originalEmission=original.emissive.clone();
 manager.update({state:day,anchor:{x:0,y:1,z:-6},roots:[root],now:0});
 assert.equal(window.material,original);assert.equal(building.getObjectByName('NIGHT_BUILDING_ENTRY_LAMP').visible,false);
 manager.update({state:night,anchor:{x:0,y:1,z:-6},roots:[root],now:250});
 assert.notEqual(window.material,original);assert.ok(window.material.emissive.r>window.material.emissive.b);assert.ok(window.material.emissiveIntensity>.5);
 assert.ok(original.color.equals(originalColor));assert.ok(original.emissive.equals(originalEmission));
 assert.equal(building.getObjectByName('NIGHT_BUILDING_ENTRY_LAMP').visible,true);assert.ok(manager.stats.activeLights>0);
 const lights=scene.getObjectByName('WORLD_NIGHT_LIGHT_POOL').children;
 assert.equal(lights.length,4);assert.ok(lights.every(light=>light.isPointLight&&!light.castShadow&&light.visible));
 manager.update({state:day,anchor:{x:0,y:1,z:-6},roots:[root],now:500});
 assert.equal(window.material,original);assert.ok(original.color.equals(originalColor));assert.equal(manager.stats.activeLights,0);
 manager.dispose();assert.equal(scene.getObjectByName('WORLD_NIGHT_LIGHT_POOL'),undefined);
});

test('nearby light budget stays fixed across many copied transformed buildings and indoor maps',()=>{
 const {scene,root,manager}=setup({maxLights:2});
 for(let index=0;index<20;index++){const building=createEnterableBuilding(THREE,'medical-clinic');building.position.set(index*30,0,0);building.rotation.y=Math.PI/2;building.scale.setScalar(1.5);root.add(building);}
 const anchor={x:-12,y:1,z:0};manager.update({state:night,anchor,roots:[root],now:0});
 assert.equal(manager.stats.buildingFixtures,20);assert.equal(manager.stats.lights,2);assert.ok(manager.stats.activeLights>0&&manager.stats.activeLights<=2);
 const fixture=root.children[0].getObjectByName('NIGHT_BUILDING_ENTRY_LAMP'),world=fixture.getWorldPosition(new THREE.Vector3());
 assert.ok(world.x< -10&&world.y>3);assert.ok(Math.abs(world.z)<.001);
 const pool=scene.getObjectByName('WORLD_NIGHT_LIGHT_POOL');assert.ok(pool.children.some(light=>light.position.distanceTo(world)<.001));
 manager.update({state:{...night,outdoors:false},anchor,roots:[root],now:250});
 assert.equal(manager.stats.activeLights,0);assert.equal(fixture.visible,false);
 manager.dispose();
});

test('late dropped street lamps join a periodic scan without per-frame world traversal',()=>{
 const {root,manager}=setup({scanInterval:2000});let scans=0;const traverse=root.traverse;root.traverse=function(callback){scans++;return traverse.call(this,callback);};
 const anchor={x:0,y:1,z:0};manager.update({state:night,anchor,roots:[root],now:0});
 const lamp=new THREE.Group();lamp.userData.modelId='material:street-lamp';
 const pole=new THREE.Mesh(new THREE.BoxGeometry(.1,3,.1),new THREE.MeshStandardMaterial({color:0x334455}));lamp.add(pole);
 const head=new THREE.Mesh(new THREE.BoxGeometry(.4,.2,.4),new THREE.MeshStandardMaterial({color:0xffdd88,emissive:0xffaa44,emissiveIntensity:.8}));head.position.y=3;lamp.add(head);root.add(lamp);
 for(const now of [16,50,201,800,1900])manager.update({state:night,anchor,roots:[root],now});
 assert.equal(scans,1);assert.equal(manager.stats.surfaces,0);
 manager.update({state:night,anchor,roots:[root],now:2001});
 assert.equal(scans,2);assert.equal(manager.stats.surfaces,1);assert.equal(manager.stats.activeLights,1);
 assert.equal(pole.material.emissive.getHex(),0);assert.ok(head.material.emissiveIntensity>.8);
 manager.dispose();
});

test('vehicle windows, screens, boarded windows and invisible buildings cannot become public lamps',()=>{
 const {root,manager}=setup();
 const add=(parent,name,data={})=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,1,.1),new THREE.MeshStandardMaterial({color:0x77aacc}));mesh.name=name;mesh.userData=data;parent.add(mesh);return mesh;};
 const vehicle=new THREE.Group();vehicle.userData.vehicleNightRoot=true;root.add(vehicle);const carWindow=add(vehicle,'WINDOW');
 const screen=add(root,'SHOP_WINDOW_DISPLAY',{mediaScreen:true}),board=add(root,'BOARDED_WINDOW');
 const building=createEnterableBuilding(THREE,'general-store');building.visible=false;root.add(building);
 const originals=[carWindow,screen,board].map(node=>node.material);
 manager.update({state:night,anchor:{x:0,y:1,z:0},roots:[root],now:0});
 assert.deepEqual([carWindow,screen,board].map(node=>node.material),originals);assert.equal(manager.stats.activeLights,0);
 manager.dispose();
});

test('public light follows baked lamp-head geometry instead of a mesh origin at ground level',()=>{
 const {scene,root,manager}=setup({maxLights:1});root.position.set(10,2,-5);root.rotation.y=Math.PI/2;root.scale.setScalar(2);
 const geometry=new THREE.BoxGeometry(.4,.2,.4).translate(0,3,0);
 const lamp=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xffdd88,emissive:0xffbb66,emissiveIntensity:.8}));lamp.name='STREET_LAMP_HEAD';lamp.position.set(4,0,1);root.add(lamp);
 const expected=lamp.localToWorld(new THREE.Vector3(0,3,0)),origin=lamp.getWorldPosition(new THREE.Vector3());
 manager.update({state:night,anchor:expected,roots:[root],now:0});
 const light=scene.getObjectByName('WORLD_NIGHT_LIGHT_POOL').children[0];
 assert.ok(light.intensity>0);assert.ok(light.position.distanceTo(expected)<1e-6);assert.ok(light.position.distanceTo(origin)>5);
 // A replacement/merged geometry refreshes the cached local center on scan.
 lamp.geometry=new THREE.BoxGeometry(.4,.2,.4).translate(0,4,0);
 manager.update({state:night,anchor:expected,roots:[root],now:2100});
 const moved=lamp.localToWorld(new THREE.Vector3(0,4,0));assert.ok(light.position.distanceTo(moved)<1e-6);
 manager.dispose();
});

test('reset and removed roots restore ownership and dispose only generated materials and fixtures',()=>{
 const {scene,root,manager}=setup();const building=createEnterableBuilding(THREE,'general-store');root.add(building);
 const window=building.getObjectByName('BUILDING_WINDOW'),original=window.material;let originalDisposals=0,cloneDisposals=0,fixtureDisposals=0;original.addEventListener('dispose',()=>originalDisposals++);
 manager.update({state:night,anchor:{x:0,y:1,z:-6},roots:[root],now:0});
 window.material.addEventListener('dispose',()=>cloneDisposals++);building.getObjectByName('NIGHT_BUILDING_ENTRY_LAMP').geometry.addEventListener('dispose',()=>fixtureDisposals++);
 manager.reset();assert.equal(window.material,original);assert.equal(originalDisposals,0);assert.equal(cloneDisposals,1);assert.equal(fixtureDisposals,1);assert.equal(building.getObjectByName('NIGHT_BUILDING_ENTRY_LAMP'),undefined);
 manager.update({state:night,anchor:{x:0,y:1,z:-6},roots:[root],now:100});scene.remove(root);
 manager.update({state:night,anchor:{x:0,y:1,z:-6},roots:[],now:200});
 assert.equal(window.material,original);assert.equal(manager.stats.surfaces,0);assert.equal(manager.stats.buildingFixtures,0);assert.equal(manager.stats.activeLights,0);manager.dispose();
});

test('night intensity follows dusk instead of flashing on at a fixed hour',()=>{
 assert.equal(worldNightStrength(day),0);assert.equal(worldNightStrength(night),1);assert.equal(worldNightStrength(),0);
 assert.ok(worldNightStrength({outdoors:true,daylight:.4})>0&&worldNightStrength({outdoors:true,daylight:.4})<1);
 assert.ok(worldNightStrength({outdoors:true,daylight:.2})>worldNightStrength({outdoors:true,daylight:.6}));
});

test('night window clones follow original reflections without repeated dimming during controller rescans',()=>{
 const {scene,root,manager}=setup(),building=createEnterableBuilding(THREE,'general-store');root.add(building);
 const window=building.getObjectByName('BUILDING_WINDOW'),original=window.material;original.envMapIntensity=2;
 const date=new Date(2026,9,29,0,0,0),hemi=new THREE.HemisphereLight(0xe6f7ff,0x26321b,1.75),fill=new THREE.DirectionalLight(0xbfe7ff,.8),sun=new THREE.DirectionalLight(0xfff4dc,2.45);scene.add(hemi,fill,sun);
 const lighting=createDayNightLighting({scene,hemi,fill,sun,now:()=>date}),anchor={x:0,y:1,z:-6};lighting.setEnvironment({id:'public-commons'});
 manager.update({state:lighting.state,anchor,roots:[root],now:0});const clone=window.material;
 assert.notEqual(clone,original);assert.ok(Math.abs(original.envMapIntensity-.24)<1e-9);assert.equal(clone.envMapIntensity,original.envMapIntensity);
 date.setSeconds(6);lighting.update(anchor);manager.update({state:lighting.state,anchor,roots:[root],now:6000});
 assert.equal(window.material,clone);assert.ok(Math.abs(clone.envMapIntensity-.24)<1e-9);assert.equal(clone.envMapIntensity,original.envMapIntensity);
 // A full daytime update restores the exact authored object and reflection value.
 date.setHours(12);lighting.update(anchor);manager.update({state:lighting.state,anchor,roots:[root],now:12000});
 assert.equal(window.material,original);assert.equal(original.envMapIntensity,2);
 // Only the original is controller-owned; detached night clones are not retained.
 clone.envMapIntensity=.77;lighting.dispose();assert.equal(clone.envMapIntensity,.77);assert.equal(original.envMapIntensity,2);
 manager.reset();assert.equal(window.material,original);manager.dispose();
});

test('night scenery does not override a player-switched forge lantern',()=>{
 const {root,manager}=setup();
 const lantern=new THREE.Group();lantern.userData.modelId='forge-lantern';root.add(lantern);
 const flame=new THREE.Mesh(new THREE.ConeGeometry(.08,.3,8),new THREE.MeshStandardMaterial({color:0xffb84f,emissive:0xff971e,emissiveIntensity:0}));flame.name='FORGE_LANTERN_FLAME';lantern.add(flame);
 const original=flame.material;
 manager.update({state:night,anchor:{x:0,y:0,z:0},roots:[root],now:0});
 assert.equal(flame.material,original);assert.equal(flame.material.emissiveIntensity,0);assert.equal(manager.stats.activeLights,0);
 flame.material.emissiveIntensity=1.5;lantern.userData.serverSwitched=true;
 manager.update({state:night,anchor:{x:0,y:0,z:0},roots:[root],now:2100});
 assert.equal(flame.material,original);assert.equal(flame.material.emissiveIntensity,1.5);
 flame.material.emissiveIntensity=0;lantern.userData.serverSwitched=false;
 manager.update({state:night,anchor:{x:0,y:0,z:0},roots:[root],now:4200});
 assert.equal(flame.material.emissiveIntensity,0);manager.dispose();flame.geometry.dispose();original.dispose();
});
