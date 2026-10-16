import * as THREE from '../../vendor/three/three.module.min.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
export function createServerStreets(streets=[],{labels=false,heightAt=()=>0}={}){
 const group=new THREE.Group();group.name='SERVER_STREETS';const roads=[],markings=[],paving=[];
 const box=(size,position,yaw=0,pitch=0)=>{const geometry=new THREE.BoxGeometry(...size),matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ')),new THREE.Vector3(1,1,1));geometry.applyMatrix4(matrix);return geometry;};
 for(const street of streets){const dx=street.to.x-street.from.x,dz=street.to.z-street.from.z,length=Math.hypot(dx,dz);if(!Number.isFinite(length)||length<2)continue;const yaw=Math.atan2(dx,dz),segments=Math.ceil(length/8);
  for(let segment=0;segment<segments;segment++){const a=segment/segments,b=(segment+1)/segments,x1=street.from.x+dx*a,z1=street.from.z+dz*a,x2=street.from.x+dx*b,z2=street.from.z+dz*b,h1=heightAt(x1,z1),h2=heightAt(x2,z2),span=length/segments;roads.push(box([street.width,.04,Math.hypot(span,h2-h1)+.03],[(x1+x2)/2,(h1+h2)/2+.025,(z1+z2)/2],yaw,-Math.atan2(h2-h1,span)));}
  // Narrow, terrain-following paving frames roads without adding raised collision seams.
  if(street.width>=5)for(const side of [-1,1])for(let segment=0;segment<segments;segment++){
   const a=segment/segments,b=(segment+1)/segments,offset=side*(street.width/2+.65),nx=Math.cos(yaw)*offset,nz=-Math.sin(yaw)*offset;
   const x1=street.from.x+dx*a+nx,z1=street.from.z+dz*a+nz,x2=street.from.x+dx*b+nx,z2=street.from.z+dz*b+nz,h1=heightAt(x1,z1),h2=heightAt(x2,z2),span=length/segments;
   paving.push(box([1.2,.018,Math.hypot(span,h2-h1)+.02],[(x1+x2)/2,(h1+h2)/2+.035,(z1+z2)/2],yaw,-Math.atan2(h2-h1,span)));
  }
  for(let distance=3;distance<length-1;distance+=8){const x=street.from.x+dx*distance/length,z=street.from.z+dz*distance/length;markings.push(box([.12,.01,2.7],[x,heightAt(x,z)+.052,z],yaw));}
  if(labels&&typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=80;const context=canvas.getContext('2d');if(!context)continue;context.fillStyle='#10382e';context.fillRect(0,0,512,80);context.strokeStyle='#e2fff1';context.lineWidth=4;context.strokeRect(3,3,506,74);context.font='bold 34px sans-serif';context.textAlign='center';context.fillStyle='#fff';context.fillText(street.name,256,52,490);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:true}));const x=street.from.x+dx*.35,z=street.from.z+dz*.35+street.width/2+.6;sprite.position.set(x,heightAt(x,z)+2.5,z);sprite.scale.set(9,1.4,1);sprite.userData.streetVisual=true;group.add(sprite);}
 }
 for(const [geometries,material]of [[paving,new THREE.MeshStandardMaterial({color:0x8b9690,roughness:.92})],[roads,new THREE.MeshStandardMaterial({color:0x303d42,roughness:.95})],[markings,new THREE.MeshBasicMaterial({color:0xf5e4a3})]]){if(!geometries.length){material.dispose();continue;}const merged=mergeGeometries(geometries);geometries.forEach(geometry=>geometry.dispose());const mesh=new THREE.Mesh(merged,material);mesh.receiveShadow=true;mesh.userData.streetVisual=true;group.add(mesh);}
 return group;
}
export function replaceServerStreets(root,streets,options){const procedural=root.userData.proceduralLand?root:root.children.find(child=>child.userData.proceduralLand);if(procedural&&procedural!==root)return replaceServerStreets(procedural,streets,options);const old=root.getObjectByName('SERVER_STREETS');if(old){old.removeFromParent();old.traverse(item=>{item.geometry?.dispose();item.material?.map?.dispose();item.material?.dispose();});}root.add(createServerStreets(streets,{heightAt:root.userData.streetHeightAt,...options}));}
