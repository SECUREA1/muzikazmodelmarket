// Shared catalog/renderer identity. This module deliberately has no renderer or
// economy imports, so native definitions can use it on both server and browser.
import {isCraftedVehicleDesign} from './vehicle-design-profile.js';
import {isCraftedMountainPreview} from './mountain-design-profile.js';
export const NATIVE_DESIGN_VERSION='crafted-native-v3';
export function nativeDesignThumbnail(id){
 const revision=isCraftedVehicleDesign(id)?'-vehicle-v1':isCraftedMountainPreview(id)?'-mountain-v1':'';
 return '/public/images/native-designs/'+String(id).replace(/[^a-z0-9_-]/gi,'-')+revision+'.svg';
}
