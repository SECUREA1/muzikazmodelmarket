import * as THREE from '../vendor/three/three.module.min.js';
const visibleSession=session=>['waiting','bite','reeling','caught'].includes(session?.status);
// Cosmetics read confirmed sessions only; catch generation and line physics stay on the server.
export function createFishingScene(scene,{getRoots=()=>[]}={}){
 const root=new THREE.Group();root.name='SHARED_FISHING_LINES';scene.add(root);const casts=new Map(),tip=new THREE.Vector3(),end=new THREE.Vector3();let snapshot=null;
 function create(id){
  const group=new THREE.Group();group.name='Fishing_cast_'+id;root.add(group);
  const positions=new Float32Array(9),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xe2f4dd,transparent:true,opacity:.85}));group.add(line);
  const bobber=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),new THREE.MeshStandardMaterial({color:0xffa77b,emissive:0x502913}));bobber.scale.y=1.6;group.add(bobber);
  const ripple=new THREE.Mesh(new THREE.RingGeometry(.2,.23,24),new THREE.MeshBasicMaterial({color:0xc0f8dc,transparent:true,opacity:.45,side:THREE.DoubleSide,depthWrite:false}));ripple.rotation.x=-Math.PI/2;group.add(ripple);
  const fish=new THREE.Group(),fishMaterial=new THREE.MeshStandardMaterial({color:0x83d9c2,metalness:.45,roughness:.3}),body=new THREE.Mesh(new THREE.SphereGeometry(.25,12,8),fishMaterial);body.scale.set(1.8,.65,.6);fish.add(body);const tail=new THREE.Mesh(new THREE.ConeGeometry(.2,.3,3),fishMaterial);tail.rotation.z=-Math.PI/2;tail.position.x=.5;fish.add(tail);const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,6,5),new THREE.MeshBasicMaterial({color:0x071b29}));eye.position.set(-.28,.06,.13);fish.add(eye);fish.visible=false;group.add(fish);
  const rod=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xdec88a}));group.add(rod);
  const cast={group,line,bobber,ripple,fish,rod};casts.set(id,cast);return cast;
 }
 function remove(id){const cast=casts.get(id);if(!cast)return;cast.rigRod&&(cast.rigRod.rotation.z=cast.baseAngle);cast.group.traverse(node=>{node.geometry?.dispose();if(node.material){const materials=Array.isArray(node.material)?node.material:[node.material];for(const material of materials)material.dispose();}});cast.group.removeFromParent();casts.delete(id);}
 function update(next){snapshot=next;const live=new Set();for(const [id,player]of Object.entries(next?.players||{})){if(!visibleSession(player.fishing?.session))continue;live.add(id);if(!casts.has(id))create(id);}for(const id of casts.keys())if(!live.has(id))remove(id);}
 function animate(time){
  for(const [id,cast]of casts){const player=snapshot?.players?.[id],session=player?.fishing?.session;if(!session?.castPoint)continue;const boat=snapshot.actors?.[session.boatId],model=getRoots().find(item=>item.userData?.builderObjectId===session.boatId),rig=model?.userData.fishingRig||model?.userData.boatRig?.fishingRig,index=session.side==='port'?0:1,tension=session.tension||0;
   if(rig?.rods?.[index]){const rod=rig.rods[index];if(cast.rigRod!==rod){cast.rigRod=rod;cast.baseAngle=rod.rotation.z;}rod.rotation.z=cast.baseAngle+(session.side==='port'?-1:1)*tension*.18;}
   if(rig?.tips?.[index]){rig.tips[index].updateWorldMatrix(true,false);rig.tips[index].getWorldPosition(tip);cast.rod.visible=false;}
   else{const origin=player.position||session.position||boat?.position||session.castPoint,yaw=boat?.rotation?.y||player.yaw||0,side=session.side==='port'?-1:1;tip.set(origin.x+Math.cos(yaw)*side*1.3,origin.y+1.7,origin.z-Math.sin(yaw)*side*1.3);const points=cast.rod.geometry.attributes.position;points.setXYZ(0,origin.x,origin.y+.8,origin.z);points.setXYZ(1,tip.x,tip.y,tip.z);points.needsUpdate=true;cast.rod.geometry.computeBoundingSphere();cast.rod.visible=true;}
   end.set(session.castPoint.x,Math.max(.05,session.castPoint.y||.05),session.castPoint.z);const bite=session.status==='bite';end.y+=(Math.sin(time*(bite?17:2.2))*(bite?.13:.025));if(session.status==='reeling'){end.lerp(tip,Math.min(.9,(session.progress||0)*.85));end.y=Math.max(.05,end.y*.08);end.x+=Math.sin(time*5)*.12;end.z+=Math.cos(time*4)*.12;}
   if(session.status==='caught'){end.copy(tip).add(new THREE.Vector3(.2,-.5,0));cast.fish.visible=true;cast.fish.position.copy(end);cast.fish.rotation.set(Math.sin(time*7)*.2,time*2,Math.sin(time*5)*.15);cast.fish.scale.setScalar(Math.min(2,Math.max(.6,Math.cbrt(session.fish?.weightKg||1))));}else cast.fish.visible=false;
   const positions=cast.line.geometry.attributes.position;positions.setXYZ(0,tip.x,tip.y,tip.z);positions.setXYZ(1,(tip.x+end.x)/2,(tip.y+end.y)/2-(1-tension)*.12,(tip.z+end.z)/2);positions.setXYZ(2,end.x,end.y,end.z);positions.needsUpdate=true;cast.line.geometry.computeBoundingSphere();cast.bobber.position.copy(end);cast.bobber.visible=session.status!=='caught';cast.ripple.position.set(end.x,.04,end.z);cast.ripple.visible=session.status!=='caught';cast.ripple.scale.setScalar(1+(time%1)*1.7);cast.ripple.material.opacity=(1-time%1)*.4;
  }
 }
 return {update,animate,reset(){update(null);},dispose(){update(null);root.removeFromParent();}};
}
