import * as THREE from '../vendor/three/three.module.min.js';
import {ROAD_VEHICLES} from './road-vehicles.js';
import {AIRCRAFT_TYPES} from './aircraft-types.js';
import {SHIPPING_VESSELS} from './shipping-vessel-specs.js';

const BOATS={
 'harbor-skiff':[2,1.5,4.8],'harbor-sailboat':[2.4,7.5,5.4],
 'harbor-yacht':[12,7,42],'harbor-patrol':[3,2.7,7.8],
 'harbor-fishing-boat':[2.7,3,6.3],'resort-paddle-boat':[1.9,1.5,3.4],
 'resort-pontoon':[3.7,3.25,6.5]
};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const WHITE=0xffefd1,RED=0xff4538,GREEN=0x4cffa0,AMBER=0xffb73e;

// Lamp placement uses the model's native local coordinates, so copies and
// scaled/rotated custom vehicles retain the same front direction as steering.
export function vehicleNightProfile(root,actor={}){
 const data=root?.userData||{},id=actor?.asset?.buildAssetId||actor?.modelId||data.modelId||data.vehicleDesign?.id;
 const vehicle=data.vehicle||data.functionalSettings?.vehicle||actor?.definition?.gameplay?.vehicle||actor?.asset?.function_data?.vehicle||{};
 const road=ROAD_VEHICLES[id],air=AIRCRAFT_TYPES[id],ship=SHIPPING_VESSELS[id];
 const mode=vehicle.mode||actor?.vehicleSettings?.mode;
 const family=air||data.aircraft||data.aircraftRig||mode==='fly'?'aircraft':ship||BOATS[id]||data.watercraft||data.boatModel||mode==='boat'?'boat':road||data.roadVehicle||mode==='drive'?'road':null;
 if(!family)return null;
 let dimensions=air?.dimensions||data.dimensions||(ship?[ship.beam,ship.height,ship.length]:BOATS[id])||(road?[road.width,road.height||1.8,road.length]:null);
 if(!Array.isArray(dimensions)||dimensions.length!==3||!dimensions.every(v=>Number.isFinite(v)&&v>0))dimensions=null;
 return {family,id,dimensions,construction:!!(road?.siteOnly||data.constructionModel||actor?.construction),seat:vehicle.seat||ship?.seat||road?.seat||air?.seat};
}

function nativeDimensions(root){
 const bounds=new THREE.Box3(),box=new THREE.Box3(),inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4();
 root.updateWorldMatrix(true,true);inverse.copy(root.matrixWorld).invert();
 root.traverse(node=>{
  if(!node.isMesh||node.userData.vehicleNightLamp||!node.geometry)return;
  if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
  if(!node.geometry.boundingBox)return;
  matrix.multiplyMatrices(inverse,node.matrixWorld);box.copy(node.geometry.boundingBox).applyMatrix4(matrix);bounds.union(box);
 });
 if(bounds.isEmpty())return [2,2,5];
 const size=bounds.getSize(new THREE.Vector3());return [Math.max(.3,size.x),Math.max(.4,size.y),Math.max(.6,size.z)];
}

function lampLayout(profile){
 const [width,height,length]=profile.dimensions,half=width*.42,front=-length*.46,rear=length*.46;
 const lamps=[];let beamY,beamZ,beamHalf;
 if(profile.family==='aircraft'){
  lamps.push([-half,.8,0,RED],[half,.8,0,GREEN],[0,Math.min(height*.75,2),rear,WHITE]);
  beamY=Math.min(height*.30,.8);beamZ=-length*.27;beamHalf=Math.min(width*.16,1.9);
  lamps.push([-beamHalf,beamY,beamZ,WHITE],[beamHalf,beamY,beamZ,WHITE],[0,height*.88,0,RED]);
 }else if(profile.family==='boat'){
  beamY=Math.max(.4,Math.min(height*.23,3));beamZ=front;beamHalf=Math.max(.25,width*.32);
  const navY=Math.max(beamY+.2,finite(profile.seat?.[1],height*.65)),navZ=finite(profile.seat?.[2],0);
  lamps.push([-half,navY,navZ,RED],[half,navY,navZ,GREEN],[0,Math.max(beamY+.4,height*.65),rear,WHITE],[-beamHalf,beamY,front,WHITE],[beamHalf,beamY,front,WHITE]);
 }else{
  beamY=profile.construction?Math.min(3,Math.max(1.1,finite(profile.seat?.[1],1)+.35)):Math.max(.4,Math.min(1.15,height*.49));
  beamZ=front;beamHalf=width<1?0:width*.31;
  for(const x of beamHalf?[-beamHalf,beamHalf]:[0])lamps.push([x,beamY,front,WHITE],[x,Math.min(beamY,1.4),rear,RED]);
  if(profile.construction)lamps.push([0,Math.min(height,Math.max(beamY+1,3.2)),0,AMBER]);
 }
 return {lamps,beamY,beamZ,beamHalf};
}

function visibleInScene(root,scene){
 for(let node=root;node;node=node.parent){if(node.visible===false)return false;if(node===scene)return true;}return false;
}

/** One instanced lamp fitting per vehicle, with only two shared real beams.
 * Registry scans are throttled; following an occupied vehicle uses its rendered
 * transform each frame and never traverses the full scene or its materials. */
export function createVehicleNightLights({scene,scanInterval=.5,maxBeams=2}={}){
 const group=new THREE.Group();group.name='VEHICLE_NIGHT_BEAMS';scene.add(group);
 const beams=[],targets=[];
 for(let index=0;index<clamp(Math.floor(finite(maxBeams,2)),1,2);index++){
  const beam=new THREE.SpotLight(WHITE,0,55,.45,.65,1.3),target=new THREE.Object3D();
  beam.name='VEHICLE_FORWARD_BEAM_'+index;beam.castShadow=false;beam.target=target;group.add(beam,target);beams.push(beam);targets.push(target);
 }
 const fixtures=new Map(),pose=new THREE.Object3D(),color=new THREE.Color(),point=new THREE.Vector3(),targetPoint=new THREE.Vector3();
 let lastScan=-Infinity,lastRoots=null,lastActiveRoot=null,disposed=false,litVehicles=0,activeId=null,strength=0;
 function remove(root,entry){entry.mesh.removeFromParent();entry.mesh.dispose();entry.mesh.geometry.dispose();entry.mesh.material.dispose();if(entry.previousFlag===undefined)delete root.userData.vehicleNightRoot;else root.userData.vehicleNightRoot=entry.previousFlag;fixtures.delete(root);}
 function install(root,actor){
  const profile=vehicleNightProfile(root,actor);if(!profile)return null;
  profile.dimensions=profile.dimensions||nativeDimensions(root);
  const layout=lampLayout(profile),radius=clamp(profile.dimensions[0]*.025,.065,.18);
  const geometry=new THREE.SphereGeometry(1,8,6),material=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  material.name='VEHICLE_NIGHT_LAMP_LENSES';
  const mesh=new THREE.InstancedMesh(geometry,material,layout.lamps.length);mesh.name='VEHICLE_NIGHT_LAMP_FITTINGS';
  mesh.userData={vehicleNightLamp:true,collisionDisabled:true,collider:false,nativeDesignDetail:true};mesh.castShadow=false;mesh.receiveShadow=false;
  for(let index=0;index<layout.lamps.length;index++){
   const [x,y,z,tint]=layout.lamps[index];pose.position.set(x,y,z);pose.rotation.set(0,0,0);pose.scale.set(radius,radius*.72,radius);pose.updateMatrix();mesh.setMatrixAt(index,pose.matrix);mesh.setColorAt(index,color.setHex(tint));
  }
  mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.visible=false;root.add(mesh);
  const entry={profile,layout,mesh,previousFlag:root.userData.vehicleNightRoot};root.userData.vehicleNightRoot=true;fixtures.set(root,entry);return entry;
 }
 function update({state,roots=[],actors={},activeRoot=null,activeActor=null,elapsed=0}={}){
  if(disposed)return;
  const time=finite(elapsed,0),daylight=finite(state?.daylight,state?.isNight?0:1);
  strength=state?.outdoors===false?0:clamp((.72-daylight)/.62,0,1);
  if(time<lastScan||time-lastScan>=scanInterval||roots!==lastRoots||activeRoot!==lastActiveRoot){
   lastScan=time;lastRoots=roots;lastActiveRoot=activeRoot;const live=new Set(roots);if(activeRoot)live.add(activeRoot);
   for(const [root,entry]of fixtures)if(!live.has(root))remove(root,entry);
   for(const root of live)if(root?.isObject3D&&!fixtures.has(root))install(root,root===activeRoot?activeActor||actors[root.userData.builderObjectId]:actors[root.userData.builderObjectId]);
  }
  litVehicles=0;
  for(const [root,entry]of fixtures){
   const actor=root===activeRoot?activeActor||actors[root.userData.builderObjectId]:actors[root.userData.builderObjectId];
   const manual=actor?.driving?.lights??root.userData.driving?.lights;
   entry.mesh.visible=strength>.025&&manual!==false&&actor?.active!==false&&visibleInScene(root,scene);
   if(entry.mesh.visible)litVehicles++;
  }
  const entry=activeRoot&&fixtures.get(activeRoot),actor=activeActor||actors[activeRoot?.userData.builderObjectId];
  const enabled=entry&&strength>0&&(actor?.driving?.lights??activeRoot.userData.driving?.lights)!==false&&actor?.active!==false&&visibleInScene(activeRoot,scene);
  activeId=enabled?(actor?.id||activeRoot.userData.builderObjectId||activeRoot.uuid):null;
  for(let index=0;index<beams.length;index++){
   const beam=beams[index];beam.intensity=0;if(!enabled)continue;
   const {profile,layout}=entry,side=beams.length===1?0:index?1:-1,distance=profile.family==='boat'?70:profile.family==='aircraft'?65:38;
   activeRoot.updateWorldMatrix(true,false);
   point.set(layout.beamHalf*side,layout.beamY,layout.beamZ-.12);activeRoot.localToWorld(point);beam.position.copy(point);
   targetPoint.set(layout.beamHalf*side,Math.max(.05,layout.beamY*.08),layout.beamZ-distance*.68);activeRoot.localToWorld(targetPoint);targets[index].position.copy(targetPoint);
   // World-scale copied vehicles receive the same effective beam reach.
   beam.distance=Math.max(distance,point.distanceTo(targetPoint)*1.5);beam.intensity=strength*(profile.family==='boat'?180:110);beam.angle=beams.length===1?.55:profile.family==='boat'?.52:.45;
   beam.updateMatrixWorld();targets[index].updateMatrixWorld();
  }
 }
 function reset(){for(const [root,entry]of fixtures)remove(root,entry);for(const beam of beams)beam.intensity=0;lastScan=-Infinity;lastRoots=lastActiveRoot=null;litVehicles=0;activeId=null;}
 return {update,reset,snapshot:()=>({vehicles:fixtures.size,litVehicles,activeId,strength,beamCount:beams.length,activeBeams:beams.filter(beam=>beam.intensity>0).length}),dispose(){if(disposed)return;reset();disposed=true;group.removeFromParent();for(const beam of beams)beam.dispose?.();}};
}
