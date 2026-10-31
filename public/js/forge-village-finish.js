import {mergeGeometries} from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import {placementMeshes} from './placed-item-collision.js';

const resources=new WeakMap();
const scenery=new Set(['flower-bed','canopy-tree','pine-tree','hedge-corner','garden-rocks','planter','lamp-post','bookshelf','wooden-cart','armchair','dining-set','loft-bed','material:barrel']);
const passive=new Set(['nativeDesignDetail','collisionDisabled','collider','builderRoot','nativeDetailBatch','nativeDesignDetailCount','nativeDetailSourceNames','nativeDetailBatching']);
const buckets=[.25,.5,1,2,4,8,16,32];
const repeat=value=>buckets.reduce((best,next)=>Math.abs(next-value)<Math.abs(best-value)?next:best,buckets[0]);
const styles={stone:{roughness:.94,metalness:0,bump:.025},wood:{roughness:.86,metalness:0,bump:.018},copper:{roughness:.49,metalness:.54,bump:.009},metal:{roughness:.48,metalness:.65,bump:.006},plaster:{roughness:.95,metalness:0,bump:.014},water:{roughness:.28,metalness:.13,bump:.012}};

/** Collider-base is an authored bottom elevation, including beams and roofs.
 * The forge editor must use the same anchor as the live room. */
export function forgePreservesAuthoredElevation(scene,item){
 return item?.placementAnchor==='collider-base'&&!!(scene?.layout==='forge'||scene?.sourceLayout==='forge'||scene?.sourceGame==='forge'||scene?.game==='forge'||scene?.sourceForge?.enabled||scene?.baseEnvironment?.forge?.enabled);
}

export function forgeBuilderPlayableScale(scene,item){
 if(!forgePreservesAuthoredElevation(scene,item)||(item.asset?.buildAssetId||item.modelId)!=='material:cube')return item?.scale?.x>=.4&&item.scale.x<=2.4;
 const size=Math.max(40,Number(scene.mapSize)||224),limits=[size,Math.max(32,size*.4),size];
 return ['x','y','z'].every((axis,index)=>Number.isFinite(item.scale?.[axis])&&item.scale[axis]>=.001&&item.scale[axis]*1.2<=limits[index]);
}

function grain(kind,x,y){
 const noise=((x*73+y*151+x*y*13)%97)/97;
 if(kind==='stone'){
  const row=Math.floor(y/16),joint=(x+(row%2)*16)%32;
  return y%16<1||joint<1?166:227+noise*22+(row%3)*2;
 }
 if(kind==='wood')return 215+Math.sin(x*.9+Math.sin(y*.12)*1.8)*15+Math.sin(x*2.5+y*.018)*5+noise*12;
 if(kind==='copper')return x%32<2?194:237+noise*14+Math.sin(y*.28)*3;
 if(kind==='water')return 222+Math.sin(x*.32+y*.7+Math.sin(x*.09)*3)*15+noise*8;
 return 232+noise*20;
}

function texture(T,kind,u,v){
 let bank=resources.get(T);if(!bank){bank={patterns:new Map(),textures:new Map()};resources.set(T,bank);}
 const key=kind+':'+u+':'+v;if(bank.textures.has(key))return bank.textures.get(key);
 let data=bank.patterns.get(kind);
 if(!data){data=new Uint8Array(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const at=(y*64+x)*4,value=Math.max(0,Math.min(255,grain(kind,x,y)));data[at]=data[at+1]=data[at+2]=value;data[at+3]=255;}bank.patterns.set(kind,data);}
 const map=new T.DataTexture(data,64,64);map.name='EMBERFALL_'+kind.toUpperCase()+'_SURFACE';map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(u,v);map.magFilter=T.LinearFilter;map.minFilter=T.LinearMipmapLinearFilter;map.generateMipmaps=true;map.colorSpace=T.SRGBColorSpace;map.userData.nativeSurfaceShared=true;map.needsUpdate=true;bank.textures.set(key,map);return map;
}

function materialKind(item){
 const authored=item.functionalSettings?.forgeVillageMaterial;if(styles[authored])return authored;
 const name=String(item.name||'').toLowerCase();
 return /water|millrace.*surface/.test(name)?'water':/copper|brass|bronze/.test(name)?'copper':/timber|oak|wood|rafter|beam|joinery/.test(name)?'wood':/iron|metal/.test(name)?'metal':/plaster|rendered/.test(name)?'plaster':'stone';
}

const materialKey=material=>[material.type,material.color?.getHex(),material.emissive?.getHex(),material.emissiveIntensity,material.roughness,material.metalness,material.opacity,material.transparent,material.side,material.vertexColors,material.flatShading,material.blending,material.depthWrite,material.depthTest,material.toneMapped,material.map?.uuid,material.normalMap?.uuid,material.bumpMap?.uuid,material.roughnessMap?.uuid,material.metalnessMap?.uuid,material.alphaMap?.uuid,material.polygonOffset,material.polygonOffsetFactor,material.polygonOffsetUnits].join(':');

/** Merge only a fixed set of native scenery models. Animated crowns and named
 * live parts retain their nodes; solid and cosmetic collision roles stay apart. */
export function batchForgeVillageScenery(T,root,item){
 if(!String(item?.id||'').startsWith('forge-village-')||!scenery.has(item.asset?.buildAssetId||item.modelId)||root.userData.forgeVillageSceneryBatched)return root;
 const parents=[],physical=new Set(placementMeshes(root));root.traverse(node=>{if(node.children.length)parents.push(node);});let saved=0;
 const discardedMaterials=new Set();
 for(const parent of parents){
  const groups=new Map();
  for(const node of parent.children){
   if(!node.isMesh||node.isInstancedMesh||node.isSkinnedMesh||node.children.length||!node.visible||!node.material||Array.isArray(node.material)||node.material?.transparent||node.customDepthMaterial||node.customDistanceMaterial||Object.keys(node.userData).some(key=>!passive.has(key)))continue;
   if(['onBeforeRender','onAfterRender','onBeforeShadow','onAfterShadow'].some(key=>node[key]!==T.Object3D.prototype[key])||node.material.onBeforeCompile!==T.Material.prototype.onBeforeCompile)continue;
   const geometry=node.geometry;if(!geometry?.isBufferGeometry||Object.keys(geometry.morphAttributes||{}).length||geometry.drawRange.start!==0||geometry.drawRange.count!==Infinity)continue;
   node.updateMatrix();if(!node.matrix.elements.every(Number.isFinite)||node.matrix.determinant()<=1e-12)continue;
   const attributes=Object.entries(geometry.attributes).map(([name,attribute])=>name+':'+attribute.itemSize+':'+attribute.normalized).sort().join(',');
   const key=[materialKey(node.material),attributes,node.userData.collisionDisabled===true,node.userData.collider===true,node.castShadow,node.receiveShadow,node.renderOrder,node.layers.mask].join('|');
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push(node);
  }
  for(const nodes of groups.values()){
   if(nodes.length<2)continue;
   const parts=nodes.map(node=>{const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();geometry.applyMatrix4(node.matrix);geometry.clearGroups();return geometry;});
   let geometry;try{geometry=mergeGeometries(parts,false);}finally{parts.forEach(part=>part.dispose());}if(!geometry)continue;
   geometry.computeBoundingBox();geometry.computeBoundingSphere();const first=nodes[0],mesh=new T.Mesh(geometry,first.material);
   mesh.name=first.name;mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.renderOrder=first.renderOrder;mesh.layers.mask=first.layers.mask;mesh.userData={...first.userData,collisionDisabled:true,collider:false,forgeVillageStaticBatch:true,forgeVillageSourceNames:nodes.map(node=>node.name)};
   for(const node of nodes){
    // Keep original solid geometry as an invisible exact collider. Baking a
    // rotated mesh can tighten its box and alter grounding even though its
    // rendered vertices are unchanged. The live/server collision stays equal.
    if(physical.has(node)){node.visible=false;node.userData.collider=true;node.userData.forgeVillageCollisionProxy=true;}
    else parent.remove(node);
    discardedMaterials.add(node.material);
   }
   parent.add(mesh);saved+=nodes.length-1;
  }
 }
 if(saved)for(const node of physical)node.userData.collider=true;
 const used=new Set();root.traverse(node=>{for(const material of [].concat(node.material||[]))used.add(material);});for(const material of discardedMaterials)if(!used.has(material))material.dispose();
 root.userData.forgeVillageSceneryBatched={drawCallsSaved:saved};return root;
}

/** The village is made from regular editable materials. Finishing changes its
 * surfaces only; position, scale, identity, collision and ownership stay intact. */
export function applyForgeVillageFinish(T,root,item){
 if(!root||!item)return root;
 batchForgeVillageScenery(T,root,item);
 const settings=item.functionalSettings||{},village=String(item.id||'').startsWith('forge-village-'),surface=settings.forgeVillageSurface===true,structural=(item.asset?.buildAssetId||item.modelId)==='material:cube';
 if(!structural||!village&&!surface&&!styles[settings.forgeVillageMaterial])return root;
 const kind=materialKind(item),style=styles[kind],scale=item.scale||{},dimensions=[scale.x,scale.y,scale.z].map(value=>Math.max(.05,Math.abs(Number(value)||1)*1.2));
 const horizontal=surface||settings.forgeVillageRoof===true,u=repeat((horizontal?dimensions[0]:Math.max(dimensions[0],dimensions[2]))/(kind==='stone'?2:1.5)),v=repeat((horizontal?dimensions[2]:dimensions[1])/(kind==='stone'?1.2:1.5)),map=texture(T,kind,u,v);
 root.traverse(node=>{
  if(!node.isMesh)return;
  for(const material of [].concat(node.material||[])){
   if(item.materialSettings?.useAccent&&material.color)material.color.set(item.materialSettings.accent);
   material.map=map;material.bumpMap=map;material.bumpScale=style.bump;material.roughness=style.roughness;material.metalness=style.metalness;
   if(surface&&!settings.forgeVillageFoundation){const authored=Number(settings.forgeVillageSurfaceLayer??settings.surfaceLayer),layer=Math.max(0,Math.min(8,Number.isFinite(authored)?authored:1));material.polygonOffset=true;material.polygonOffsetFactor=-.1-layer*.025;material.polygonOffsetUnits=-1-layer;}else if(settings.forgeVillageFoundation){material.polygonOffset=false;material.polygonOffsetFactor=0;material.polygonOffsetUnits=0;}
   if(settings.forgeVillageRoof===true)node.userData.buildingRoof=true;
   if(material.userData.forgeVillageFinish!==kind){material.userData.forgeVillageFinish=kind;material.needsUpdate=true;}
  }
 });
 root.userData.forgeVillageFinish=kind;return root;
}

/** Flat village ground has broad readable districts; paving geometry supplies
 * the close detail. This function changes tint only, never walking height. */
export function forgeVillageGroundColor(x,z){
 const core=Math.abs(x)<=45&&z>=-25&&z<=17;
 const ring=(Math.abs(Math.abs(x)-56)<=5&&z>=-59&&z<=70)||(Math.abs(z+54)<=5&&Math.abs(x)<=96)||(Math.abs(z-49)<=5&&Math.abs(x)<=96);
 const arrival=Math.abs(x)<=5&&z>=16&&z<=102,plaza=Math.abs(x)<=27&&Math.abs(z-75)<=17;
 if(core)return 0x79715f;
 if(ring||arrival||plaza)return 0x93876d;
 if(Math.abs(x)>98||z>101||z<-98)return 0x464d36;
 return 0x62654a;
}
