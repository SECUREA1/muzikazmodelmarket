import * as THREE from '../vendor/three/three.module.min.js';

const warm=new THREE.Color(0xffc779);
const windowName=/WINDOW|GLAZING|GLAZED|GLASS_PANE/i;
const excludedName=/FRAME|MULLION|SILL|BOARD|SHUTTER|COLLISION|COLLIDER|SCREEN|DISPLAY|MEDIA|HEADLIGHT|TAILLIGHT/i;
const lampName=/LAMP|LANTERN|BULB|LIGHT_HEAD|LIGHT_GLOBE|COURTESY_LIGHT/i;
const lampModel=/lamp|lantern|street-light/i;
const vehicleData=data=>data.vehicleNightRoot||data.vehicleDesign||data.roadVehicle||data.aircraft||data.watercraft||data.constructionMachine||data.vehicle?.mode;

export function worldNightStrength(state){
 if(!state||state.outdoors===false)return 0;
 const day=Number.isFinite(state.daylight)?state.daylight:1-(Number(state.night)||0);
 const t=THREE.MathUtils.clamp((.72-day)/.62,0,1);
 return t*t*(3-2*t);
}

/** Warm building windows and nearby public lighting with a fixed light budget.
 * Existing models keep their original materials, collision and interaction nodes.
 * Call reset before disposing the world so original materials regain ownership. */
export function createWorldNightLights({scene,maxLights=4,scanInterval=2000,maxSurfaces=512,maxBuildingFixtures=128}={}){
 const pool=new THREE.Group();pool.name='WORLD_NIGHT_LIGHT_POOL';pool.userData.nightWorldOwned=true;scene.add(pool);
 const lights=Array.from({length:Math.max(0,Math.min(4,Math.floor(maxLights)))},()=>{const light=new THREE.PointLight(0xffd18c,0,16,2);light.castShadow=false;pool.add(light);return light;});
 const surfaces=new Map(),buildings=new Map();let roots=[],lastScan=-Infinity,lastSelection=-Infinity,lastStrength=-1,disposed=false;
 const point=new THREE.Vector3(),position=new THREE.Vector3(),selectionAnchor=new THREE.Vector3(Infinity,Infinity,Infinity);

 function connected(node){for(let current=node;current;current=current.parent)if(current===scene)return true;return false;}
 function visible(node){for(let current=node;current;current=current.parent){if(current.visible===false)return false;if(current===scene)return true;}return false;}
 function context(node){
  let lamp=false;
  for(let current=node;current&&current!==scene;current=current.parent){const data=current.userData||{};if(vehicleData(data)||(data.modelId||data.asset?.buildAssetId)==='forge-lantern'||data.functionalSettings?.forgeLantern)return null;lamp||=lampModel.test(data.modelId||data.asset?.buildAssetId||'');}
  return {lamp};
 }
 function restoreSurface(record){if(record.node.material===record.night)record.node.material=record.original;for(const material of record.owned)material.dispose();}
 function removeBuilding(record){record.fixture.removeFromParent();record.fixture.geometry.dispose();record.fixture.material.dispose();}
 function clear(){for(const record of surfaces.values())restoreSurface(record);for(const record of buildings.values())removeBuilding(record);surfaces.clear();buildings.clear();for(const light of lights)light.intensity=0;lastStrength=-1;}
 function cacheSurfaceCenter(record){
  record.geometry=record.node.geometry;record.center=new THREE.Vector3();
  if(record.geometry){if(!record.geometry.boundingBox)record.geometry.computeBoundingBox();record.geometry.boundingBox?.getCenter(record.center);}
 }
 function addSurface(node,kind){
  const existing=surfaces.get(node);if(existing){if(existing.geometry!==node.geometry)cacheSurfaceCenter(existing);return;}
  if(surfaces.size>=maxSurfaces)return;
  const source=node.material,materials=[].concat(source||[]);if(!materials.some(material=>material?.emissive))return;
  const owned=[],copies=materials.map(material=>{if(!material?.emissive)return material;const copy=material.clone();copy.userData={...copy.userData,nightWorldOwned:true,nightSourceUUID:material.uuid};owned.push(copy);return copy;});
  const night=Array.isArray(source)?copies:copies[0];
  const record={node,original:source,night,owned,kind};cacheSurfaceCenter(record);surfaces.set(node,record);
 }
 function addBuilding(node){
  if(buildings.has(node)||buildings.size>=maxBuildingFixtures)return;
  const data=node.userData||{},dimensions=data.dimensions||[],family=data.nativeDesign?.family;
  if(!data.building&&!data.craftedBuildingModel&&!(family==='architecture'&&dimensions[0]>=4&&dimensions[1]>=2&&dimensions[2]>=4))return;
  const entry=data.entrances?.find(value=>Number.isFinite(value.x)&&Number.isFinite(value.z))||{x:0,y:0,z:-Math.max(2,Number(dimensions[2])||8)/2};
  const height=Math.min(2.7,Math.max(1.8,(Number(dimensions[1])||3.5)*.72));
  const fixture=new THREE.Mesh(new THREE.BoxGeometry(.34,.12,.12),new THREE.MeshBasicMaterial({color:0xffd494,toneMapped:false}));
  fixture.name='NIGHT_BUILDING_ENTRY_LAMP';fixture.userData={nightWorldOwned:true,collisionDisabled:true,collider:false};fixture.castShadow=fixture.receiveShadow=false;
  fixture.position.set(entry.x,(Number(entry.y)||0)+height,entry.z+(entry.z>0?.16:-.16));fixture.visible=false;node.add(fixture);
  buildings.set(node,{node,fixture});
 }
 function scan(nextRoots){
  const seenSurfaces=new Set(),seenBuildings=new Set();
  for(const root of nextRoots){
   if(!connected(root))continue;
   root.traverse(node=>{
    const info=context(node);if(node.userData?.nightWorldOwned||!info)return;
    if(!node.isMesh){addBuilding(node);if(buildings.has(node))seenBuildings.add(node);return;}
    if(node.isInstancedMesh||node.isSkinnedMesh||excludedName.test(node.name||'')||node.userData?.collisionOnly||node.userData?.mediaScreen)return;
    const original=surfaces.get(node),current=node.material;
    if(original&&current!==original.original&&current!==original.night){restoreSurface(original);surfaces.delete(node);}
    const materials=[].concat(surfaces.get(node)?.original||current||[]),emitting=materials.some(material=>material?.emissive&&(material.emissive.r+material.emissive.g+material.emissive.b)>.01);
    const kind=windowName.test(node.name||'')?'window':(lampName.test(node.name||'')||info.lamp)&&emitting?'lamp':null;
    if(kind){addSurface(node,kind);if(surfaces.has(node))seenSurfaces.add(node);}
   });
  }
  for(const [node,record]of surfaces)if(!seenSurfaces.has(node)){restoreSurface(record);surfaces.delete(node);}
  for(const [node,record]of buildings)if(!seenBuildings.has(node)){removeBuilding(record);buildings.delete(node);}
 }
 function applyStrength(strength){
  for(const record of surfaces.values()){
   const {node,original,night,owned,kind}=record;if(node.material!==original&&node.material!==night)continue;
   node.material=strength>0?night:original;
   const source=[].concat(original);
   for(const material of owned){const baseline=source.find(value=>value?.uuid===material.userData.nightSourceUUID)||source.find(value=>value?.emissive);
    if(typeof baseline.envMapIntensity==='number')material.envMapIntensity=baseline.envMapIntensity;
    material.emissive.copy(baseline.emissive).lerp(warm,strength);
    material.emissiveIntensity=THREE.MathUtils.lerp(baseline.emissiveIntensity??1,Math.max(baseline.emissiveIntensity??0,kind==='window'?.95:2.1),strength);
   }
  }
  for(const record of buildings.values())record.fixture.visible=strength>0;
 }
 function update({state,anchor,roots:providedRoots=[],now=globalThis.performance?.now?.()??Date.now()}={}){
  if(disposed)return;
  const nextRoots=[...new Set(providedRoots.filter(root=>root?.isObject3D&&root!==scene))];
  const changed=nextRoots.length!==roots.length||nextRoots.some((root,index)=>root!==roots[index]);
  let scanned=false;
  if(changed||now-lastScan>=scanInterval){roots=nextRoots;lastScan=now;scan(roots);scanned=true;}
  const strength=worldNightStrength(state);
  const strengthChanged=strength!==lastStrength;
  if(scanned||strengthChanged){applyStrength(strength);lastStrength=strength;}
  if(!strength||!anchor||!lights.length){for(const light of lights)light.intensity=0;return;}
  point.set(Number(anchor.x)||0,Number(anchor.y)||0,Number(anchor.z)||0);
  if(!scanned&&!strengthChanged&&now-lastSelection<200&&point.distanceToSquared(selectionAnchor)<9)return;
  lastSelection=now;selectionAnchor.copy(point);
  const candidates=[];
  for(const {fixture}of buildings.values())if(visible(fixture)){fixture.getWorldPosition(position);candidates.push({position:position.clone(),distance:position.distanceToSquared(point),power:34});}
  for(const {node,kind,center}of surfaces.values())if(visible(node)){node.localToWorld(position.copy(center));const distance=position.distanceToSquared(point);if(distance<2500)candidates.push({position:position.clone(),distance,power:kind==='lamp'?32:20});}
  candidates.sort((a,b)=>a.distance-b.distance);const selected=[];
  for(const candidate of candidates){if(candidate.distance>2500||selected.some(other=>other.position.distanceToSquared(candidate.position)<16))continue;selected.push(candidate);if(selected.length===lights.length)break;}
  for(let index=0;index<lights.length;index++){const light=lights[index],candidate=selected[index];light.intensity=candidate?candidate.power*strength:0;if(candidate)light.position.copy(candidate.position);}
 }
 return {update,reset(){clear();roots=[];lastScan=lastSelection=-Infinity;},get stats(){return {surfaces:surfaces.size,buildingFixtures:buildings.size,lights:lights.length,activeLights:lights.filter(light=>light.intensity>0).length};},dispose(){if(disposed)return;clear();pool.removeFromParent();disposed=true;}};
}
