// Cosmetic craft detail for native props which are not handled by the transport,
// architecture or device families. Details are attached to the original meshes,
// so moving factory arms, costumes and held props retain their authored pivots.
export const WORLD_PROP_DESIGN_VERSION='crafted-props-1';

export function supportsWorldPropDesign(id){
 return typeof id==='string'&&id.length>0&&!id.startsWith('material:');
}

const protectedSurface=/(?:SCREEN|DISPLAY|MONITOR|SIGN|LABEL|TEXT|FACE|EYE|PUPIL|MOUTH|NOSE|GLASS|WINDOW|(?:^|_)WATER(?:$|_SURFACE|_CHANNEL)|FLAME|BULB|GLOW|TARGET_(?:BACKING|CENTER|RING)|SCORING|PLAYING|CHESS.*SQUARE)/i;
const hardwareSurface=/(?:CABINET|BODY|BASE|POST|COLUMN|HEADER|PANEL|PLATFORM|BIN|CASING|SHELL|CARGO|CRATE|FRAME|PEDESTAL|WORKTOP|COUNTER|FOOT|FLOOR|SEAT|SHOE|SOLE|HEEL|BOX|BOARD|BUNK|RAIL|POLE|HANDLE|STEM|TRUNK|TROPHY)/i;
const authoredFlags=['portalModel','commonPropModel','equipmentPropModel','craftedLandscapeModel','craftedCharacterModel','craftedBuildingModel','craftedFurnitureModel'];

function familyFor(id){
 if(/^(?:hero-spawn|scout-avatar|wolf-guardian|rad-tox|void-wolf|ember-dragon|rogue-bot|world-resident)$/.test(id)||/avatar$/.test(id))return 'character';
 if(/^(?:factory-|testing-|construction-|shipping-)/.test(id))return 'industrial';
 if(id.startsWith('prison-'))return 'keepsake';
 if(id.startsWith('camp-'))return 'camp';
 if(id.startsWith('funhouse-'))return 'carnival';
 if(/^lot-/.test(id))return 'survey';
 if(/mountain|hill|rock|tree|water|lake|terrain|landscape/.test(id))return 'landscape';
 return 'prop';
}

function visiblePart(node,root){
 for(let parent=node;parent;parent=parent.parent){if(parent.visible===false)return false;if(parent===root)break;}
 return true;
}

function surfaceBounds(node){
 if(!node.geometry?.attributes?.position)return null;
 node.geometry.computeBoundingBox();const bounds=node.geometry.boundingBox;
 return bounds&&!bounds.isEmpty()?bounds:null;
}

function materialEligible(material){
 return material?.isMeshStandardMaterial&&!material.transparent&&(!material.map||material.map.userData.nativeMaterialSurface)&&!material.emissiveMap&&(material.emissive?.getHex()??0)===0;
}

// Tint the existing vertices, rather than adding a decal over labels or changing
// the player's chosen base colour. The gradient gives cast metal, timber and
// cloth a legible edge-to-edge finish even when no environment map is available.
function surfaceFinish(THREE,node,kind){
 if(node.isInstancedMesh||protectedSurface.test(node.name)||node.userData.mediaScreen)return false;
 const source=node.geometry,bounds=surfaceBounds(node),materials=[].concat(node.material||[]);
 if(!bounds||!materials.length||!materials.every(materialEligible))return false;
 const geometry=source.clone(),position=geometry.attributes.position,prior=geometry.attributes.color;
 // BufferGeometry.copy omits the authoring dimensions of chamfered boxes.
 // Retain them for this pass and other non-destructive panel decorators.
 if(source.parameters)geometry.parameters={...source.parameters};
 const colours=[],height=Math.max(.0001,bounds.max.y-bounds.min.y),width=Math.max(.0001,bounds.max.x-bounds.min.x),natural=kind==='landscape'||kind==='camp';
 for(let i=0;i<position.count;i++){
  const y=(position.getY(i)-bounds.min.y)/height,x=(position.getX(i)-bounds.min.x)/width;
  const grain=Math.sin(x*(natural?61:29)+position.getZ(i)*17.3)*Math.sin(y*(natural?5:19))*(natural?.018:.009);
  const shade=.88+y*.12+grain;
  colours.push((prior?prior.getX(i):1)*shade,(prior?prior.getY(i):1)*shade,(prior?prior.getZ(i):1)*shade);
 }
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
 geometry.userData={...geometry.userData,worldPropSurface:WORLD_PROP_DESIGN_VERSION};node.geometry=geometry;
 // Some residents and factory rigs retain direct references to their palette.
 // Keep those references live; placement cloning isolates materials separately.
 for(const material of materials){material.vertexColors=true;material.needsUpdate=true;material.userData={...material.userData,worldPropSurface:WORLD_PROP_DESIGN_VERSION};}
 return true;
}

function context(THREE,root,kind,limit=24){
 const neutral=kind==='carnival'?0xe3be79:kind==='camp'||kind==='survey'?0xb49c70:0x82949b;
 const metal=new THREE.MeshStandardMaterial({color:neutral,roughness:kind==='camp'?.52:.34,metalness:.64});
 const seam=new THREE.MeshStandardMaterial({color:kind==='camp'?0x594338:0x263b43,roughness:.82,metalness:.12});
 const resources=new Map();let added=0;
 const sharedPrimitives=root.userData.factoryLogisticsModel?{}:null;
 if(sharedPrimitives)root.traverse(node=>{
  const p=node.geometry?.parameters;if(!p)return;
  if(p.width===1&&p.height===1&&p.depth===1&&!sharedPrimitives.box)sharedPrimitives.box=node.geometry;
  if(p.radiusTop===1&&p.radiusBottom===1&&p.height===1&&!sharedPrimitives.cylinder)sharedPrimitives.cylinder=node.geometry;
 });
 const boxGeometry=(w,h,d)=>{const key=[w,h,d].join(':');if(!resources.has(key))resources.set(key,new THREE.BoxGeometry(w,h,d));return resources.get(key);};
 function add(parent,name,geometry,material,position,rotation=[0,0,0]){
  if(added>=limit)return null;
  let shared=geometry,scale=null;
  if(sharedPrimitives){
   // Logistics assemblies deliberately share just two unit primitives. Use
   // object scale for trim and fasteners, including after the cube is bevelled.
   const p=geometry.parameters||{};
   if(Number.isFinite(p.width)&&Number.isFinite(p.height)&&Number.isFinite(p.depth)&&sharedPrimitives.box){shared=sharedPrimitives.box;scale=[p.width,p.height,p.depth];}
   else if(geometry.type==='CylinderGeometry'&&p.radiusTop===p.radiusBottom&&sharedPrimitives.cylinder){shared=sharedPrimitives.cylinder;scale=[p.radiusTop,p.height,p.radiusTop];}
   else return null;
  }
  const detail=new THREE.Mesh(shared,material);detail.name='CRAFTED_'+name;detail.position.set(...position);detail.rotation.set(...rotation);if(scale)detail.scale.set(...scale);
  detail.userData={collisionDisabled:true,nativeDesignDetail:true,builderRoot:root};detail.castShadow=false;detail.receiveShadow=true;parent.add(detail);added++;return detail;
 }
 function line(parent,name,size,at,material=seam){return add(parent,name,boxGeometry(...size),material,at);}
 function faceSkin(node,bounds){
  const scale=node.getWorldScale(new THREE.Vector3()),extent=new THREE.Vector3().subVectors(bounds.max,bounds.min);
  // Unit-cube factory primitives have nonuniform object scale. Express the skin
  // in that primitive's coordinates so its world offset never exceeds 0.6 mm.
  const skin=.0006/Math.max(.00001,Math.abs(scale.z)),min=Math.min(extent.x,extent.y),thickness=Math.max(min*.006,.0002);
  return {skin,extent,thickness,scale};
 }
 function border(node,bounds,style='panel'){
  const {skin,extent,thickness,scale}=faceSkin(node,bounds),center=bounds.getCenter(new THREE.Vector3());
  if(extent.x<.025||extent.y<.025||extent.z<.006)return 0;
  // Inset detail leaves the face, its handles, and all adjoining walkways clear.
  const x=extent.x*.41,y=extent.y*.39,z=bounds.max.z+skin;
  const before=added;
  if(style==='joinery'){
   for(const offset of [-.25,.25])line(node,'TIMBER_JOINERY_SEAM',[thickness*.65,extent.y*.75,skin*.65],[center.x+extent.x*offset,center.y,z]);
   for(const offset of [-1,1])line(node,'TIMBER_END_BAND',[extent.x*.88,thickness*1.8,skin*.65],[center.x,center.y+offset*y,z],metal);
  }else if(style==='stitch'){
   for(const offset of [-1,1])line(node,'COSTUME_EDGE_STITCH',[extent.x*.82,thickness*.75,skin*.65],[center.x,center.y+offset*y,z],metal);
  }else{
   // The narrow inset panel line is useful on unmarked housings; it never
   // crosses the centre of a cabinet door or the face of a service display.
   for(const offset of [-1,1])line(node,'INSET_PANEL_SEAM',[extent.x*.84,thickness,skin*.65],[center.x,center.y+offset*y,z]);
  }
  const radius=Math.min(extent.x,extent.y)*.016,depth=Math.min(radius*.28,skin*.8);
  const fastener=new THREE.CylinderGeometry(radius,radius,depth,6);
  for(const sx of [-1,1])for(const sy of [-1,1])add(node,'FITTED_FASTENER',fastener,metal,[center.x+sx*x,center.y+sy*y,z],[Math.PI/2,0,0]);
  return added-before;
 }
 function collar(node){
  const p=node.geometry?.parameters,radius=p?.radius??p?.radiusTop;
  if(!Number.isFinite(radius)||radius<.022)return false;
  const height=p.length??p.height??radius,scale=node.getWorldScale(new THREE.Vector3());
  const gauge=Math.min(radius*.035,.0025/Math.max(.01,Math.abs(scale.x),Math.abs(scale.z)));
  const geometry=new THREE.TorusGeometry(radius+gauge*.16,gauge,5,24);
  add(node,'FITTED_BINDING_COLLAR',geometry,metal,[0,-height*.15,0],[Math.PI/2,0,0]);
  return true;
 }
 return {metal,seam,line,add,border,collar,get count(){return added;}};
}

function boxCandidate(node){
 const p=node.geometry?.parameters;
 return !!(p&&Number.isFinite(p.width)&&Number.isFinite(p.height)&&Number.isFinite(p.depth));
}

function detailActor(THREE,root,nodes,ctx){
 let bound=0;
 for(const node of nodes){
  if(node.geometry.type==='CapsuleGeometry'&&bound<3){ctx.collar(node);bound++;}
 }
 // Armour plates are kept off faces. On the original stand-ins their chest,
 // boots and pelvis are the only eligible solid box surfaces.
 for(const node of nodes){
  if(ctx.count>=18)break;
  if(!boxCandidate(node)||protectedSurface.test(node.name))continue;
  const bounds=surfaceBounds(node),s=bounds.getSize(new THREE.Vector3());
  if(s.x>.12&&s.y>.12&&s.z>.05)ctx.border(node,bounds,'stitch');
 }
 // Four-legged guardians have a spherical torso rather than a capsule. Give
 // the upper torso a fitted harness section, not a decorative plate over eyes.
 if(!ctx.count){
  const torso=nodes.find(node=>node.geometry?.type==='SphereGeometry'&&node.geometry.parameters.radius>.35&&!protectedSurface.test(node.name));
  if(torso){
   const radius=torso.geometry.parameters.radius,strap=new THREE.TorusGeometry(radius*.94,radius*.025,5,28,Math.PI);
   ctx.add(torso,'GUARDIAN_HARNESS',strap,ctx.metal,[0,0,0],[0,0,0]);
  }
 }
}

/** Apply only cosmetic construction details; never rewrite a native rig. */
export function finishWorldPropDesign(THREE,root,id){
 if(!root||!supportsWorldPropDesign(id)||root.userData.worldPropDesign?.version===WORLD_PROP_DESIGN_VERSION)return root;
 // The first 66 models already have their own fitted construction details.
 // Their same shared PBR pass is applied by the caller without doubling trim.
 if(authoredFlags.some(flag=>root.userData[flag]))return root;
 const kind=familyFor(id),nodes=[];
 root.updateMatrixWorld(true);
 root.traverse(node=>{
  if(node.isMesh&&!node.isInstancedMesh&&!node.userData.nativeDesignDetail&&!node.userData.collisionOnly&&!node.userData.mediaScreen&&visiblePart(node,root)&&!protectedSurface.test(node.name)&&[].concat(node.material||[]).every(materialEligible))nodes.push(node);
 });
 const small=/hat|shoe|badge|pack|trophy|stake|gun/.test(id);
 let detailLimit=small?12:24;
 // Camp assemblies have a long-standing thirty-mesh placement budget. Keep
 // hardware inside the remaining draw budget; the vertex/surface finish still
 // improves a dense cabin or dock when no extra geometry is necessary.
 if(kind==='camp'){
  let meshes=0;root.traverse(node=>{if(node.isMesh)meshes++;});
  detailLimit=Math.min(detailLimit,Math.max(0,30-meshes));
 }
 const ctx=context(THREE,root,kind,detailLimit);
 let finishedSurfaces=0;
 // Unit-primitive logistics use the shared PBR maps rather than per-node
 // geometry clones, retaining their two-geometry instancing/batching contract.
 if(!root.userData.factoryLogisticsModel)for(const node of nodes){if(finishedSurfaces>=8)break;if(surfaceFinish(THREE,node,kind))finishedSurfaces++;}
 if(kind==='character')detailActor(THREE,root,nodes,ctx);
 else {
  const candidates=nodes.filter(node=>boxCandidate(node)&&(!node.name||node.name==='CAMP_DETAIL'||hardwareSurface.test(node.name)));
  // Large props receive joins on up to three structurally meaningful panels;
  // small wearable/keepsake items retain a tighter draw budget.
  const maximum=small?2:3;
  let panels=0;
  for(const node of candidates){
   if(panels>=maximum||ctx.count>=20)break;
   const bounds=surfaceBounds(node);if(!bounds)continue;
   const size=bounds.getSize(new THREE.Vector3());
   if(size.x<.04||size.y<.04||size.z<.008)continue;
   const joinery=kind==='camp'||kind==='survey'||/crate|chest|wood|pallet/.test(id),stitch=kind==='carnival'&&/avatar|hat|shoes/.test(id);
   if(ctx.border(node,bounds,joinery?'joinery':stitch?'stitch':'panel'))panels++;
  }
  if(!ctx.count&&kind!=='landscape'){
   for(const node of nodes){if(ctx.count>=4)break;if(/CylinderGeometry|CapsuleGeometry/.test(node.geometry.type))ctx.collar(node);}
  }
 }
 root.userData.worldPropDesign={version:WORLD_PROP_DESIGN_VERSION,family:kind,surfaces:finishedSurfaces,details:ctx.count};
 return root;
}
