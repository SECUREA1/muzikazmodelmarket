// Shared identity without renderer dependencies for catalogs and game factories.
export const MOUNTAIN_DESIGN_VERSION='crafted-mountains-v1';
export const MOUNTAIN_DESIGN_IDS=Object.freeze([
 'alpine-mountain','terrain-cliff','terrain-crater','terrain-snowbank'
]);
export const MOUNTAIN_TEMPLATE_LAYOUT_IDS=Object.freeze(['mountain-pass']);
export const MOUNTAIN_PREVIEW_IDS=Object.freeze([
 ...MOUNTAIN_DESIGN_IDS,'layout:mountain-pass'
]);
const models=new Set(MOUNTAIN_DESIGN_IDS),previews=new Set(MOUNTAIN_PREVIEW_IDS);
export const isCraftedMountainModel=id=>models.has(id);
export const isCraftedMountainPreview=id=>previews.has(id);
