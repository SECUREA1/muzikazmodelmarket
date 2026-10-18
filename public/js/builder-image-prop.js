import {drawingCollisionModel} from './placed-item-collision.js';
import {extrudeArtwork} from './drawn-item-3d.js';
// Use the caller's Three instance in both the editor and the published world.
export function createImageProp(THREE,url,settings={}){
  const root=new THREE.Group(),collider=drawingCollisionModel(THREE,settings);collider.traverse(mesh=>{if(mesh.isMesh){mesh.visible=false;mesh.name='COLLIDER_DRAWN_ITEM';mesh.userData.collider=true;}});root.add(collider);
  const material=new THREE.MeshStandardMaterial({transparent:true,side:THREE.DoubleSide,roughness:.8});
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.5),material);
  panel.userData.collisionDisabled=true;panel.position.y=.75;root.add(panel);
  new THREE.TextureLoader().load(url,texture=>{if(settings.extruded){try{const shape=extrudeArtwork(THREE,texture.image,settings);root.remove(panel);panel.geometry.dispose();material.dispose();texture.dispose();shape.traverse(mesh=>{if(mesh.isMesh)mesh.userData.collisionDisabled=true;});root.add(shape);return;}catch(error){console.warn('Drawing extrusion unavailable',error);}}texture.colorSpace=THREE.SRGBColorSpace;material.map=texture;material.needsUpdate=true;});
  return root;
}
