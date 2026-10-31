import {finishNativeSurfaces} from '../native-surface-finish.js';
import {NATIVE_DESIGN_VERSION} from '../native-design-profile.js';
import {finishGroundLandscape} from '../ground-landscape-design.js';

// Backpack map aliases use the same authored procedural constructors as the
// editor and the game. Imported GLB scenes and private/member maps keep their
// existing surface pipeline rather than inheriting a repository-map restyle.
export const NATIVE_TEMPLATE_LAYOUT_IDS=Object.freeze([
 'grand-floor','loft','suite','courtyard','hedge-maze','neon-maze','dungeon-maze',
 'vendor-street','creator-studios','market-square','mountain-pass','crystal-cavern',
 'railroad-world','skyport','deep-mine','sunrise-farm','coastal-cliffs',
 'ancient-forest','neon-wetlands','desert-airfield','dune-sea','blacksite',
 'cargo-yard','neon-arena','desert-outpost','mega-mall','office-tower',
 'firing-range','movie-studio','basketball-stadium','hockey-arena','arcade-park'
]);
const templates=new Set(NATIVE_TEMPLATE_LAYOUT_IDS);
const nativeSpecialLayouts=new Set(['underground-bunker','world-item-factory','prison','factory-proving-grounds','mountain-compound','missile-factory','fitness-centre','clown-funhouse','casino','ski-resort','tropical-island','harbor']);
const nativeSpecialIds=new Set(['world-item-factory','ironwood-prison','muzikaz-factory-proving-grounds','muzikaz-mountain-compound','muzikaz-missile-factory','palm-coast-resort']);
export function isNativeProceduralWorld(environment={}){
 if(!environment||environment.memberPlot||environment.visibility==='private')return false;
 const source=String(environment.source||'').toLowerCase();
 if(/(?:^|[-_:])(?:member|custom|upload|uploaded|user|marketplace)(?:$|[-_:])/.test(source))return false;
 if(environment.modelUrl||environment.modelUrls?.length||environment.builderScene?.baseEnvironment?.modelUrl||environment.builderScene?.baseEnvironment?.modelUrls?.length)return false;
 const scene=environment.builderScene||{},layout=scene.sourceLayout||scene.layout||environment.layout;
 return templates.has(layout)||nativeSpecialLayouts.has(layout)||nativeSpecialIds.has(environment.id)||scene.layoutMeta?.harbor===true||Boolean(scene.layoutMeta?.harbor)||source==='repository'&&Boolean(environment.proceduralLand||environment.builderScene)||source==='community-atlas'&&Boolean(environment.proceduralLand||environment.builderScene)||String(layout||'').startsWith('urban-')||String(layout||'').startsWith('camp-');
}

export function finishNativeWorldDesign(T,root,environment={}){
 if(!root||!isNativeProceduralWorld(environment)||root.userData.nativeWorldDesign?.version===NATIVE_DESIGN_VERSION)return root;
 const layout=environment.builderScene?.sourceLayout||environment.builderScene?.layout||environment.layout||environment.id||'procedural';
 // The resident qualifier disables colour-only timber guesses on unnamed skin
 // in monolithic world character rigs. Named wood, stone, metal and cloth still
 // receive their appropriate grain, roughness and surface relief.
 finishNativeSurfaces(T,root,'native-world-resident:'+layout);
 finishGroundLandscape(T,root,environment);
 const materials=new Set(),textured=new Set();root.traverse(node=>{if(!node.isMesh)return;for(const material of [].concat(node.material||[]))if(material.userData.nativeSurfaceVersion===NATIVE_DESIGN_VERSION){materials.add(material);if(material.map)textured.add(material);}});
 root.userData.nativeWorldDesign={version:NATIVE_DESIGN_VERSION,layout,materialCount:materials.size,texturedMaterialCount:textured.size};
 return root;
}
