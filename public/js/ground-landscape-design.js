// Six small, immutable surface sets are shared by every native landscape.
// Detail is baked once: no images, canvas, network, frame work or extra meshes.
export const GROUND_LANDSCAPE_VERSION='crafted-landscape-v1';
export const GROUND_LANDSCAPE_PROFILES=Object.freeze(['grass','soil','gravel','sand','paving','asphalt']);
const SIZE=128,TILE_METRES=4,libraries=new WeakMap(),profiles=new Set(GROUND_LANDSCAPE_PROFILES);
const clamp=v=>Math.max(0,Math.min(1,v)),mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const wrap=(v,n)=>((v%n)+n)%n;
function hash(x,y,seed){let n=Math.imul(x+seed*13,374761393)+Math.imul(y+seed*7,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(u,v,cells,seed=0){
 const x=u*cells,y=v*cells,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
 const at=(a,b)=>hash(wrap(a,cells),wrap(b,cells),seed);
 return mix(mix(at(ix,iy),at(ix+1,iy),sx),mix(at(ix,iy+1),at(ix+1,iy+1),sx),sy);
}
function sample(kind,u,v){
 const broad=noise(u,v,4,2),mottle=noise(u,v,12,5),fine=noise(u,v,64,11);let rgb,height,roughness;
 if(kind==='grass'){
  const dry=smooth(.55,.84,broad),soil=smooth(.63,.86,mottle)*smooth(.40,.73,broad);
  rgb=[.91+mottle*.065+dry*.02-soil*.025,.94+mottle*.055-soil*.055,.86+mottle*.085-dry*.02-soil*.035];
  height=.40+mottle*.035+fine*.14-soil*.025;roughness=.88+fine*.12;
 }else if(kind==='soil'){
  const pebble=smooth(.78,.91,fine)*smooth(.39,.68,mottle),clod=smooth(.30,.67,mottle);
  rgb=[.88+broad*.08+pebble*.05,.85+broad*.09+pebble*.06,.78+broad*.11+pebble*.09];
  height=.29+clod*.22+pebble*.11+fine*.04;roughness=.90+fine*.10;
 }else if(kind==='gravel'){
  const stone=smooth(.65,.87,fine),grain=.86+broad*.035+fine*.095+stone*.035;
  rgb=[grain*.99,grain,grain*.975];height=.38+fine*.10+stone*.06+mottle*.025;roughness=.84+fine*.13;
 }else if(kind==='sand'){
  const ripple=Math.sin(v*Math.PI*24+Math.sin(u*Math.PI*4)*.55)*.5+.5,grain=.94+ripple*.025+fine*.025;
  rgb=[grain,grain*.985,grain*.94];height=.42+ripple*.10+fine*.035;roughness=.93+fine*.07;
 }else if(kind==='paving'){
  const row=Math.floor(v*4),x=u*4+(row%2)*.5,z=v*4,edge=Math.min(x-Math.floor(x),1-(x-Math.floor(x)),z-Math.floor(z),1-(z-Math.floor(z))),joint=1-smooth(.018,.05,edge),cell=hash(wrap(Math.floor(x),4),wrap(row,4),23),grain=.88+cell*.075+fine*.025;
  rgb=[grain-joint*.19,grain-joint*.18,grain*.985-joint*.17];height=.56-joint*.28+mottle*.025;roughness=.83+fine*.11+joint*.04;
 }else{
  const aggregate=smooth(.74,.90,fine),grain=.87+broad*.045+mottle*.025+aggregate*.055;
  rgb=[grain*.985,grain,grain*1.005];height=.45+fine*.065+aggregate*.03;roughness=.89+fine*.10;
 }
 return [rgb.map(clamp),clamp(height),clamp(roughness)];
}

export function groundLandscapeTextures(T,kind='grass'){
 if(!profiles.has(kind))throw new RangeError('Unknown ground landscape profile: '+kind);
 let library=libraries.get(T);if(!library){library=new Map();libraries.set(T,library);}if(library.has(kind))return library.get(kind);
 const pixels=Array.from({length:3},()=>new Uint8Array(SIZE*SIZE*4));
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  const [rgb,height,roughness]=sample(kind,x/(SIZE-1),y/(SIZE-1)),offset=(y*SIZE+x)*4;
  pixels[0].set([...rgb.map(v=>Math.round(v*255)),255],offset);
  for(const [index,value]of [[1,height],[2,roughness]]){const shade=Math.round(value*255);pixels[index].set([shade,shade,shade,255],offset);}
 }
 const textures=pixels.map((data,index)=>{
  const texture=new T.DataTexture(data,SIZE,SIZE,T.RGBAFormat);texture.name='GROUND_LANDSCAPE_'+kind.toUpperCase()+['_ALBEDO','_HEIGHT','_ROUGHNESS'][index];
  texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=2;
  texture.colorSpace=index===0?T.SRGBColorSpace:T.NoColorSpace;texture.userData={groundLandscapeShared:true,groundLandscapeProfile:kind};texture.needsUpdate=true;return texture;
 });
 const result=Object.freeze({map:textures[0],bumpMap:textures[1],roughnessMap:textures[2]});library.set(kind,result);return result;
}
export function groundLandscapeBudget(T){
 const library=libraries.get(T),count=library?.size||0,bytes=count*3*SIZE*SIZE*4;
 return {profiles:count,textures:count*3,resolution:SIZE,baseBytes:bytes,mipBytes:Math.ceil(bytes*4/3),maxProfiles:6,maxTextures:18,metresPerTile:TILE_METRES};
}
export function groundLandscapeProfile(layout=''){
 layout=String(layout).toLowerCase();
 if(/loft|suite|ski-resort|mountain-compound|fitness|casino|funhouse|hockey|basketball|arcade|firing-range/.test(layout))return null;
 if(/desert|dune/.test(layout))return 'sand';
 if(/sunrise-farm|farmland/.test(layout))return 'soil';
 if(/mountain-pass|crystal-cavern|deep-mine|railroad/.test(layout))return 'gravel';
 if(/skyport|blacksite|cargo-yard|neon-arena|factory|prison/.test(layout))return 'asphalt';
 if(/grand-floor|neon-maze|dungeon|vendor|studio|market|mall|office|urban-/.test(layout))return 'paving';
 if(/community-park|courtyard|hedge|forest|wetland|coastal|harbor|island|camp-/.test(layout))return 'grass';
 return null;
}

// Reuse the standard shader's UV varyings instead of changing shared geometry.
// This is compiled once; modelMatrix already follows editor/base transforms.
function projectionScale(material){
 const defined=Number(material?.defines?.GROUND_LANDSCAPE_UV_SCALE),saved=Number(material?.userData?.groundLandscape?.uvScale);
 return Number.isFinite(defined)&&defined>0?defined:Number.isFinite(saved)&&saved>0?saved:1/TILE_METRES;
}
function projectGroundMaps(shader){
 // StandardMaterial.copy resets custom defines. Effects such as the live RGB
 // slime floor retain this hook, so its serialized scale must survive copying.
 const uvScale=projectionScale(this).toPrecision(10);
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vec4 landscapePosition=vec4(transformed,1.0);
 #ifdef USE_BATCHING
  landscapePosition=batchingMatrix*landscapePosition;
 #endif
 #ifdef USE_INSTANCING
  landscapePosition=instanceMatrix*landscapePosition;
 #endif
 vec2 landscapeUv=(modelMatrix*landscapePosition).xz*${uvScale};
 #ifdef USE_MAP
  vMapUv=landscapeUv;
 #endif
 #ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv=landscapeUv;
 #endif
 #ifdef USE_BUMPMAP
  vBumpMapUv=landscapeUv;
 #endif`);
}
function groundProgramKey(){return GROUND_LANDSCAPE_VERSION+':uv-'+projectionScale(this);}
function applyGroundMaterial(T,material,kind){
 if(material.userData.groundLandscape?.version===GROUND_LANDSCAPE_VERSION)return false;
 const maps=groundLandscapeTextures(T,kind);material.map=maps.map;material.bumpMap=maps.bumpMap;material.roughnessMap=maps.roughnessMap;
 material.bumpScale=kind==='grass'?.004:kind==='gravel'?.004:kind==='sand'?.009:kind==='paving'?.008:.012;
 material.defines={...material.defines,GROUND_LANDSCAPE_UV_SCALE:1/TILE_METRES};
 material.onBeforeCompile=projectGroundMaps;material.customProgramCacheKey=groundProgramKey;
 material.userData={...material.userData,groundLandscape:{version:GROUND_LANDSCAPE_VERSION,profile:kind,metresPerTile:TILE_METRES,uvScale:1/TILE_METRES}};material.needsUpdate=true;return true;
}
export function createLandscapeGroundMaterial(T,{kind='grass',vertexColors=true,color=0xffffff}={}){
 const material=new T.MeshStandardMaterial({color,vertexColors,roughness:.94,metalness:0});applyGroundMaterial(T,material,kind);return material;
}
// A tabletop/AR viewer can compensate its one-time presentation scale without
// resizing maps or touching geometry. This changes only a static shader define.
export function setGroundLandscapeProjectionScale(root,scale=1){
 if(!Number.isFinite(scale)||scale<=0)throw new RangeError('Landscape presentation scale must be positive.');
 const value=Number((1/(TILE_METRES*scale)).toPrecision(10)),seen=new Set();
 root?.traverse(node=>{for(const material of [].concat(node.material||[])){
  if(!material?.userData.groundLandscape||seen.has(material))continue;seen.add(material);
  if(material.userData.groundLandscape.uvScale!==value)material.userData={...material.userData,groundLandscape:{...material.userData.groundLandscape,uvScale:value}};
  if(material.defines?.GROUND_LANDSCAPE_UV_SCALE===value)continue;
  material.defines={...material.defines,GROUND_LANDSCAPE_UV_SCALE:value};material.needsUpdate=true;
 }});return root;
}
const graphics=/SCREEN|DISPLAY|LABEL|DECAL|SIGN|SCORE|VIDEO|FEED|WATER|SWIM|DOCK|PIER|APPROACH|WOOD|CHATEAU|CHALET|SANDSTONE_WALKWAY/i;
const isGround=node=>node.isMesh&&!node.userData.collisionOnly&&!node.userData.mediaScreen&&!node.userData.mediaSurface&&!graphics.test(node.name||'')&&(/^(?:BUILDER_WALKABLE_FLOOR(?:_|$)|(?:PROVING|FACTORY|PRISON)_WALKABLE_FLOOR$|HARBOR_SHORELINE_)/.test(node.name||'')||node.userData.streetVisual===true&&node.material?.isMeshStandardMaterial);
const authored=texture=>texture&&!texture.userData.nativeMaterialSurface&&!texture.userData.groundLandscapeShared;
export function finishGroundLandscape(T,root,environment={}){
 if(!root||root.userData.groundLandscapeDesign?.version===GROUND_LANDSCAPE_VERSION||environment.memberPlot||environment.visibility==='private'||environment.modelUrl||environment.modelUrls?.length||environment.builderScene?.baseEnvironment?.modelUrl||environment.builderScene?.baseEnvironment?.modelUrls?.length||/(?:^|[-_:])(?:member|custom|upload|uploaded|user|marketplace)(?:$|[-_:])/.test(String(environment.source||'').toLowerCase()))return root;
 const layout=environment.builderScene?.sourceLayout||environment.builderScene?.layout||environment.layout||root.userData.layout||'',profile=groundLandscapeProfile(layout);
 if(!profile)return root;
 const candidates=[],protectedMaterials=new Set();
 root.traverse(node=>{if(!node.isMesh)return;if(isGround(node)&&node.visible!==false)candidates.push(node);else for(const material of [].concat(node.material||[]))protectedMaterials.add(material);});
 let finished=0,meshes=0;const seen=new Set();
 for(const node of candidates){
  let affected=false;
  let kind=/HARBOR_SHORELINE/.test(node.name)?'sand':profile;
  if(node.userData.streetVisual){const color=node.material.color;kind=color&&Math.max(color.r,color.g,color.b)<.18?'asphalt':'paving';}
  for(const material of [].concat(node.material||[])){
   if(seen.has(material)){affected=true;continue;}
   if(protectedMaterials.has(material)||!material?.isMeshStandardMaterial||material.transparent||!material.visible||authored(material.map)||authored(material.roughnessMap)||authored(material.bumpMap)||material.normalMap||material.onBeforeCompile!==T.Material.prototype.onBeforeCompile&&material.onBeforeCompile!==projectGroundMaps)continue;
   seen.add(material);if(applyGroundMaterial(T,material,kind))finished++;affected=true;
  }
  if(affected)meshes++;
 }
 if(meshes)root.userData.groundLandscapeDesign={version:GROUND_LANDSCAPE_VERSION,profile,materials:seen.size,newMaterials:finished,meshes,addedMeshes:0,metresPerTile:TILE_METRES};return root;
}
