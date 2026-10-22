import {updateAircraftSeat,seatedPilot} from './aircraft-seat.js';
import {isWatercraft} from './harbor-water.js';
import {isAircraft} from './aircraft-flight.js';
import {placementBounds} from './placed-item-collision.js';
import {ServerMotion} from './server-motion.js';
import {EnemySnapshotMotion} from './enemy-snapshot-motion.js';
// Scene objects display confirmed state; they never decide gameplay outcomes.
export function disposeProjection(root) {
 root.userData.serverMixer?.stopAllAction();
 root.userData.serverMixer?.uncacheRoot(root.userData.serverMixerRoot||root);
 root.removeFromParent();
 root.traverse(object=>{object.geometry?.dispose();for(const material of [].concat(object.material||[])){if(root.userData.serverLoot||object.userData.voiceOverlay||object.name==='CABINET_ARTWORK')material.map?.dispose();material.dispose();}});
}

export function syncServerAvatar({THREE,root,peer,loader,prepare,isCurrent,now=Date.now()}) {
 const url=peer.modelUrl||'';
 const state=root.userData;
 if(state.serverAvatarUrl!==url){
  state.serverAvatarUrl=url;state.serverAvatarRequest=null;state.serverAvatarRetryAt=0;
  state.serverMixer?.stopAllAction();state.serverMixer?.uncacheRoot(state.serverAvatarModel);state.serverMixer=null;
  if(state.serverAvatarModel)disposeProjection(state.serverAvatarModel);
  state.serverAvatarModel=null;state.serverBody.visible=true;
 }
 if(!url||state.serverAvatarModel||state.serverAvatarRequest||now<(state.serverAvatarRetryAt||0))return;
 const request={};state.serverAvatarRequest=request;
 loader.load(url,gltf=>{
  if(!isCurrent()||state.serverAvatarRequest!==request){disposeProjection(gltf.scene);return;}
  state.serverAvatarRequest=null;
  const model=prepare(gltf.scene,{targetHeight:1.8});root.add(model);
  state.serverAvatarModel=model;state.serverBody.visible=false;
  if(gltf.animations?.length){state.serverMixer=new THREE.AnimationMixer(model);const clip=gltf.animations.find(clip=>/idle/i.test(clip.name))||gltf.animations[0];state.serverMixer.clipAction(clip).play();}
 },undefined,()=>{if(state.serverAvatarRequest===request){state.serverAvatarRequest=null;state.serverAvatarRetryAt=Date.now()+5000;}});
}

export function projectServerActor(root,actor,{localId=null,now=performance.now()}={}) {
 if(!actor){root.visible=false;return;}
 const state=root.userData,offset=state.serverRenderOffset||{};if(isAircraft(actor)){updateAircraftSeat(root,actor,{selfId:localId});root.rotation.order='YXZ';state.aircraftFlight=actor.flight||{};state.aircraftHealth=actor.health;}
 if(isWatercraft(actor)&&actor.trafficAI&&state.boatModel){if(!state.trafficCrew){const crew=seatedPilot(),eye=state.helmPose?.position||[.3,1.43,1.12];crew.position.set(eye[0],eye[1]-1.7,eye[2]-.63);root.add(crew);state.trafficCrew=crew;}state.trafficCrew.visible=!actor.crewRecovered;const head=state.trafficCrew.getObjectByName('CREW_HEAD');if(head)head.rotation.y=Math.sin((actor.trafficAngle||0)*10)*.18;}
 if(isWatercraft(actor)){root.rotation.order='YXZ';state.boatState=actor.boating||{};state.yachtBilliards=actor.yachtBilliards||null;}
 const behavior=actor.definition?.gameplay?.behavior||state.functionalSettings?.behavior||actor.asset?.behavior;state.serverObjectMotion=['hostile','patrol','vehicle'].includes(behavior)&&!(localId&&actor.holderId===localId);if(state.serverObjectMotion)targetServerEnemy(root,{...actor,position:{x:actor.position.x+(offset.x||0),y:actor.position.y,z:actor.position.z+(offset.z||0)}},offset.y||0,now);else root.position.set(actor.position.x+(offset.x||0),actor.position.y+(offset.y||0),actor.position.z+(offset.z||0));
 root.visible=actor.active!==false;
 root.rotation.set(actor.rotation?.x||0,state.serverObjectMotion?root.rotation.y:(actor.rotation?.y||0)+(actor.open?-Math.PI/2:0),actor.rotation?.z||0);
 if(actor.scale){
  const previous=state.serverAppliedScale||state.authoredScale||{x:1,y:1,z:1};
  for(const axis of ['x','y','z'])if(Number.isFinite(actor.scale[axis])&&actor.scale[axis]>0)root.scale[axis]*=actor.scale[axis]/(previous[axis]||1);
  state.serverAppliedScale={...actor.scale};
 }
 // Preserve each material's authored lighting until a server interaction changes it.
 const paintChanged=state.serverPaint!==actor.paint,switchedChanged=state.serverSwitched!==actor.switched;
 const collisionChanged=state.serverCollisionDisabled!==(!root.visible||!!actor.open);
 if(paintChanged||switchedChanged||collisionChanged)root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  mesh.userData.serverBaseCollisionDisabled??=mesh.userData.collisionDisabled===true;mesh.userData.collisionDisabled=mesh.userData.serverBaseCollisionDisabled||!root.visible||!!actor.open;
  for(const material of [].concat(mesh.material||[])){
   if(paintChanged&&actor.paint!==undefined&&material.color&&!mesh.userData.aircraftPilot)material.color.setHex(actor.paint);
   if(switchedChanged&&actor.switched!==undefined&&material.emissive){material.userData ||= {};material.userData.serverBaseEmissive ??= material.emissiveIntensity;material.emissiveIntensity=actor.switched?Math.max(1.5,material.userData.serverBaseEmissive):material.userData.serverBaseEmissive;}
  }
 });
 state.serverPaint=actor.paint;state.serverSwitched=actor.switched;state.serverCollisionDisabled=!root.visible||!!actor.open;
}

// Remote players render from a short buffer instead of chasing each packet.
export function targetServerPlayer(root,peer,now=performance.now()) {
 const state=root.userData;
 state.serverPlayerMotion ||= new ServerMotion();
 state.serverPlayerMotion.push(peer.position,now);
 state.serverYaw=peer.yaw||0;
 // First snapshots, teleports and long gaps discard the old interpolation path.
 if(state.serverPlayerMotion.snapshots.length===1){
  root.position.copy(peer.position);root.rotation.y=state.serverYaw;
 }
}
export function interpolateServerPlayer(root,delta,now=performance.now()) {
 const state=root.userData;if(!state.serverPlayerMotion)return;
 state.serverPlayerMotion.sample(now,root.position);
 const alpha=1-Math.exp(-18*Math.max(0,delta));
 root.rotation.y+=Math.atan2(Math.sin(state.serverYaw-root.rotation.y),Math.cos(state.serverYaw-root.rotation.y))*alpha;
}

// Enemy positions remain server-owned; interpolation only smooths presentation.
export function targetServerEnemy(root,actor,height=0,now=performance.now(),simulationTime=now) {
 const state=root.userData,spawnKey=actor.spawnId||actor.spawnedAt||null;
 state.serverEnemyMotion ||= new EnemySnapshotMotion();
 if(state.serverSpawnKey!==spawnKey){state.serverEnemyMotion.reset();state.serverPositioned=false;state.serverSpawnKey=spawnKey;delete state.lastAttack;delete state.flashToken;delete state.tellToken;}
 state.serverTarget ||= root.position.clone();
 const position={x:actor.position.x,y:actor.position.y+height,z:actor.position.z};
 const previousTime=state.serverEnemyMotion.lastTime,reset=state.serverEnemyMotion.push(position,now,simulationTime);
 if(state.serverEnemyMotion.lastTime===previousTime)return;
 state.serverTarget.copy(position);state.serverYaw=actor.rotation?.y||0;
 if(!state.serverPositioned||reset){root.position.copy(position);root.rotation.y=state.serverYaw;state.serverPositioned=true;}
}
export function interpolateServerEnemy(root,delta,now=performance.now()) {
 const state=root.userData;if(!state.serverTarget)return;
 // The timestamped buffer already interpolates; a second lerp adds variable lag.
 state.serverEnemyMotion.sample(now,root.position);
 const alpha=1-Math.exp(-18*Math.max(0,delta));
 root.rotation.y+=Math.atan2(Math.sin(state.serverYaw-root.rotation.y),Math.cos(state.serverYaw-root.rotation.y))*alpha;
}
export function disposeServerEnemyProjection(root) {
 root.removeFromParent();
 if(root.userData.serverController)root.userData.serverController.dispose();
 else disposeProjection(root);
}

// Keep authored model size and floor offsets inside a transformable anchor.
export function anchorServerAsset(THREE,content){
 content.updateMatrixWorld(true);const bounds=placementBounds(THREE,content);const bottom=(bounds.isEmpty()?new THREE.Box3().setFromObject(content):bounds).min.y;
 if(Number.isFinite(bottom))content.position.y-=bottom;
 const root=new THREE.Group();root.add(content);
 if(content.userData.serverMixer){root.userData.serverMixer=content.userData.serverMixer;root.userData.serverMixerRoot=content;delete content.userData.serverMixer;}
 return root;
}
