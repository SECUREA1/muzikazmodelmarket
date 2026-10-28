import {finishGameItem} from './game-item-finish.js';
import {finishNativeSurfaces} from './native-surface-finish.js';
import {NATIVE_DESIGN_VERSION} from './native-design-profile.js';
import {supportsTransportDesign,finishTransportDesign} from './transport-design-finish.js';
import {supportsArchitectureDesign,finishArchitectureDesign} from './architecture-design-finish.js';
import {supportsDeviceDesign,finishDeviceDesign} from './device-design-finish.js';
import {finishWorldPropDesign} from './world-prop-design-finish.js';
import {finishVehicleDesign} from './vehicle-design-system.js';
import {MOUNTAIN_DESIGN_VERSION,isCraftedMountainModel} from './mountain-design-profile.js';

export {NATIVE_DESIGN_VERSION};
const craftedFlags=['portalModel','commonPropModel','equipmentPropModel','craftedLandscapeModel','craftedCharacterModel','craftedBuildingModel','craftedFurnitureModel'];
export function finishNativeDesign(T,root,id){
 if(!root||root.userData.nativeDesign?.version===NATIVE_DESIGN_VERSION)return root;
 let family='world-props';
 if(id.startsWith('material:'))family='construction-materials';
 else if(craftedFlags.some(key=>root.userData[key]))family='crafted-collection';
 else if(supportsTransportDesign(id)){family='transport';finishTransportDesign(T,root,id);}
 else if(supportsArchitectureDesign(id)){family='architecture';finishArchitectureDesign(T,root,id);}
 else if(supportsDeviceDesign(id)){family='devices-sports';finishDeviceDesign(T,root,id);}
 else finishWorldPropDesign(T,root,id);
 finishVehicleDesign(T,root,id);
 const geometries=new Set();root.traverse(node=>{if(node.isMesh&&node.geometry)geometries.add(node.geometry);});
 // Construction geometry is also the authoritative walkable surface. Keep its
 // original faces, treads and uninterrupted slab edges; the material factory
 // already supplies the crafted surface maps for every shape.
 if(!id.startsWith('material:'))finishGameItem(T,root);
 finishNativeSurfaces(T,root,id);
 let geometryCount=0,detailCount=0,meshCount=0;const materials=new Set(),texturedMaterials=new Set();
 root.traverse(node=>{
  if(!node.isMesh)return;meshCount++;
  if(!geometries.has(node.geometry))geometryCount++;
  if(node.userData.nativeDesignDetail)detailCount+=node.isInstancedMesh?node.count:1;
  for(const material of [].concat(node.material||[]))if(material.userData.nativeSurfaceVersion===NATIVE_DESIGN_VERSION){materials.add(material);if(material.map)texturedMaterials.add(material);}
  // Existing authored rig references and media node identities are retained.
  if(!node.userData.builderRoot)node.userData.builderRoot=root;
 });
 root.userData.builderObject=true;root.userData.modelId=id;
 root.userData.nativeDesign={version:NATIVE_DESIGN_VERSION,id,family,materialCount:materials.size,texturedMaterialCount:texturedMaterials.size,geometryCount,detailCount,meshCount};
 if(isCraftedMountainModel(id))root.userData.mountainDesign={version:MOUNTAIN_DESIGN_VERSION,id,meshCount,texturedMaterialCount:texturedMaterials.size};
 return root;
}
