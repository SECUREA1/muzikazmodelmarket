import * as THREE from '../../vendor/three/three.module.min.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
// Small facade details stay visual: the original solid template owns collision.
export function finishLayoutArchitecture(root) {
 const frames=[],windows=[];
 const box=(list,size,x,y,z,yaw)=>{const g=new THREE.BoxGeometry(...size);g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(1,1,1)));list.push(g);};
 for(const item of [...root.children]){
  const p=item.geometry?.parameters;if(!item.name.startsWith('BUILDER_TEMPLATE_')||!p||p.width<4||p.height<2.5||p.depth<3)continue;
  const yaw=item.rotation.y,c=Math.cos(yaw),s=Math.sin(yaw),at=(x,y,z)=>[item.position.x+x*c+z*s,item.position.y+y,item.position.z-x*s+z*c];
  box(frames,[p.width+.12,.12,p.depth+.12],...at(0,p.height/2-.06,0),yaw);
  for(const side of [-1,1])for(let x=-p.width/2+1;x<p.width/2-.5;x+=1.8){
   box(frames,[1.2,1.15,.04],...at(x,.25,side*(p.depth/2+.025)),yaw);
   box(windows,[1.02,.94,.045],...at(x,.25,side*(p.depth/2+.05)),yaw);
  }
 }
 const group=new THREE.Group();group.name='LAYOUT_FACADE_DETAILS';group.userData.collisionDisabled=true;
 for(const [parts,color,metalness,roughness]of [[frames,0x28343b,.25,.65],[windows,0x699ba8,.45,.24]]){
  if(!parts.length)continue;const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,metalness,roughness}));mesh.userData.streetVisual=true;mesh.userData.collisionDisabled=true;mesh.receiveShadow=true;group.add(mesh);
 }
 root.add(group);return group;
}
