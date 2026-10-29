// Presentation only: the room simulation owns ball contact and rally results.
const DRAW_MS=420,SWING_MS=440;
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const paddleName=/(?:^|[_\s-])(?:ping[\s_-]?pong[\s_-]?|table[\s_-]?tennis[\s_-]?)?paddle(?:$|[_\s-]\d+$)/i;

/** Grip origin is (0,0,0), blade extends up +Y, striking face points -Z. */
export function createPingPongPaddle(T){
 const root=new T.Group();root.name='PING_PONG_PADDLE';
 const wood=new T.MeshStandardMaterial({color:0xc99a61,roughness:.72}),red=new T.MeshStandardMaterial({color:0xc62f43,roughness:.92}),black=new T.MeshStandardMaterial({color:0x20252c,roughness:.94});
 const add=(name,geometry,material,position)=>{const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.position.set(...position);mesh.castShadow=true;root.add(mesh);return mesh;};
 add('PADDLE_WOOD_HANDLE',new T.BoxGeometry(.035,.16,.027),wood,[0,0,0]);
 for(const [name,material,depth,z]of [['PADDLE_WOOD_BLADE',wood,.017,0],['PADDLE_RED_RUBBER',red,.004,-.0105],['PADDLE_BLACK_RUBBER',black,.004,.0105]]){
  const mesh=add(name,new T.CylinderGeometry(.103,.103,depth,24),material,[0,.175,z]);mesh.rotation.x=Math.PI/2;mesh.scale.z=1.12;
 }
 for(const x of [-.012,.012])add('PADDLE_HANDLE_INLAY',new T.BoxGeometry(.003,.12,.0015),black,[x,-.003,-.014]);
 root.traverse(node=>{node.userData.collisionDisabled=true;node.userData.collider=false;node.raycast=()=>{};});
 return root;
}

function namedPaddle(root){
 let result=null;root?.traverse(node=>{if(!result&&node!==root&&!node.userData.pingPongProjection&&paddleName.test(node.name)&&!node.isSkinnedMesh)result=node;});return result;
}

function originalPose(node){return {parent:node.parent,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone(),visible:node.visible};}
function restore(node,pose){pose.parent?.add(node);node.position.copy(pose.position);node.quaternion.copy(pose.quaternion);node.scale.copy(pose.scale);node.visible=pose.visible;}

function localFloor(T,root,model){
 root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),bounds=new T.Box3(),matrix=new T.Matrix4();
 model.traverse(node=>{if(!node.isMesh||!node.visible||node.userData.collisionOnly||node.userData.pingPongProjection)return;node.geometry.computeBoundingBox();matrix.multiplyMatrices(inverse,node.matrixWorld);bounds.union(node.geometry.boundingBox.clone().applyMatrix4(matrix));});
 return bounds.isEmpty()?0:bounds.min.y;
}

function createProjection(T,root,firstPerson,controller){
 const model=root.userData.serverAvatarModel||root,group=new T.Group(),mount=new T.Group();group.name='AVATAR_PING_PONG_EQUIPMENT';group.userData.pingPongProjection=true;mount.name='PING_PONG_GRIP';group.add(mount);
 const floor=firstPerson?0:localFloor(T,root,model);
 // Uploaded articulated models can provide an actual paddle node. Opaque single
 // mesh GLBs receive a separate prop; their authored geometry remains intact.
 const source=firstPerson?null:namedPaddle(model),saved=source?originalPose(source):null,paddle=source||createPingPongPaddle(T),sourceFlags=[];
 if(source){
  source.traverse(node=>sourceFlags.push({node,raycast:node.raycast,collisionDisabled:node.userData.collisionDisabled,collider:node.userData.collider}));
  source.removeFromParent();source.position.set(0,0,0);
  const bounds=new T.Box3().setFromObject(source),size=bounds.getSize(new T.Vector3()),centre=bounds.getCenter(new T.Vector3()),scale=.37/(Math.max(size.x,size.y,size.z)||.37);
  source.scale.multiplyScalar(scale);source.position.set(-centre.x*scale,-bounds.min.y*scale-.08,-centre.z*scale);source.visible=true;
 }
 mount.add(paddle);
 const handMaterial=new T.MeshStandardMaterial({color:0xe7dfc6,roughness:.88}),hand=new T.Mesh(new T.SphereGeometry(.052,10,8),handMaterial);hand.name='PING_PONG_GRIPPING_HAND';hand.scale.set(.8,1.1,.9);mount.add(hand);
 const cuff=new T.Mesh(new T.CylinderGeometry(.055,.049,.07,10),new T.MeshStandardMaterial({color:0x304454,roughness:.85}));cuff.name='PING_PONG_WRIST_CUFF';cuff.position.set(.015,-.065,.01);cuff.rotation.z=-.25;mount.add(cuff);
 group.traverse(node=>{node.userData.collisionDisabled=true;node.userData.collider=false;node.raycast=()=>{};if(firstPerson&&node.isMesh){node.renderOrder=20;for(const material of [].concat(node.material||[])){material.depthTest=false;material.depthWrite=false;}}});
 root.add(group);
 const arm=model.userData.residentLimbs?.[1]?.arm;
 const state={group,mount,paddle,source,saved,sourceFlags,model,floor,firstPerson,controller,hand,cuff,arm,armPose:arm?originalPose(arm):null,equipped:false,transitionAt:0,draw:0,from:0};
 root.userData.avatarPaddle=state;return state;
}

/** Call after avatar mixers so a player's swing remains visible between packets. */
export function updateAvatarPaddle(T,root,pingPong,now=Date.now(),{firstPerson=false,controller=false,reducedMotion=false}={}){
 if(!root)return null;
 let projection=root.userData.avatarPaddle;
 if(projection&&(projection.model!==(root.userData.serverAvatarModel||root)||projection.firstPerson!==firstPerson||projection.controller!==controller)){disposeAvatarPaddle(root);projection=null;}
 if(!pingPong&&!projection)return null;
 projection ||= createProjection(T,root,firstPerson,controller);
 const state=pingPong||{},equipped=state.equipped===true;
 if(equipped!==projection.equipped){projection.from=projection.draw;projection.equipped=equipped;projection.transitionAt=equipped&&Number.isFinite(state.equippedAt)&&state.equippedAt>0?Math.min(now,state.equippedAt):now;}
 const progress=reducedMotion?1:smooth((now-projection.transitionAt)/DRAW_MS);
 projection.draw=projection.from+((equipped?1:0)-projection.from)*progress;
 const draw=projection.draw,age=now-(Number(state.swingAt)||0),swing=equipped&&Number(state.swingAt)>0&&age>=0&&age<SWING_MS?Math.sin(age/SWING_MS*Math.PI):0,backhand=state.stroke==='backhand',smash=state.stroke==='smash';
 const swingAmount=reducedMotion?swing*.22:swing;
 const {group,mount,arm,armPose}=projection;
 const worldScale=root.getWorldScale(new T.Vector3());group.scale.set(1/(Math.abs(worldScale.x)||1),1/(Math.abs(worldScale.y)||1),1/(Math.abs(worldScale.z)||1));group.position.y=projection.floor;
 // The same prop travels from its front belt position into the playing grip.
 const cameraGripX=firstPerson&&root.isCamera?Math.min(.29,.62*Math.tan((root.fov||68)*Math.PI/360)*Math.max(.3,root.aspect||1)*.65):.29;
 const waist=controller?[0,0,-.04]:firstPerson?[Math.min(.11,cameraGripX),-.62,-.57]:[.12,.86,-.285],grip=controller?[0,0,-.04]:firstPerson?[cameraGripX,-.27,-.62]:[.35,1.12,-.45];
 mount.position.set(...waist).lerp(new T.Vector3(...grip),draw);
 if(!controller){mount.position.x+=(backhand?-.27:.15)*swingAmount;mount.position.y+=(smash?.23:.06)*swingAmount;mount.position.z-=(smash?.12:.22)*swingAmount;}
 const rotationSwing=controller?swingAmount*.18:swingAmount;
 mount.rotation.set((controller?0:firstPerson?-.18:.06)*draw+(smash?-1.1:.3)*rotationSwing,(backhand?-.95:.95)*rotationSwing,.14*(1-draw)+(backhand?.55:-.55)*rotationSwing);
 projection.hand.visible=!controller&&draw>.08;projection.cuff.visible=!controller&&draw>.08;
 if(arm){
  if(draw>.001){
   arm.rotation.x=1.05*draw+(smash?.7:.25)*swingAmount;
   arm.rotation.y=(backhand?-.6:.38)*swingAmount;
   arm.rotation.z=-.18*draw;
   // Follow the actual animated resident hand rather than adding another arm.
   arm.updateWorldMatrix(true,false);const hand=arm.localToWorld(new T.Vector3(0,-.47,0));group.worldToLocal(hand);mount.position.lerp(hand,draw);projection.hand.visible=false;projection.cuff.visible=false;
  }else arm.quaternion.copy(armPose.quaternion);
 }
 group.visible=firstPerson?draw>.001:pingPong!=null||draw>.001;
 projection.paddle.visible=true;
 group.userData.equipped=equipped;group.userData.drawProgress=draw;group.userData.swingProgress=swing;
 if(pingPong==null&&draw<=.001)disposeAvatarPaddle(root);
 return group;
}

export function disposeAvatarPaddle(root){
 const projection=root?.userData.avatarPaddle;if(!projection)return;
 if(projection.source){restore(projection.source,projection.saved);for(const {node,raycast,collisionDisabled,collider}of projection.sourceFlags){node.raycast=raycast;if(collisionDisabled===undefined)delete node.userData.collisionDisabled;else node.userData.collisionDisabled=collisionDisabled;if(collider===undefined)delete node.userData.collider;else node.userData.collider=collider;}}
 if(projection.arm)projection.arm.quaternion.copy(projection.armPose.quaternion);
 projection.group.removeFromParent();
 const geometries=new Set(),materials=new Set();projection.group.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of [].concat(node.material||[]))materials.add(material);});
 for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
 delete root.userData.avatarPaddle;
}
