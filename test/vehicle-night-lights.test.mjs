import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createVehicleNightLights,vehicleNightProfile} from '../public/js/vehicle-night-lights.js';
import {ROAD_VEHICLES} from '../public/js/road-vehicles.js';
import {AIRCRAFT_TYPES} from '../public/js/aircraft-types.js';
import {SHIPPING_VESSELS} from '../public/js/shipping-vessel-specs.js';

const night={outdoors:true,daylight:0,isNight:true},day={outdoors:true,daylight:1,isNight:false};
function model(id,extra={}){
 const root=new THREE.Group();root.userData={modelId:id,builderObjectId:id,...extra};
 const material=new THREE.MeshStandardMaterial({color:0x456879,emissive:0x123456,emissiveIntensity:.35});
 root.add(new THREE.Mesh(new THREE.BoxGeometry(2,1.5,4),material));return root;
}
const lamps=root=>root.children.find(node=>node.userData.vehicleNightLamp);
const beamGroup=scene=>scene.getObjectByName('VEHICLE_NIGHT_BEAMS');
const beamLights=scene=>beamGroup(scene).children.filter(node=>node.isSpotLight);

test('all native vehicle families and configured custom copies receive cosmetic night lamps without more real lights',()=>{
 const scene=new THREE.Scene(),roots=[];
 for(const id of [...Object.keys(ROAD_VEHICLES),...Object.keys(AIRCRAFT_TYPES),...Object.keys(SHIPPING_VESSELS),'harbor-skiff','harbor-sailboat','harbor-yacht','harbor-patrol','harbor-fishing-boat','resort-paddle-boat','resort-pontoon'])roots.push(model(id));
 for(const mode of ['drive','fly','boat'])roots.push(model('custom-'+mode,{vehicle:{mode,seat:[0,1,0],speed:10,turnSpeed:.5}}));
 roots.push(model('plain-statue'));scene.add(...roots);
 const lighting=createVehicleNightLights({scene,maxBeams:1});lighting.update({state:night,roots,elapsed:0});
 for(const root of roots.slice(0,-1)){
  const marker=lamps(root);assert.ok(marker?.isInstancedMesh,root.userData.modelId);assert.equal(marker.visible,true);
  assert.ok(marker.count>=2);assert.equal(marker.userData.collisionDisabled,true);assert.equal(marker.castShadow,false);
  assert.equal(root.userData.vehicleNightRoot,true);assert.equal(root.children.filter(node=>node.userData.vehicleNightLamp).length,1);
 }
 assert.equal(lamps(roots.at(-1)),undefined);assert.equal(vehicleNightProfile(model('structural-i-beam',{constructionModel:true})),null);assert.equal(lighting.snapshot().vehicles,roots.length-1);
 const lights=[];scene.traverse(node=>{if(node.isLight)lights.push(node);});assert.equal(lights.length,1);assert.ok(lights.every(light=>!light.castShadow&&light.visible));
 lighting.update({state:night,roots,elapsed:1});assert.ok(roots.slice(0,-1).every(root=>root.children.filter(node=>node.userData.vehicleNightLamp).length===1));
 lighting.dispose();
});

test('dusk brings lamps on, daylight and indoor maps clear them, and road light switches remain authoritative',()=>{
 const scene=new THREE.Scene(),root=model('grand-tourer'),roots=[root],actor={id:'car',modelId:'grand-tourer',active:true,driving:{lights:true}};scene.add(root);
 const lighting=createVehicleNightLights({scene});
 const update=state=>lighting.update({state,roots,actors:{'grand-tourer':actor},activeRoot:root,activeActor:actor,elapsed:0});
 update(day);assert.equal(lamps(root).visible,false);assert.equal(lighting.snapshot().activeBeams,0);
 update({...night,daylight:.45});assert.equal(lamps(root).visible,true);assert.equal(lighting.snapshot().activeBeams,2);
 const dusk=beamLights(scene)[0].intensity;update(night);assert.ok(beamLights(scene)[0].intensity>dusk);
 actor.driving.lights=false;update(night);assert.equal(lamps(root).visible,false);assert.equal(lighting.snapshot().activeBeams,0);
 actor.driving.lights=true;update(night);assert.equal(lamps(root).visible,true);assert.equal(lighting.snapshot().activeBeams,2);
 update({...night,outdoors:false});assert.equal(lamps(root).visible,false);assert.equal(lighting.snapshot().activeBeams,0);
 assert.ok(beamLights(scene).every(light=>light.visible),'off lights remain in the fixed shader budget');lighting.dispose();
});

test('occupied vehicle beams follow rendered translation, yaw, scale and banking rather than stale server positions',()=>{
 const scene=new THREE.Scene(),root=model('custom-aircraft',{vehicle:{mode:'fly'},dimensions:[8,3,7]});
 root.position.set(10,4,-8);root.rotation.set(.12,Math.PI/2,.2);root.scale.set(1.4,1.4,1.4);scene.add(root);
 const lighting=createVehicleNightLights({scene,maxBeams:1}),roots=[root];
 lighting.update({state:night,roots,activeRoot:root,activeActor:{id:'plane',position:{x:900,y:300,z:900}},elapsed:0});
 const beam=beamLights(scene)[0],position=beam.getWorldPosition(new THREE.Vector3()),target=beam.target.getWorldPosition(new THREE.Vector3());
 assert.ok(position.distanceTo(root.position)<10,'use the displayed model instead of distant raw server coordinates');
 const forward=new THREE.Vector3(0,0,-1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
 assert.ok(target.clone().sub(position).normalize().dot(forward)>.96,'yaw, pitch and bank rotate the real beam with its vehicle');
 assert.ok(beam.distance>=65);assert.equal(lighting.snapshot().activeId,'plane');
 const before=position.clone();root.position.x+=12;lighting.update({state:night,roots,activeRoot:root,activeActor:{id:'plane'},elapsed:.02});
 assert.ok(Math.abs(beam.getWorldPosition(new THREE.Vector3()).x-before.x-12)<1e-6);
 lighting.dispose();
});

test('lamp colors preserve aircraft/boat port and starboard conventions and do not alter source materials',()=>{
 const scene=new THREE.Scene(),boat=model('shipping-feeder'),plane=model('diamond-da40');scene.add(boat,plane);
 const original=boat.children[0].material,originalColor=original.color.getHex(),originalGlow=original.emissive.getHex(),originalIntensity=original.emissiveIntensity;
 let disposed=0;original.addEventListener('dispose',()=>disposed++);
 const lighting=createVehicleNightLights({scene});lighting.update({state:night,roots:[boat,plane],elapsed:0});
 for(const root of [boat,plane]){
  const marker=lamps(root),port=new THREE.Color(),starboard=new THREE.Color(),matrix=new THREE.Matrix4();
  marker.getColorAt(0,port);marker.getColorAt(1,starboard);assert.ok(port.r>port.g&&starboard.g>starboard.r);
  marker.getMatrixAt(0,matrix);assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix).x<0);
  marker.getMatrixAt(1,matrix);assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix).x>0);
 }
 lighting.reset();assert.equal(boat.children[0].material,original);assert.equal(original.color.getHex(),originalColor);assert.equal(original.emissive.getHex(),originalGlow);assert.equal(original.emissiveIntensity,originalIntensity);assert.equal(disposed,0);
 assert.equal(lamps(boat),undefined);assert.equal(boat.userData.vehicleNightRoot,undefined);assert.equal(lighting.snapshot().vehicles,0);assert.equal(lighting.snapshot().activeBeams,0);
 lighting.dispose();assert.equal(beamGroup(scene),undefined);assert.equal(disposed,0);
});

test('inactive or detached vehicles cannot leave phantom light beams, and runtime arrivals get a bounded refresh',()=>{
 const scene=new THREE.Scene(),first=model('frontier-pickup'),roots=[first];scene.add(first);
 const lighting=createVehicleNightLights({scene});const actor={id:'pickup',active:true};
 lighting.update({state:night,roots,activeRoot:first,activeActor:actor,elapsed:0});assert.equal(lighting.snapshot().activeBeams,2);
 actor.active=false;lighting.update({state:night,roots,activeRoot:first,activeActor:actor,elapsed:.1});assert.equal(lighting.snapshot().activeBeams,0);
 actor.active=true;first.removeFromParent();lighting.update({state:night,roots,activeRoot:first,activeActor:actor,elapsed:.2});assert.equal(lighting.snapshot().activeBeams,0);
 const second=model('site-excavator');scene.add(second);roots.splice(0,1,second);lighting.update({state:night,roots,elapsed:.6});
 assert.equal(lamps(first),undefined);assert.equal(lamps(second)?.visible,true);assert.equal(lighting.snapshot().vehicles,1);
 assert.equal(vehicleNightProfile(second).construction,true);lighting.dispose();
});
