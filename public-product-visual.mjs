// Public previews need a small visual description, never an owner's complete
// saved configuration, functional scripts, permissions or account metadata.
const recipes=new Set(['bottle','dynamite-bundle','carrot','bone','fish','cheese','terrain-slab','extruded-svg']);
const forms=new Set(['solid','sculpted','lightweight']);
const materials=new Set(['original','standard','metal','wood','plastic','glass','neon','emissive','glow','stone','matte']);
const formats=new Set(['glb','gltf','usdz','svg','png','jpg','jpeg','webp','gif']);
const renderKinds=new Set(['image','image-prop','image-3d','drawing','generated','procedural','model','glb','gltf']);
const strokeTools=new Set(['pencil','pen','line','rectangle','circle']);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))?value:{};
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):undefined;
const color=value=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value)?value:undefined;
const identifier=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9_.:+-]{0,119}$/i.test(value)?value:undefined;

function artworkUrl(value){
 if(typeof value!=='string'||!value||value.length>2_000_000||/[\\\x00-\x20]/.test(value))return;
 if(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(value))return value;
 if(value.length>2048||value.startsWith('//'))return;
 try{
  const url=new URL(value,'https://public-preview.invalid/');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return;
  if([...url.searchParams.keys()].some(key=>/token|secret|password|session|authorization|credential|signature|api.?key/i.test(key)))return;
  return value;
 }catch{return;}
}

function drawingSettings(value){
 const source=plain(value),result={};
 for(const [key,min,max]of [['depth',.001,120],['bevel',0,30],['scale',.1,5],['colorBlend',0,100],['orientation',-360,360],['tilt',-180,180],['yaw',-180,180]]){
  const number=finite(source[key],min,max);if(number!==undefined)result[key]=number;
 }
 if(materials.has(source.material))result.material=source.material;
 if(color(source.color))result.color=source.color;
 if(['uniform','relief'].includes(source.depthMode))result.depthMode=source.depthMode;
 for(const key of ['mirrored','extruded','groundAligned'])if(typeof source[key]==='boolean')result[key]=source[key];
 return result;
}

function drawingStrokes(value){
 if(value===undefined)return {};
 if(!Array.isArray(value)||value.length>64)return {unavailable:true};
 const result=[];let count=0;
 for(const raw of value){
  const source=plain(raw);if(!strokeTools.has(source.tool)||!Array.isArray(source.points)||source.points.length<2)return {unavailable:true};
  count+=source.points.length;if(count>2048)return {unavailable:true};
  const width=source.width===undefined?18:source.width;
  if(typeof width!=='number'||!Number.isFinite(width)||width<1||width>200)return {unavailable:true};
  const points=[];
  for(const rawPoint of source.points){
   const point=plain(rawPoint),{x,y}=point;
   if(typeof x!=='number'||typeof y!=='number'||!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>4096||Math.abs(y)>4096)return {unavailable:true};
   points.push({x,y});
  }
  result.push({tool:source.tool,width,points});
 }
 return result.length?{strokes:result}:{};
}

export function publicProductVisual(record){
 const source=plain(record);if(source.visibility==='private')return {};
 const sources=[source,plain(source.function_data),plain(source.configuration)],value=key=>sources.find(item=>item[key]!==undefined)?.[key],result={};
 const generator=value('generator')||plain(value('registry')).generator;
 if(recipes.has(generator)){result.generated=true;result.generator=generator;}
 if(forms.has(value('form')))result.form=value('form');
 if(color(value('color')))result.color=value('color');
 const registryColor=color(plain(plain(value('registry')).materials).color);if(registryColor)result.registry={materials:{color:registryColor}};
 const drawing=drawingStrokes(value('strokes'));
 if(drawing.strokes)result.strokes=drawing.strokes;
 else if(drawing.unavailable){result.previewCard=true;result.previewNote='Detailed drawing: product card preview';}
 const settings=drawingSettings({...plain(source.configuration),...plain(plain(source.function_data).drawingSettings),...plain(value('drawingSettings'))});if(Object.keys(settings).length)result.drawingSettings=settings;
 const format=typeof value('format')==='string'?value('format').toLowerCase():'';if(formats.has(format))result.format=format;
 const kind=value('renderKind');if(renderKinds.has(kind))result.renderKind=kind;
 const layout=value('builderLayoutId');if(typeof layout==='string'&&/^[a-z][a-z0-9-]{0,79}$/.test(layout))result.builderLayoutId=layout;
 const height=finite(value('targetHeight'),.001,2000);if(height!==undefined)result.targetHeight=height;
 const artwork=value('artwork')||value('imageUrl')||value('image_url')||(/^(?:image|image-prop|image-3d)$/.test(kind||'')?source.modelUrl||source.glb_url||source.thumbnailUrl||source.thumbnail_url:'');
 const safeArtwork=artworkUrl(artwork);if(safeArtwork)result.artwork=safeArtwork;
 return result;
}

// Preserve only the public routing summary used by native item previews. Full
// executable or user-authored function data stays on the authoritative asset.
export function publicProductFunctionData(record){
 const source=plain(record),result={};for(const key of ['buildAssetId','modelId','device','behavior','action']){const value=identifier(source[key]);if(value)result[key]=value;}return result;
}
