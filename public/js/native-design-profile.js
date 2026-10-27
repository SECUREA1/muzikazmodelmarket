// Shared catalog/renderer identity. This module deliberately has no renderer or
// economy imports, so native definitions can use it on both server and browser.
export const NATIVE_DESIGN_VERSION='crafted-native-v3';
export function nativeDesignThumbnail(id){
 return '/public/images/native-designs/'+String(id).replace(/[^a-z0-9_-]/gi,'-')+'.svg';
}
