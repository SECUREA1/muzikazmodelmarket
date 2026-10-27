// A shared, DOM-free surface library for all native construction pieces.
// Small tileable height/albedo maps add actual surface work without changing
// walkable geometry, opening apertures or the colour selected by a builder.
const libraries=new WeakMap();
const SIZE=64;
const fract=value=>value-Math.floor(value);
const noise=(x,y,seed=0)=>fract(Math.sin(x*127.1+y*311.7+seed*74.7)*43758.5453);
const smooth=(a,b,t)=>a+(b-a)*(t*t*(3-2*t));
function valueNoise(x,y){
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 return smooth(smooth(noise(ix,iy),noise(ix+1,iy),fx),smooth(noise(ix,iy+1),noise(ix+1,iy+1),fx),fy);
}
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const seam=(value,frequency,width)=>{const f=fract(value*frequency);return Math.min(f,1-f)<width;};

function sample(kind,u,v){
 const grain=valueNoise(u*18,v*18),fine=noise(Math.floor(u*SIZE),Math.floor(v*SIZE),2),edge=Math.min(u,v,1-u,1-v);
 let albedo=.95,height=.5,roughness=.97;
 if(kind==='timber'){
  const board=Math.floor(u*3),flow=Math.sin(v*61+Math.sin(u*28+board)*3+valueNoise(u*9,v*2)*4),ring=Math.sin(v*145+Math.sin(u*19)*4);
  albedo=.84+flow*.045+ring*.025+fine*.035+board*.018;
  height=.48+flow*.09+ring*.035;
  if(seam(u,3,.025)){albedo=.56;height=.2;}
  roughness=.87+fine*.12;
 }else if(kind==='masonry'){
  const row=Math.floor(v*3),stagger=u+(row%2)*.125,mortar=seam(v,3,.055)||seam(stagger,4,.045);
  albedo=mortar?.82:.88+grain*.1+noise(Math.floor(stagger*4),row)*.035;
  height=mortar?.2:.58+grain*.09;roughness=.94+fine*.06;
 }else if(kind==='marble'){
  const vein=Math.abs(Math.sin(u*15+Math.sin(v*8)*1.6+valueNoise(u*5,v*5)*2.4));
  albedo=.98-(vein<.11?.14:vein<.2?.055:0);height=.5+grain*.012;roughness=.8+grain*.18;
 }else if(kind==='stone'){
  const strata=Math.sin(v*45+valueNoise(u*6,v*8)*2.8),speck=fine>.96;
  albedo=.89+grain*.085+strata*.018+(speck?.035:0);height=.45+grain*.16+strata*.018;roughness=.92+fine*.08;
 }else if(kind==='earth'){
  albedo=.87+grain*.09+fine*.04;height=.33+grain*.26+fine*.07;roughness=.94+fine*.06;
 }else if(kind==='foliage'){
  const leaf=Math.sin(u*85+Math.sin(v*31)*3)*Math.sin(v*71);
  albedo=.85+grain*.09+leaf*.04;height=.42+grain*.12+leaf*.06;roughness=.93+fine*.07;
 }else if(kind==='sand'){
  const ripple=Math.sin(v*54+Math.sin(u*9)*1.8);
  albedo=.93+fine*.045+ripple*.014;height=.42+fine*.12+ripple*.025;roughness=.96+fine*.04;
 }else if(kind==='metal'){
  const brushed=noise(Math.floor(u*SIZE),1,7),joint=seam(u,1,.025)||seam(v,1,.025);
  albedo=.93+brushed*.035;roughness=.78+brushed*.21;height=.5+(brushed-.5)*.045;
  if(joint){albedo=.72;height=.26;roughness=.95;}
  for(const x of [.09,.91])for(const y of [.09,.91]){const r=Math.hypot(u-x,v-y);if(r<.025){albedo=r<.011?.7:1;height=r<.011?.38:.64;}}
 }else if(kind==='rubber'){
  const grip=seam(u+v,8,.09)||seam(u-v,8,.09);
  albedo=.89+(grip?.035:0)+fine*.035;height=grip?.58:.4;roughness=.96+fine*.04;
 }else if(kind==='ceramic'){
  const grout=seam(u,2,.035)||seam(v,2,.035);
  albedo=grout?.75:.97+grain*.025;height=grout?.24:.55;roughness=grout?1:.74+grain*.15;
 }else if(kind==='water'){
  const ripples=Math.sin(u*25+Math.sin(v*17)*1.3)+Math.cos(v*29+Math.sin(u*13)*1.1);
  albedo=.94+ripples*.025;height=.5+ripples*.12;roughness=.8+grain*.15;
 }else if(kind==='glass'){
  albedo=.985+(edge<.04?.015:0);height=.5;roughness=.92+grain*.06;
 }else if(kind==='ice'){
  const crack=Math.abs(Math.sin(u*24+Math.sin(v*11)*3));
  albedo=.97-(crack<.045?.08:0);height=crack<.045?.35:.5;roughness=.75+grain*.22;
 }else if(kind==='snow'){
  albedo=.975+fine*.025;height=.49+fine*.055+grain*.025;roughness=.96+fine*.04;
 }else if(kind==='fabric'){
  const weave=(Math.floor(u*SIZE)%2?1:-1)*(Math.floor(v*SIZE)%2?1:-1);
  albedo=.96+weave*.018+fine*.014;height=.5+weave*.08;roughness=.92+fine*.08;
 }else{
  // Smooth moulded pieces still receive a visible satin face and a shallow
  // mould seam, rather than inheriting the rough mineral finish of stone.
  albedo=.98+fine*.012;height=.5;roughness=.9+grain*.1;
 }
 // A restrained face-edge highlight makes compounds readable at game distance.
 const edgeLight=edge<.025?.025:edge<.055?.012:0;
 return [clamp(albedo+edgeLight),clamp(height),clamp(roughness)];
}

function surfaceTextures(T,kind){
 let library=libraries.get(T);if(!library){library=new Map();libraries.set(T,library);}
 if(library.has(kind))return library.get(kind);
 const images=Array.from({length:3},()=>new Uint8Array(SIZE*SIZE*4));
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  const values=sample(kind,(x+.5)/SIZE,(y+.5)/SIZE),offset=(y*SIZE+x)*4;
  values.forEach((value,index)=>{const shade=Math.round(value*255);images[index].set([shade,shade,shade,255],offset);});
 }
 const textures=images.map((data,index)=>{
  const texture=new T.DataTexture(data,SIZE,SIZE,T.RGBAFormat);texture.wrapS=texture.wrapT=T.RepeatWrapping;
  texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;
  texture.colorSpace=index===0?T.SRGBColorSpace:T.NoColorSpace;texture.needsUpdate=true;
  texture.name='NATIVE_CRAFTED_'+kind.toUpperCase()+['_ALBEDO','_HEIGHT','_ROUGHNESS'][index];
  texture.userData={nativeMaterialSurface:kind};return texture;
 });
 const result={map:textures[0],bumpMap:textures[1],roughnessMap:textures[2]};library.set(kind,result);return result;
}

function classify(profile,material){
 const id=profile.id.toLowerCase();
 if(material.transparent)return /water/.test(id)?'water':/ice/.test(id)?'ice':'glass';
 if(/marble/.test(id))return 'marble';
 if(/snow/.test(id))return 'snow';
 if(/sand/.test(id))return 'sand';
 if(/rubber|asphalt/.test(id))return 'rubber';
 if(/brick|masonry|cobble/.test(id))return 'masonry';
 if(/ceramic|terracotta|clay|tile/.test(id))return 'ceramic';
 if(/rock|stone|granite|basalt|cement|plaster|pav|steps|column/.test(id)&&material.metalness<.3)return 'stone';
 if(/dirt|mud/.test(id))return 'earth';
 if(/grass|moss|garden|planter/.test(id)){
  const color=material.color;if(color.g>color.r*1.08&&color.g>color.b*1.08)return 'foliage';
  if(/dirt|mud|grass|moss/.test(id))return 'earth';
 }
 if(material.metalness>=.45||/metal|steel|copper|gold|aluminum|truss|gantry|bollard|pipe|locker|barrier/.test(id))return 'metal';
 if(/wood|timber|wall|roof|ramp|door|fence|market|counter|bench|planter|crate|shelf|table|log|arbor|pergola|garden|pallet/.test(id))return 'timber';
 if(profile.shape&&!/sphere|dome|box|cylinder/.test(profile.shape))return profile.type==='entertainment'?'metal':'stone';
 return 'satin';
}

export function applyMaterialDesignFinish(T,root,profile){
 if(root.userData.materialDesignFinish)return root;
 const surfaces=new Set(),processed=new Set();
 root.traverse(node=>{
  if(!node.isMesh)return;
  for(const material of [].concat(node.material||[])){
   if(!material?.isMeshStandardMaterial||processed.has(material))continue;processed.add(material);
   const kind=classify(profile,material),textures=surfaceTextures(T,kind);surfaces.add(kind);
   // Preserve paint tint, authored opacity/emission and published roughness.
   // The maps modulate these authored parameters instead of replacing them.
   material.map=textures.map;material.roughnessMap=textures.roughnessMap;
   if(!['glass','satin'].includes(kind)){material.bumpMap=textures.bumpMap;material.bumpScale=['earth','stone','masonry','timber','foliage'].includes(kind)?.012:kind==='water'?.008:.003;}
   material.userData={...material.userData,nativeMaterialSurface:kind,nativeMaterialDesign:'crafted-surfaces-v1'};
   material.needsUpdate=true;
  }
 });
 root.userData.materialDesignFinish={version:1,id:profile.id,surfaces:[...surfaces]};
 return root;
}

export {surfaceTextures as nativeSurfaceTextures};
