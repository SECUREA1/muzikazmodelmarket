import {nativeSurfaceTextures} from './material-design-finish.js';
import {NATIVE_DESIGN_VERSION} from './native-design-profile.js';

const protectedSurface=node=>node.userData.mediaScreen||node.userData.mediaSurface||node.userData.collisionOnly||node.userData.collisionDisabled&&node.userData.portalEffect||/SCREEN|DISPLAY|TEXT|LETTER|LABEL|SIGN_FACE|SCOREBOARD|DECAL|VIDEO|FEED|LCD|LED_MATRIX/i.test(node.name||'');

// Hand-built hulls, terrain and garments often contain positions/normals only.
// Their native surface maps need real coordinates; adding the missing attribute
// keeps vertex/index identities, articulated rigs and collision faces unchanged.
export function ensureNativeSurfaceUVs(T,geometry){
 if(!geometry||geometry.getAttribute('uv'))return false;
 const position=geometry.getAttribute('position');if(!position||position.count<3)return false;
 const bounds=new T.Box3().setFromBufferAttribute(position),size=bounds.getSize(new T.Vector3()),minimum=bounds.min.toArray(),span=size.toArray();
 if(![...minimum,...span].every(Number.isFinite))return false;
 const normal=geometry.getAttribute('normal'),pairs=[[2,1],[0,2],[0,1]],fallback=pairs.reduce((best,pair)=>span[pair[0]]*span[pair[1]]>span[best[0]]*span[best[1]]?pair:best,pairs[0]),uv=new Float32Array(position.count*2);
 for(let index=0;index<position.count;index++){
  const p=[position.getX(index),position.getY(index),position.getZ(index)],n=normal?[normal.getX(index),normal.getY(index),normal.getZ(index)]:[0,0,0],axis=n.reduce((best,value,candidate)=>Math.abs(value)>Math.abs(n[best])?candidate:best,0);
  let pair=normal?pairs[axis]:fallback;
  if(span[pair[0]]<1e-8||span[pair[1]]<1e-8)pair=fallback;
  uv[index*2]=(p[pair[0]]-minimum[pair[0]])/(span[pair[0]]||1);
  uv[index*2+1]=(p[pair[1]]-minimum[pair[1]])/(span[pair[1]]||1);
 }
 geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 geometry.userData.nativeSurfaceUV='box-projected-v1';return true;
}
function surfaceKind(node,material,id){
 const name=(node.name+' '+(material.name||'')).toLowerCase(),color=material.color;
 if(material.transparent)return /water|pond|river/.test(name+' '+id)?'water':/ice|glacier/.test(name)?'ice':'glass';
 if(/snow_edge_stone/.test(name))return 'stone';
 if(/snow|powder|drift_crest/.test(name))return 'snow';
 if(/rock_face|rock_cut|rock_ridges|rock_outcrop|sediment|scree/.test(name))return 'stone';
 if(/eye|pupil|face|skin|flame|ember|liquid|crystal|gem|soul|glow|light/.test(name))return 'satin';
 if(/fabric|cloth|cushion|shade|mattress|pillow|upholstery|robe|sleeve|tunic|carpet|padding|towel|hat|banner|canvas|shirt|sail|seat_cover/.test(name))return 'fabric';
 if(material.metalness>=.42||/steel|brass|chrome|alloy|metal|rail|fastener|bolt|hinge|pipe/.test(name))return 'metal';
 if(/tyre|tire|rubber|grip|tread/.test(name))return 'rubber';
 if(/marble|porcelain|ceramic|basin/.test(name))return 'marble';
 if(/timber|wood|bark|plank|walnut|oak|shelf|drawer|cabinet|deck_board|log|beam/.test(name))return 'timber';
 if(/leaf|foliage|moss|grass|hedge|bough|frond/.test(name))return 'foliage';
 if(/stone|rock|cliff|mineral_(?:seam|vein)|crater|impact_bowl|concrete|cement|foundation|masonry|brick/.test(name))return 'stone';
 if(color&&material.roughness>.75){
  if(color.g>color.r*1.2&&color.g>color.b*1.1)return 'foliage';
  if(!/avatar|knight|ranger|merchant|hero|scout|resident|clown|inmate|ghost|beast|wolf/.test(id)&&color.r>color.g*1.18&&color.g>color.b*1.12)return 'timber';
  if(Math.max(color.r,color.g,color.b)-Math.min(color.r,color.g,color.b)<.16)return 'stone';
 }
 return 'satin';
}

// Give every opaque native surface an authored finish while preserving graphics,
// media, paint colour, transparency, emission and all pre-existing texture maps.
export function finishNativeSurfaces(T,root,id=''){
 const localMaterials=new Map(),textures=new Map();let materialCount=0,texturedMaterialCount=0;
 const protectedMaterials=new Set();
 root.traverse(node=>{if(node.isMesh&&protectedSurface(node))for(const material of [].concat(node.material||[]))protectedMaterials.add(material);});
 const textureFor=(kind,key)=>{
  const name=kind+':'+key;if(!textures.has(name))textures.set(name,nativeSurfaceTextures(T,kind)[key].clone());return textures.get(name);
 };
 root.traverse(node=>{
  if(!node.isMesh||protectedSurface(node))return;
  const transform=source=>{
   if(!source?.isMeshStandardMaterial||protectedMaterials.has(source)||source.userData.nativeSurfaceVersion===NATIVE_DESIGN_VERSION)return source;
   if(localMaterials.has(source))return localMaterials.get(source);
   // Keep the factory's material object: animation closures, resident palettes
   // and live controls can hold it directly. Editor copies get isolated material
   // instances through cloneBuilderRuntime; this pass changes no paint colours.
   const material=source,kind=surfaceKind(node,material,id);localMaterials.set(source,material);
   if(!material.userData.nativeMaterialDesign){
    if(!material.map){material.map=textureFor(kind,'map');texturedMaterialCount++;}
    if(!material.roughnessMap)material.roughnessMap=textureFor(kind,'roughnessMap');
    if(!material.bumpMap&&!material.normalMap&&!['satin','glass','water'].includes(kind)){
     material.bumpMap=textureFor(kind,'bumpMap');material.bumpScale=kind==='fabric'?.0015:kind==='metal'?.0007:.0025;
    }
   }else if(material.map)texturedMaterialCount++;
   material.userData={...material.userData,nativeSurfaceVersion:NATIVE_DESIGN_VERSION,nativeSurface:kind};
   material.needsUpdate=true;materialCount++;return material;
  };
  node.material=Array.isArray(node.material)?node.material.map(transform):transform(node.material);
  if([].concat(node.material||[]).some(material=>material?.userData.nativeSurfaceVersion===NATIVE_DESIGN_VERSION&&(material.map||material.roughnessMap||material.bumpMap||material.normalMap)))ensureNativeSurfaceUVs(T,node.geometry);
 });
 const previous=root.userData.nativeSurfaceFinish;
 root.userData.nativeSurfaceFinish={version:NATIVE_DESIGN_VERSION,materialCount:(previous?.materialCount||0)+materialCount,texturedMaterialCount:(previous?.texturedMaterialCount||0)+texturedMaterialCount};
 return root;
}
