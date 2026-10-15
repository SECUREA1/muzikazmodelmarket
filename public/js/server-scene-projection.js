// Scene objects display confirmed state; they never decide gameplay outcomes.
export function disposeProjection(root) {
 root.userData.serverMixer?.stopAllAction();
 root.userData.serverMixer?.uncacheRoot(root.userData.serverMixerRoot||root);
 root.removeFromParent();
 root.traverse(object=>{object.geometry?.dispose();for(const material of [].concat(object.material||[])){if(root.userData.serverLoot)material.map?.dispose();material.dispose();}});
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

export function projectServerActor(root,actor) {
 if(!actor){root.visible=false;return;}
 const state=root.userData,offset=state.serverRenderOffset||{};
 root.position.set(actor.position.x+(offset.x||0),actor.position.y+(offset.y||0),actor.position.z+(offset.z||0));
 root.visible=actor.active!==false;
 root.rotation.set(actor.rotation?.x||0,(actor.rotation?.y||0)+(actor.open?-Math.PI/2:0),actor.rotation?.z||0);
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
  mesh.userData.collisionDisabled=!root.visible||!!actor.open;
  for(const material of [].concat(mesh.material||[])){
   if(paintChanged&&actor.paint!==undefined&&material.color)material.color.setHex(actor.paint);
   if(switchedChanged&&actor.switched!==undefined&&material.emissive){material.userData ||= {};material.userData.serverBaseEmissive ??= material.emissiveIntensity;material.emissiveIntensity=actor.switched?Math.max(1.5,material.userData.serverBaseEmissive):material.userData.serverBaseEmissive;}
  }
 });
 state.serverPaint=actor.paint;state.serverSwitched=actor.switched;state.serverCollisionDisabled=!root.visible||!!actor.open;
}

// Enemy positions remain server-owned; interpolation only smooths presentation.
export function targetServerEnemy(root,actor,height=0) {
 const state=root.userData;
 state.serverTarget ||= root.position.clone();
 state.serverTarget.set(actor.position.x,actor.position.y+height,actor.position.z);
 state.serverYaw=actor.rotation?.y||0;
 if(!state.serverPositioned||root.position.distanceToSquared(state.serverTarget)>25){
  root.position.copy(state.serverTarget);root.rotation.y=state.serverYaw;state.serverPositioned=true;
 }
}
export function interpolateServerEnemy(root,delta) {
 const state=root.userData;if(!state.serverTarget)return;
 const alpha=1-Math.exp(-18*Math.max(0,delta));
 root.position.lerp(state.serverTarget,alpha);
 root.rotation.y+=Math.atan2(Math.sin(state.serverYaw-root.rotation.y),Math.cos(state.serverYaw-root.rotation.y))*alpha;
}
export function disposeServerEnemyProjection(root) {
 root.removeFromParent();
 if(root.userData.serverController)root.userData.serverController.dispose();
 else disposeProjection(root);
}

// Keep authored model size and floor offsets inside a transformable anchor.
export function anchorServerAsset(THREE,content){
 content.updateMatrixWorld(true);const bottom=new THREE.Box3().setFromObject(content).min.y;
 if(Number.isFinite(bottom))content.position.y-=bottom;
 const root=new THREE.Group();root.add(content);
 if(content.userData.serverMixer){root.userData.serverMixer=content.userData.serverMixer;root.userData.serverMixerRoot=content;delete content.userData.serverMixer;}
 return root;
}
