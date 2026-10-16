import {extrudeArtwork} from './drawn-item-3d.js';
// Use the caller's Three instance in both the editor and the published world.
export function createImageProp(THREE,url,settings={}){
  const root=new THREE.Group();
  const material=new THREE.MeshStandardMaterial({transparent:true,side:THREE.DoubleSide,roughness:.8});
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.5),material);
  panel.position.y=.75;root.add(panel);
  new THREE.TextureLoader().load(url,texture=>{if(settings.extruded){try{const shape=extrudeArtwork(THREE,texture.image,settings);root.remove(panel);panel.geometry.dispose();material.dispose();texture.dispose();root.add(shape);return;}catch(error){console.warn('Drawing extrusion unavailable',error);}}texture.colorSpace=THREE.SRGBColorSpace;material.map=texture;material.needsUpdate=true;});
  return root;
}
