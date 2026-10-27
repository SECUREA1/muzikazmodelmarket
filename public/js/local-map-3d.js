import * as THREE from '../vendor/three/three.module.min.js';
import {OrbitControls} from '../vendor/three/addons/controls/OrbitControls.js';
import {localMapTags} from './local-map-tags.js';
// Three.js retains the uniform table used to compile a material. Update those
// entries in place so live values reach its renderer without recompiling it.
function syncMapUniformValue(source,target,texture,markChanged){
 if(source?.isTexture){const next=texture(source);if(next!==target)markChanged();return next;}
 if(Array.isArray(source)){
  if(!Array.isArray(target)){target=[];markChanged();}
  if(target.length!==source.length){target.length=source.length;markChanged();}
  for(let index=0;index<source.length;index++)target[index]=syncMapUniformValue(source[index],target[index],texture,markChanged);
  return target;
 }
 if(source&&typeof source==='object'){
  if(ArrayBuffer.isView(source)&&typeof source.slice==='function'){
   if(target?.constructor!==source.constructor||target.length!==source.length){markChanged();return source.slice();}
   let changed=false;for(let index=0;index<source.length;index++)if(!Object.is(source[index],target[index])){changed=true;break;}
   if(changed){target.set(source);markChanged();}return target;
  }
  if(typeof source.clone==='function'&&typeof source.copy==='function'){
   if(target?.constructor!==source.constructor){markChanged();return source.clone();}
   if(!source.equals?.(target)){target.copy(source);markChanged();}return target;
  }
  if(!target||typeof target!=='object'||Array.isArray(target)||![Object.prototype,null].includes(Object.getPrototypeOf(target))){target={};markChanged();}
  for(const key in target)if(Object.hasOwn(target,key)&&!Object.hasOwn(source,key)){delete target[key];markChanged();}
  for(const key in source)if(Object.hasOwn(source,key))target[key]=syncMapUniformValue(source[key],target[key],texture,markChanged);
  return target;
 }
 if(!Object.is(source,target))markChanged();return source;
}
// Each renderer installs disposal listeners on the resources it draws. Give the
// map its own resource wrappers so closing it can release those listeners without
// disposing gameplay resources or copying their large vertex/image buffers.
function createMapResources(){
 const geometries=new Map(),materials=new Map(),textures=new Map();
 const makeGeometry=source=>source.isInstancedBufferGeometry?new THREE.InstancedBufferGeometry():new THREE.BufferGeometry(),makeMaterial=source=>new source.constructor(),makeTexture=source=>source.isVideoTexture?new THREE.Texture():new source.constructor(),textureVectors=['offset','repeat','center','matrix'];
 return {lease(){
  const held=new Set();let released=false,changed=false;
  const acquire=(cache,source,create)=>{let record=cache.get(source);if(!record){record={source,copy:create(source),cache,users:0};cache.set(source,record);}if(!held.has(record)){held.add(record);record.users++;}return record.copy;};
  function geometry(source){
   const copy=acquire(geometries,source,makeGeometry),record=geometries.get(source);let shapeChanged=!record.attributeVersions;
   record.attributeVersions ||= {};
   const checkVersion=(name,attribute)=>{const version=attribute?.data?.version??attribute?.version;if(record.attributeVersions[name]!==version){record.attributeVersions[name]=version;shapeChanged=true;}};
   if(copy.index!==source.index){copy.index=source.index;shapeChanged=true;}checkVersion('index',source.index);
   for(const name in source.attributes){const attribute=source.attributes[name];if(copy.attributes[name]!==attribute){copy.attributes[name]=attribute;shapeChanged=true;}checkVersion(name,attribute);}
   for(const name in copy.attributes)if(!(name in source.attributes)){delete copy.attributes[name];delete record.attributeVersions[name];shapeChanged=true;}
   for(const name in source.morphAttributes){const values=source.morphAttributes[name];let current=copy.morphAttributes[name];if(!current||current.length!==values.length){current=copy.morphAttributes[name]=values.slice();shapeChanged=true;}for(let index=0;index<values.length;index++){if(current[index]!==values[index]){current[index]=values[index];shapeChanged=true;}checkVersion('morph:'+name+':'+index,values[index]);}}
   for(const name in copy.morphAttributes)if(!(name in source.morphAttributes)){delete copy.morphAttributes[name];shapeChanged=true;}
   if(shapeChanged){changed=true;if(!source.boundingBox)copy.boundingBox=null;if(!source.boundingSphere)copy.boundingSphere=null;}
   copy.name=source.name;copy.type=source.type;copy.morphTargetsRelative=source.morphTargetsRelative;
   if(copy.groups.length!==source.groups.length||source.groups.some((group,index)=>{const current=copy.groups[index];return current.start!==group.start||current.count!==group.count||current.materialIndex!==group.materialIndex;})){copy.groups=source.groups.map(group=>({...group}));changed=true;}
   if(copy.drawRange.start!==source.drawRange.start||copy.drawRange.count!==source.drawRange.count){copy.drawRange={...source.drawRange};changed=true;}
   if(source.boundingBox)copy.boundingBox?copy.boundingBox.copy(source.boundingBox):copy.boundingBox=source.boundingBox.clone();
   if(source.boundingSphere)copy.boundingSphere?copy.boundingSphere.copy(source.boundingSphere):copy.boundingSphere=source.boundingSphere.clone();
   if(source.isInstancedBufferGeometry&&copy.instanceCount!==source.instanceCount){copy.instanceCount=source.instanceCount;changed=true;}
   return copy;
  }
  function texture(source){
   // VideoTexture's constructor starts a permanent video-frame callback loop.
   // The original already owns that loop; the map only follows its image/version.
   const copy=acquire(textures,source,makeTexture),record=textures.get(source),mediaTime=source.isVideoTexture?source.image?.currentTime:null;
   if(record.version!==source.version||record.imageVersion!==source.source.version||record.image!==source.source.data||record.mediaTime!==mediaTime){
    if(!record.imageSource)record.imageSource=new THREE.Source(source.source.data);else record.imageSource.data=source.source.data;
    const input=Object.create(source);input.source=record.imageSource;copy.copy(input);
    if(source.isVideoTexture){copy.isVideoTexture=true;copy.update=()=>{};}
    record.version=source.version;record.imageVersion=source.source.version;record.image=source.source.data;record.mediaTime=mediaTime;changed=true;
   }
   for(const key of textureVectors)if(!copy[key].equals(source[key])){copy[key].copy(source[key]);changed=true;}
   if(copy.rotation!==source.rotation){copy.rotation=source.rotation;changed=true;}
   return copy;
  }
  function material(source){
   if(Array.isArray(source))return source.map(material);if(!source)return source;
   // Avoid ShaderMaterial.copy cloning the original uniform textures. Owned
   // uniform wrappers are installed below, sharing the original CPU values.
   const copy=acquire(materials,source,makeMaterial),record=materials.get(source);
   if(record.version!==source.version){
    const input=Object.create(source);if(source.uniforms)input.uniforms={};copy.copy(input);copy.needsUpdate=true;record.version=source.version;
    record.textureKeys=[];record.scalarKeys=[];record.valueKeys=[];record.arrayKeys=[];
    for(const key of Object.keys(source)){
     if(key==='version'||key==='uniformsNeedUpdate'||key==='id'||key==='uuid'||key.startsWith('is'))continue;
     const value=source[key];
     if(value?.isTexture||value==null&&(key==='map'||key==='matcap'||key.endsWith('Map')))record.textureKeys.push(key);
     else if(typeof value==='number'||typeof value==='boolean'||value==null)record.scalarKeys.push(key);
     else if(typeof value.copy==='function'&&typeof value.equals==='function')record.valueKeys.push(key);
     else if(Array.isArray(value)&&value.length&&value.every(item=>typeof item==='number'))record.arrayKeys.push(key);
    }
    record.scalarValues=record.scalarKeys.map(key=>copy[key]=source[key]);
    copy.onBeforeCompile=source.onBeforeCompile;copy.customProgramCacheKey=source.customProgramCacheKey;changed=true;
   }
   // Colors, surface parameters and render state can change without bumping a
   // material's shader version. Sync cached properties without copying/recompiling it.
   for(let index=0;index<record.scalarKeys.length;index++){const key=record.scalarKeys[index],value=source[key];if(!Object.is(record.scalarValues[index],value)){record.scalarValues[index]=value;copy[key]=value;changed=true;}}
   for(const key of record.valueKeys){const value=source[key],current=copy[key];if(!current||current.constructor!==value.constructor){copy[key]=value.clone();changed=true;}else if(!current.equals(value)){current.copy(value);changed=true;}}
   for(const key of record.arrayKeys){const values=source[key],current=copy[key];if(!current||current===values){copy[key]=values.slice();changed=true;}else if(current.length!==values.length||values.some((value,index)=>!Object.is(value,current[index]))){current.length=values.length;for(let index=0;index<values.length;index++)current[index]=values[index];changed=true;}}
   for(const key of record.textureKeys){const original=source[key],value=original?.isTexture?texture(original):original;if(copy[key]!==value){copy[key]=value;changed=true;}}
   if(source.uniforms)copy.uniforms=syncMapUniformValue(source.uniforms,copy.uniforms,texture,()=>{changed=true;copy.uniformsNeedUpdate=true;});
   return copy;
  }
  return {geometry,material,sync(){changed=false;for(const record of held){if(record.cache===geometries)geometry(record.source);else if(record.cache===materials)material(record.source);else texture(record.source);}return changed;},dispose(){if(released)return;released=true;for(const record of held)if(!--record.users){record.copy.dispose();record.cache.delete(record.source);}held.clear();}};
 }};
}
// Mirror renderable meshes in world coordinates. Gameplay resources stay read
// only; unchanged wrappers survive a live rebuild until the final map releases.
export function mirrorMapMeshes(roots,resources=createMapResources()){
 const group=new THREE.Group(),pairs=[],lease=resources.lease();let disposed=false;
 for(const root of roots.filter(Boolean)){root.updateWorldMatrix(true,true);root.traverseVisible(source=>{
  if((!source.isMesh&&!source.isLine&&!source.isPoints)||!source.geometry)return;
  const geometry=lease.geometry(source.geometry),material=lease.material(source.material),mesh=source.isInstancedMesh?new THREE.InstancedMesh(geometry,material,source.count):source.isLineSegments?new THREE.LineSegments(geometry,material):source.isLine?new THREE.Line(geometry,material):source.isPoints?new THREE.Points(geometry,material):new THREE.Mesh(geometry,material);
  if(source.isInstancedMesh){mesh.instanceMatrix=source.instanceMatrix;mesh.instanceColor=source.instanceColor;}
  if(source.morphTargetInfluences)mesh.morphTargetInfluences=source.morphTargetInfluences;
  mesh.matrixAutoUpdate=false;mesh.matrix.copy(source.matrixWorld);mesh.frustumCulled=source.frustumCulled;group.add(mesh);pairs.push({source,mesh,geometry:source.geometry,material:source.material,instanceVersion:source.instanceMatrix?.version,colorVersion:source.instanceColor?.version});
 });}
 return {group,pairs,update(){let changed=lease.sync();for(const pair of pairs){const {source,mesh}=pair;if(pair.geometry!==source.geometry){mesh.geometry=lease.geometry(source.geometry);pair.geometry=source.geometry;changed=true;}if(pair.material!==source.material){mesh.material=lease.material(source.material);pair.material=source.material;changed=true;}if(source.isInstancedMesh){if(mesh.instanceMatrix!==source.instanceMatrix||mesh.instanceColor!==source.instanceColor||mesh.count!==source.count||pair.instanceVersion!==source.instanceMatrix.version||pair.colorVersion!==source.instanceColor?.version)changed=true;mesh.instanceMatrix=source.instanceMatrix;mesh.instanceColor=source.instanceColor;mesh.count=source.count;pair.instanceVersion=source.instanceMatrix.version;pair.colorVersion=source.instanceColor?.version;}if(source.morphTargetInfluences)mesh.morphTargetInfluences=source.morphTargetInfluences;source.updateWorldMatrix(true,false);if(!mesh.matrix.equals(source.matrixWorld)){mesh.matrix.copy(source.matrixWorld);changed=true;}let visible=true;for(let node=source;node;node=node.parent)if(!node.visible){visible=false;break;}if(mesh.visible!==visible){mesh.visible=visible;changed=true;}}return changed;},dispose(){if(disposed)return;disposed=true;for(const {mesh}of pairs)if(mesh.isInstancedMesh)mesh.dispose();group.clear();pairs.length=0;lease.dispose();}};
}
export async function mountLocalMap3D(root,{environment,getRoots=null,live=null,selfId=null,onSelect=()=>{},onTravel=()=>{},getTags=null,onViewChange=()=>{},cutawayHeight=null,refreshInterval=2000,presentation={}}){
 let disposed=false,frame=0,mirror=null,ownedLoader=null,ownedDecor=null,liveState=live,viewerId=selfId,lastRebuild=0,needsRender=true,tagSignature='';
 const resources=createMapResources();
 const scene=new THREE.Scene();scene.background=new THREE.Color(presentation.background||'#0c242b');scene.add(new THREE.HemisphereLight(0xe4f7ff,0x4b6149,2.5));const sun=new THREE.DirectionalLight(0xffffff,2.5);sun.position.set(100,250,80);scene.add(sun);
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.domElement.setAttribute('aria-label',environment.name+' accurate 3D local map');renderer.domElement.setAttribute('role','img');
 const viewport=document.createElement('div');viewport.className='local-map-3d-viewport';const labels=document.createElement('div');labels.className='local-map-3d-tags';const compass=document.createElement('span');compass.className='local-map-compass';compass.textContent='↑ N';compass.title='North is negative world Z';viewport.append(renderer.domElement,labels,compass);
 const toolbar=document.createElement('div');toolbar.className='local-map-3d-controls';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','3D map controls');
 const makeButton=(text,run)=>{const button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=run;toolbar.append(button);return button;};
 const camera=new THREE.PerspectiveCamera(42,1,.05,20000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.48;controls.minDistance=2;controls.screenSpacePanning=false;controls.addEventListener('change',()=>{needsRender=true;onViewChange({target:controls.target.clone(),distance:camera.position.distanceTo(controls.target),radius:camera.position.distanceTo(controls.target)*Math.tan(camera.fov*Math.PI/360)*Math.max(camera.aspect,1)});});
 const bounds=new THREE.Box3(),center=new THREE.Vector3();let span=80,topDown=false;
 function fit(){if(!mirror)return;bounds.setFromObject(mirror.group);if(bounds.isEmpty()){center.set(0,0,0);span=80;}else{bounds.getCenter(center);const size=bounds.getSize(new THREE.Vector3());span=Math.max(size.x,size.z,size.y,10);}controls.target.copy(center);camera.near=Math.max(.025,span/10000);camera.far=Math.max(1000,span*20);camera.position.copy(center).add(new THREE.Vector3(span*(topDown?0:(presentation.angleX||0)),span*(topDown?1.6:1.1)/Math.min(camera.aspect,1),span*(topDown?.001:.9)/Math.min(camera.aspect,1)).multiplyScalar(presentation.fitScale||1));camera.updateProjectionMatrix();controls.maxDistance=span*5;controls.update();}
 makeButton('Fit map',fit);const angle=makeButton('Top view',()=>{topDown=!topDown;angle.textContent=topDown?'3D angle':'Top view';fit();});
 const showTags=document.createElement('label'),tagsInput=document.createElement('input');tagsInput.type='checkbox';tagsInput.checked=true;showTags.append(tagsInput,' Tags & icons');toolbar.append(showTags);tagsInput.onchange=()=>{labels.hidden=!tagsInput.checked;};
 const cutaway=document.createElement('label'),cutawayInput=document.createElement('input');cutawayInput.type='checkbox';cutawayInput.checked=!!(environment.modelUrl||environment.modelUrls?.length)&&!environment.airport?.enabled&&!environment.builderScene?.layoutMeta?.harbor;cutaway.append(cutawayInput,' Interior cutaway');toolbar.append(cutaway);cutawayInput.onchange=()=>{needsRender=true;};
 const legend=document.createElement('p');legend.className='local-map-legend';for(const [name,color]of [['Places','#bced8b'],['Docks & boats','#71e4e3'],['Runways & aircraft','#8fc6ff'],['Portals','#70dcff'],['Deeds','#ffd581'],['You & arrival','#ff9bae']]){const key=document.createElement('span');key.textContent='● '+name;key.style.color=color;legend.append(key);}
 const hint=document.createElement('p');hint.textContent='Drag to orbit · scroll or pinch to zoom · right-drag / two fingers to pan · select a tag for details';root.replaceChildren(toolbar,viewport,legend,hint);
 let tagEntries=[];
 function updateTags(){const tags=getTags?getTags():localMapTags(environment,liveState,viewerId),signature=JSON.stringify(tags);if(signature===tagSignature)return;tagSignature=signature;needsRender=true;const existing=new Map(tagEntries.map(entry=>[entry.tag.id,entry]));tagEntries=tags.map(tag=>{let entry=existing.get(tag.id);if(entry)existing.delete(tag.id);else{const button=document.createElement('button');button.type='button';button.className='local-map-3d-tag';button.dataset.mapTag=tag.id;const leader=document.createElement('span'),dot=document.createElement('span');leader.className='local-map-pin-leader';dot.className='local-map-pin-dot';leader.setAttribute('aria-hidden','true');dot.setAttribute('aria-hidden','true');labels.append(leader,dot,button);entry={button,leader,dot,tag};button.onclick=event=>{event.stopPropagation();onSelect(entry.tag);};}entry.tag=tag;entry.button.classList.toggle('is-compact',!!tag.compact);entry.button.dataset.worldX=tag.x;entry.button.dataset.worldY=tag.y;entry.button.dataset.worldZ=tag.z;entry.button.textContent=tag.icon+' '+tag.name;if(tag.svgPath){const ns='http://www.w3.org/2000/svg',icon=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');icon.setAttribute('viewBox','0 0 120 100');icon.setAttribute('aria-hidden','true');icon.classList.add('atlas-tag-icon');path.setAttribute('d',tag.svgPath);icon.append(path);const label=document.createElement('span');label.textContent=tag.name;entry.button.replaceChildren(icon,label);}entry.button.style.setProperty('--tag-color',tag.color);entry.button.setAttribute('aria-label',tag.name+' · '+tag.kind+(tag.occupied?' · occupied':''));entry.button.title=tag.description||tag.name;return entry;});for(const {button,leader,dot}of existing.values()){button.remove();leader.remove();dot.remove();}}
 const resize=()=>{const width=Math.max(1,viewport.clientWidth),height=Math.max(1,viewport.clientHeight);renderer.setSize(width,height,false);needsRender=true;camera.aspect=width/height;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(viewport);let visible=true;const visibilityObserver=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)needsRender=true;}):null;visibilityObserver?.observe(viewport);
 const rebuild=()=>{const next=mirrorMapMeshes(getRoots?getRoots():[ownedLoader?.world,ownedDecor],resources);if(mirror){scene.remove(mirror.group);mirror.dispose();}mirror=next;scene.add(mirror.group);needsRender=true;};
 const stop=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();visibilityObserver?.disconnect();controls.dispose();mirror?.dispose();ownedLoader?.unload();ownedDecor?.traverse(node=>{node.geometry?.dispose();for(const material of [].concat(node.material||[]))material?.dispose();});renderer.dispose();renderer.forceContextLoss();root.replaceChildren();};
 try{
  if(!getRoots){const [{EnvironmentLoader},{createBuilderModel,createGeneratedAsset}]=await Promise.all([import('./environments/environment-loader.js'),import('./builder-models-3d.js')]);ownedLoader=new EnvironmentLoader({scene:new THREE.Scene(),renderer,serverAuthoritative:()=>true});await ownedLoader.load(environment);ownedDecor=new THREE.Group();const definitions=new Map([...(environment.builderScene?.catalogModels||[]),...(environment.builderScene?.placedModels||[])].map(model=>[model.id,model]));for(const item of environment.builderScene?.objects||[]){const definition=definitions.get(item.modelId),object=createBuilderModel(item.asset?.buildAssetId||definition?.buildAssetId||item.modelId)||(definition?.generated?createGeneratedAsset(definition):null);if(!object)continue;object.userData.builderObjectId=item.id;object.position.set(item.position?.x||0,item.position?.y||0,item.position?.z||0);object.rotation.set(item.rotation?.x||0,item.rotation?.y||0,item.rotation?.z||0);object.scale.set(item.scale?.x??1,item.scale?.y??1,item.scale?.z??1);ownedDecor.add(object);}}
  rebuild();resize();fit();updateTags();
  const point=new THREE.Vector3(),clipPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),4);
  let lastDraw=0;
  function draw(time){if(disposed)return;frame=requestAnimationFrame(draw);if(document.hidden||!visible||!root.isConnected||(root.closest('dialog')&&!root.closest('dialog').open)||root.closest('[hidden]')||time-lastDraw<50)return;lastDraw=time;if(getRoots&&refreshInterval&&time-lastRebuild>refreshInterval){rebuild();lastRebuild=time;}if(mirror.update())needsRender=true;controls.update();if(!needsRender)return;needsRender=false;
   const player=liveState?.players?.[viewerId];clipPlane.constant=cutawayHeight?cutawayHeight():(player?.position?.y??environment.spawn?.y??center.y)+3;renderer.clippingPlanes=cutawayInput.checked?[clipPlane]:[];
   const width=viewport.clientWidth,height=viewport.clientHeight;
   const occupied=[];
   for(const {tag,button,leader,dot}of tagEntries){point.set(tag.x,tag.y+1.8,tag.z).project(camera);const hidden=point.z< -1||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1;button.hidden=leader.hidden=dot.hidden=hidden;if(hidden)continue;
    const px=(point.x+1)*width/2,py=(1-point.y)*height/2,bw=button.offsetWidth||100,bh=button.offsetHeight||28,clampX=value=>Math.max(bw/2+3,Math.min(width-bw/2-3,value)),startX=clampX(px),startY=Math.max(bh+3,Math.min(height-3,py-8));
    const xs=[startX];for(let column=bw/2+3;column<=width-bw/2-3;column+=bw+6)xs.push(column);
    const ys=[startY];for(let row=bh+3;row<=height-3;row+=bh+5)ys.push(row);
    const candidates=xs.flatMap(x=>ys.map(y=>({x,y,distance:Math.abs(x-startX)+Math.abs(y-startY)}))).sort((a,b)=>a.distance-b.distance);
    const slot=candidates.find(({x,y})=>!occupied.some(other=>x-bw/2<other.right+3&&x+bw/2>other.left-3&&y-bh<other.bottom+3&&y>other.top-3));
    if(!slot){button.hidden=leader.hidden=true;dot.style.left=px+'px';dot.style.top=py+'px';dot.style.background=tag.color;continue;}
    const {x,y}=slot;
    occupied.push({left:x-bw/2,right:x+bw/2,top:y-bh,bottom:y});button.style.left=x+'px';button.style.top=y+'px';dot.style.left=px+'px';dot.style.top=py+'px';dot.style.background=leader.style.background=tag.color;const dx=x-px,dy=y-py;leader.style.left=px+'px';leader.style.top=py+'px';leader.style.width=Math.hypot(dx,dy)+'px';leader.style.transform='rotate('+Math.atan2(dy,dx)+'rad)';
   }
   compass.style.transform='rotate('+(-Math.atan2(camera.position.x-controls.target.x,camera.position.z-controls.target.z))+'rad)';renderer.render(scene,camera);
  }frame=requestAnimationFrame(draw);
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();renderer.domElement.addEventListener('dblclick',event=>{if(!onTravel)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObject(mirror.group,true).find(hit=>!cutawayInput.checked||hit.point.y<=clipPlane.constant);if(hit)onTravel({position:{x:hit.point.x,z:hit.point.z}});});
  return {renderer,refresh(){rebuild();updateTags();},fit,focus(point,distance=span){controls.target.copy(point);camera.position.copy(point).add(new THREE.Vector3(0,distance*.85,distance*.7));controls.update();needsRender=true;},zoom(factor){camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();needsRender=true;},pan(x,z){const delta=new THREE.Vector3(x,0,z);controls.target.add(delta);camera.position.add(delta);controls.update();needsRender=true;},updateLive(snapshot,id){liveState=snapshot;viewerId=id;for(const object of ownedDecor?.children||[]){const actor=snapshot?.actors?.[object.userData.builderObjectId];if(!actor)continue;object.visible=actor.active!==false;if(actor.position)object.position.set(actor.position.x,actor.position.y,actor.position.z);if(actor.rotation)object.rotation.set(actor.rotation.x||0,actor.rotation.y||0,actor.rotation.z||0);}updateTags();},dispose:stop};
 }catch(error){stop();throw error;}
}
