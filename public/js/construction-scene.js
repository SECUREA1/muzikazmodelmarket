import {QUARRY_MATERIALS} from './quarry-config.js';
import {constructionStructure} from './construction-workplans.js';
import {constructionOperatorPose} from './construction-kinematics.js';
import {CONSTRUCTION_CREW_COLORS} from './construction-crew.js';
import {createConstructionEarthGeometry} from './construction-terrain.js';
export {createConstructionEarthGeometry} from './construction-terrain.js';

const numeric=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const point=value=>value?.position||value;
const groundMaterial=(patch,index)=>Object.keys(QUARRY_MATERIALS).find(key=>numeric(patch.products?.[key]?.[index])>1e-8)||(numeric(patch.gravel?.[index])>1e-8?'gravel':'soil');
const groundColor=key=>QUARRY_MATERIALS[key]?.color??(key==='gravel'?0x92948b:0x866346);

// These meshes display confirmed work; they never change terrain, jobs or scores.
export function createConstructionScene(THREE,scene){
 const root=new THREE.Group();root.name='SHARED_CONSTRUCTION_PROGRESS';root.visible=false;root.userData.collisionDisabled=true;scene.add(root);
 const frame=new THREE.Group(),guides=new THREE.Group(),earth=new THREE.Group(),crew=new THREE.Group(),loads=new THREE.Group();frame.name='CONSTRUCTION_FRAME';guides.name='CONSTRUCTION_LIFT_GUIDES';earth.name='CONSTRUCTION_EARTHWORKS';crew.name='CONSTRUCTION_CREW';loads.name='CONSTRUCTION_STEEL_HIGHLIGHTS';root.add(frame,guides,earth,crew,loads);
 const steel=new THREE.MeshStandardMaterial({color:0xa4b6bf,metalness:.65,roughness:.38}),slab=new THREE.MeshStandardMaterial({color:0x929b9f,roughness:.95}),glass=new THREE.MeshStandardMaterial({color:0x548fa2,metalness:.35,roughness:.28,transparent:true,opacity:.48}),terrainMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}),stoneMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),cyan=new THREE.MeshBasicMaterial({color:0x6bffe0,transparent:true,opacity:.85,depthWrite:false}),amber=new THREE.MeshBasicMaterial({color:0xffd151,transparent:true,opacity:.66,depthWrite:false}),wire=new THREE.MeshBasicMaterial({color:0x90c4d2,wireframe:true,transparent:true,opacity:.1,depthWrite:false}),lineMaterial=new THREE.LineBasicMaterial({color:0xffd151,transparent:true,opacity:.8,depthWrite:false}),looseSteel=new THREE.LineBasicMaterial({color:0x82f0e4,transparent:true,opacity:.65}),riggedSteel=new THREE.LineBasicMaterial({color:0xffdc60,transparent:true,opacity:1}),safetyMaterial=new THREE.MeshStandardMaterial({color:0xe9c75b,roughness:.65});
 const materials=[steel,slab,glass,terrainMaterial,stoneMaterial,cyan,amber,wire,lineMaterial,looseSteel,riggedSteel,safetyMaterial],workerMaterials=new Map(),workers=new Map(),beamHighlights=new Map(),earthPatches=new Map(),previousHeights=new Map(),previousMaterials=new Map(),particles=[],quarryTags=new Map();
 const quarryLabels=new THREE.Group();quarryLabels.name='QUARRY_STOCKPILE_AND_PLANT_LABELS';root.add(quarryLabels);
 const dustMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,vertexColors:false}),dust=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),dustMaterial,64),particleMatrix=new THREE.Object3D();dust.name='EARTH_MOVEMENT_PARTICLES';dust.count=0;dust.frustumCulled=false;dust.userData.collisionDisabled=true;root.add(dust);materials.push(dustMaterial);
 let signature='',earthSignature='',target=null,targetRing=null,targetAssembly=null,lastTime=null,currentSnapshot=null;
 const clear=group=>{for(const child of [...group.children]){child.traverse(node=>{if(!node.isSprite)node.geometry?.dispose();if(node.userData.worldLabel){node.material.map?.dispose();node.material.dispose();}});group.remove(child);}};
 const box=(parent,size,position,material=steel)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);mesh.castShadow=material===steel;mesh.receiveShadow=true;mesh.userData.collisionDisabled=true;parent.add(mesh);return mesh;};
 function label(parent,position,scale=[3.3,.82,1]){
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthTest:false,depthWrite:false}));sprite.position.set(...position);sprite.scale.set(...scale);sprite.userData={collisionDisabled:true,worldLabel:true,text:''};parent.add(sprite);
  if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');if(ctx){const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;sprite.material.map=texture;sprite.userData.canvas=canvas;sprite.userData.context=ctx;}}
  return sprite;
 }
 function updateLabel(sprite,title,detail,progress=null,caption=null){
  const rounded=Number.isFinite(progress)?Math.round(Math.max(0,Math.min(1,progress))*100):null,key=JSON.stringify([title,detail,rounded,caption]);if(sprite.userData.text===key)return;sprite.userData.text=key;sprite.userData.title=title;sprite.userData.detail=detail;sprite.userData.progress=rounded;sprite.userData.caption=caption;
  const ctx=sprite.userData.context;if(!ctx)return;ctx.clearRect(0,0,512,128);ctx.fillStyle='#102b34e8';ctx.fillRect(2,2,508,124);ctx.fillStyle='#e9f5eb';ctx.font='bold 29px sans-serif';ctx.fillText(String(title).slice(0,29),15,36);ctx.fillStyle='#9fd4ce';ctx.font='21px sans-serif';ctx.fillText(String(detail).slice(0,42),15,70);if(rounded!==null){ctx.fillStyle='#324c53';ctx.fillRect(15,91,440,10);ctx.fillStyle='#e9c95c';ctx.fillRect(15,91,440*rounded/100,10);ctx.fillStyle='#e9f5eb';ctx.font='14px monospace';ctx.fillText(rounded+'%',460,101);}else if(caption){ctx.fillStyle='#f1d99b';ctx.font='19px sans-serif';ctx.fillText(String(caption).slice(0,46),15,106);}sprite.material.map.needsUpdate=true;
 }
 function updateEarth(site){
  const state=site.earthworks;if(!state?.patches?.length){earth.visible=false;return;}earth.visible=true;
  const key=JSON.stringify([state.revision??state.patches.map(patch=>patch.heights),state.patches.map(patch=>[patch.id,patch.origin,patch.cellSize,patch.columns,patch.rows])]);if(key===earthSignature)return;earthSignature=key;const seen=new Set();
  for(const patch of state.patches){
   seen.add(patch.id);const patchKey=JSON.stringify([patch.origin,patch.cellSize,patch.columns,patch.rows,patch.baseY,patch.minY,patch.heights,(patch.gravel||[]).map(volume=>volume>1e-8?1:0),patch.products]),existing=earthPatches.get(patch.id);if(existing?.key===patchKey){existing.mesh.userData.terrainRevision=state.revision;continue;}if(existing)for(const mesh of [existing.mesh,existing.grain])if(mesh){mesh.geometry.dispose();mesh.removeFromParent();}
   const prior=previousHeights.get(patch.id),priorMaterials=previousMaterials.get(patch.id);if(prior)for(let index=0;index<patch.heights.length;index++){const change=numeric(patch.heights[index])-numeric(prior[index]);if(Math.abs(change)<.015)continue;if(particles.length>=64)particles.shift();particles.push({position:new THREE.Vector3(patch.origin.x+(index%patch.columns+.5)*patch.cellSize,Math.max(numeric(prior[index]),numeric(patch.heights[index]))+.07,patch.origin.z+(Math.floor(index/patch.columns)+.5)*patch.cellSize),velocity:new THREE.Vector3(Math.sin(index*3.7)*.5,.5+Math.min(1,Math.abs(change)),Math.cos(index*2.9)*.5),age:0,life:.6+(index%4)*.08,color:new THREE.Color(groundColor(change<0?priorMaterials?.[index]||groundMaterial(patch,index):groundMaterial(patch,index))),radius:.04+(index%4)*.012});}previousHeights.set(patch.id,[...patch.heights]);previousMaterials.set(patch.id,patch.heights.map((_,index)=>groundMaterial(patch,index)));
   const geometry=createConstructionEarthGeometry(THREE,patch),mesh=new THREE.Mesh(geometry,terrainMaterial);mesh.name='EARTH_PATCH_'+patch.id;mesh.receiveShadow=true;mesh.userData={collider:true,earthPatchId:patch.id,terrainRevision:state.revision};earth.add(mesh);const entry={key:patchKey,mesh,grain:null};earthPatches.set(patch.id,entry);
   const candidates=[];for(let index=0;index<patch.heights.length;index++){const material=groundMaterial(patch,index),volume=material==='gravel'?patch.gravel?.[index]:patch.products?.[material]?.[index];if(!['gravel','stone','crushed'].includes(material)||numeric(volume)<=.02)continue;for(let grain=0;grain<(material==='gravel'?1:2);grain++)candidates.push({index,material,grain});}
   const stride=Math.max(1,Math.ceil(candidates.length/240)),pebbles=candidates.filter((_,index)=>index%stride===0).slice(0,240);
   if(pebbles.length){const grain=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),stoneMaterial,pebbles.length),dummy=new THREE.Object3D();grain.name='LOOSE_'+(pebbles.every(p=>p.material==='gravel')?'GRAVEL_':'AGGREGATE_')+patch.id;grain.userData={collisionDisabled:true,quarryAggregate:true,materialTypes:[...new Set(pebbles.map(p=>p.material))],instanceBudget:240};for(let i=0;i<pebbles.length;i++){const {index,material,grain:seed}=pebbles[i],r=(material==='stone'?.11:material==='crushed'?.075:.045)+(index%5)*.008;dummy.position.set(patch.origin.x+(index%patch.columns+.2+(index%7)*.08+seed*.24)*patch.cellSize,numeric(patch.heights[index])+.035,patch.origin.z+(Math.floor(index/patch.columns)+.25+(index%3)*.17+seed*.16)*patch.cellSize);dummy.scale.set(r,r*.5,r*.8);dummy.rotation.set(0,index*.7+seed,index*.13);dummy.updateMatrix();grain.setMatrixAt(i,dummy.matrix);grain.setColorAt(i,new THREE.Color(groundColor(material)));}grain.instanceMatrix.needsUpdate=true;if(grain.instanceColor)grain.instanceColor.needsUpdate=true;grain.computeBoundingSphere();earth.add(grain);entry.grain=grain;}

  }
  for(const [id,entry]of earthPatches)if(!seen.has(id)){for(const mesh of [entry.mesh,entry.grain])if(mesh){mesh.geometry.dispose();mesh.removeFromParent();}earthPatches.delete(id);previousHeights.delete(id);previousMaterials.delete(id);}
 }
 function updateQuarry(snapshot){
  const quarry=snapshot.quarry;if(!quarry){if(quarryTags.size){clear(quarryLabels);quarryTags.clear();}quarryLabels.visible=false;return;}quarryLabels.visible=true;
  const seen=new Set(),patches=snapshot.construction.earthworks?.patches||[],actors=Object.values(snapshot.actors||{});
  for(const [key,definition]of Object.entries(QUARRY_MATERIALS)){
   const stock=quarry.stockpiles?.[key],patch=patches.find(p=>p.id===(stock?.patchId||'product-'+key));if(!stock||!patch)continue;const id='pile:'+key;seen.add(id);let tag=quarryTags.get(id);if(!tag){tag=label(quarryLabels,[0,0,0],[6.6,1.65,1]);tag.name='QUARRY_STOCKPILE_LABEL_'+key;quarryTags.set(id,tag);}
   const height=patch.heights.reduce((max,value)=>Math.max(max,numeric(value)),numeric(patch.baseY));tag.position.set(patch.origin.x+patch.columns*patch.cellSize/2,height+2,patch.origin.z+patch.rows*patch.cellSize/2);tag.userData.quarryMaterial=key;
   updateLabel(tag,definition.name,numeric(stock.volume).toFixed(1)+' m³ loose · '+numeric(stock.buffer).toFixed(1)+' m³ in plant',null,'Book stock for Trading Market');
  }
  for(const stock of (quarry.stockInventory?.piles||[]).filter(stock=>!stock.patchId.startsWith('product-')).slice(0,18)){
   const patch=patches.find(p=>p.id===stock.patchId);if(!patch)continue;const id='yard:'+stock.id;seen.add(id);let tag=quarryTags.get(id);if(!tag){tag=label(quarryLabels,[0,0,0],[6.6,1.65,1]);tag.name='QUARRY_YARD_LABEL_'+stock.id;quarryTags.set(id,tag);}
   const height=patch.heights.reduce((max,value)=>Math.max(max,numeric(value)),numeric(patch.baseY));tag.position.set(stock.x,height+2,stock.z);tag.userData.quarryMaterial=stock.material;
   updateLabel(tag,stock.name,numeric(stock.volume).toFixed(1)+' m³ loose · '+numeric(stock.seededVolume).toFixed(0)+' m³ opening stock',null,QUARRY_MATERIALS[stock.material]?'Scoop & load · book for freight':'Raw feed · screen before freight');
  }
  for(const [key,title]of [['screener','Screening plant'],['crusher','Jaw crusher'],['stacker','Stockpile stacker']]){
   const state=quarry.stations?.[key],actor=actors.find(a=>a.active!==false&&a.quarryMachine?.kind===key);if(!state||!actor)continue;const id='plant:'+key;seen.add(id);let tag=quarryTags.get(id);if(!tag){tag=label(quarryLabels,[0,0,0],[5.5,1.35,1]);tag.name='QUARRY_PLANT_LABEL_'+key;quarryTags.set(id,tag);}tag.position.set(numeric(actor.position?.x),numeric(actor.position?.y)+5.5,numeric(actor.position?.z));updateLabel(tag,title,numeric(state.throughput).toFixed(2)+' m³/s · '+(state.status||'Parked'));
  }
  for(const [id,tag]of quarryTags)if(!seen.has(id)){tag.material.map?.dispose();tag.material.dispose();tag.removeFromParent();quarryTags.delete(id);}
 }
 function material(color){if(!workerMaterials.has(color)){const value=new THREE.MeshStandardMaterial({color,roughness:.85});workerMaterials.set(color,value);materials.push(value);}return workerMaterials.get(color);}
 function createWorker(worker){
  const appearance=worker.appearance||{},palette=(type,fallback)=>CONSTRUCTION_CREW_COLORS[type]?.[appearance[type]]||fallback,workerRoot=new THREE.Group();workerRoot.name='CONSTRUCTION_WORKER_'+worker.id;workerRoot.userData.collisionDisabled=true;crew.add(workerRoot);
  const shirt=material(palette('shirt','#263d58')),vest=material(palette('vest','#b6e94d')),skin=material(palette('skin','#c99267')),hat=material(palette('hardHat','#f6cc3e')),pants=material('#354950'),boots=material('#192a30'),reflective=material('#e7efc9');
  const add=(geometry,mat,position,parent=workerRoot)=>{const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(...position);mesh.castShadow=true;mesh.userData.collisionDisabled=true;parent.add(mesh);return mesh;};
  const joint=(position,parent=workerRoot)=>{const value=new THREE.Group();value.position.set(...position);parent.add(value);return value;};
  add(new THREE.BoxGeometry(.43,.53,.23),shirt,[0,1.18,0]);add(new THREE.BoxGeometry(.46,.42,.26),vest,[0,1.2,0]);for(const y of [1.09,1.31])add(new THREE.BoxGeometry(.47,.045,.275),reflective,[0,y,0]);for(const x of [-.14,.14])add(new THREE.BoxGeometry(.035,.34,.28),reflective,[x,1.24,0]);
  add(new THREE.SphereGeometry(.135,12,8),skin,[0,1.63,-.015]);add(new THREE.SphereGeometry(.16,12,8,0,Math.PI*2,0,Math.PI*.6),hat,[0,1.7,0]);add(new THREE.CylinderGeometry(.19,.19,.035,14),hat,[0,1.7,0]);add(new THREE.BoxGeometry(.2,.045,.025),boots,[0,1.66,-.135]);
  const hips=joint([0,.9,0]);hips.name='CREW_HIPS';
  // Move the existing torso and workwear under one pelvis pivot, retaining
  // every rest transform and every rendered primitive. Labels stay upright.
  for(const part of [...workerRoot.children])if(part!==hips){workerRoot.remove(part);part.position.y-=.9;hips.add(part);}
  const arms=[],legs=[];
  for(const side of [-1,1]){
   const arm=joint([side*.27,.5,0],hips),elbow=joint([0,-.29,0],arm);arm.name=side<0?'CREW_LEFT_ARM':'CREW_RIGHT_ARM';elbow.name='CREW_ELBOW';add(new THREE.CylinderGeometry(.065,.07,.29,8),shirt,[0,-.145,0],arm);add(new THREE.CylinderGeometry(.05,.06,.27,8),shirt,[0,-.135,0],elbow);add(new THREE.SphereGeometry(.06,8,6),skin,[0,-.29,0],elbow);arms.push({arm,elbow,side});
   const leg=joint([side*.115,0,0],hips),knee=joint([0,-.42,0],leg),ankle=joint([0,-.39,0],knee);ankle.name='CREW_ANKLE';leg.name=side<0?'CREW_LEFT_LEG':'CREW_RIGHT_LEG';knee.name='CREW_KNEE';add(new THREE.CylinderGeometry(.075,.085,.42,8),pants,[0,-.21,0],leg);add(new THREE.CylinderGeometry(.065,.075,.39,8),pants,[0,-.195,0],knee);add(new THREE.BoxGeometry(.15,.13,.27),boots,[0,-.02,-.06],ankle);legs.push({leg,knee,ankle,side});
  }
  const tool=joint([0,-.3,0],arms[1].elbow);add(new THREE.CylinderGeometry(.018,.025,.35,6),material('#856338'),[0,.12,0],tool);add(new THREE.BoxGeometry(.18,.07,.07),material('#8e9a9b'),[0,.3,0],tool);tool.visible=false;
  const tag=label(workerRoot,[0,2.18,0]);return {root:workerRoot,hips,arms,legs,tool,tag,target:new THREE.Vector3(),heading:0,data:worker,appearance:JSON.stringify(appearance),fresh:true};
 }
 function updateCrew(snapshot){
  const data=snapshot.construction?.crew,seen=new Set(),jobs=new Map((data?.jobs||[]).map(job=>[job.id,job]));crew.visible=!!data?.workers?.length;
  for(const worker of (data?.workers||[]).slice(0,24)){
   if(!worker.id)continue;seen.add(worker.id);let rig=workers.get(worker.id);
   if(rig&&rig.appearance!==JSON.stringify(worker.appearance||{})){clear(rig.root);rig.root.removeFromParent();workers.delete(worker.id);rig=null;}
   if(!rig){rig=createWorker(worker);workers.set(worker.id,rig);}
   const machine=worker.machineId&&snapshot.actors?.[worker.machineId],seated=worker.state!=='walking'&&machine,operator=seated?constructionOperatorPose(machine):null;
   rig.data=worker;rig.seated=!!operator;rig.target.set(numeric(operator?.seat?.x,worker.position?.x),operator?operator.seat.y-.9:numeric(worker.position?.y),numeric(operator?.seat?.z,worker.position?.z));rig.heading=operator?.yaw??numeric(worker.heading);if(rig.fresh){rig.root.position.copy(rig.target);rig.root.rotation.y=rig.heading;rig.fresh=false;}
   rig.root.userData.worker={id:worker.id,name:worker.name,role:worker.role,state:worker.state,machineId:worker.machineId,progress:worker.progress};
   const job=jobs.get(worker.jobId),progress=Number.isFinite(worker.progress)?worker.progress:Number.isFinite(job?.progress)?job.progress:null;
   updateLabel(rig.tag,(worker.name||'Site worker')+' · AI',worker.speechUntil>(snapshot.serverTime||0)?worker.speech:worker.message||worker.phase||worker.role||worker.state||'Ready',progress);rig.tool.visible=!seated&&/steel|fix|inspect|survey|rig/i.test(worker.role+' '+worker.phase);
  }
  for(const [id,rig]of workers)if(!seen.has(id)){clear(rig.root);rig.root.removeFromParent();workers.delete(id);}
 }
 function updateSteel(site){
  const seen=new Set();let supplyLabels=0;for(const beam of site.beams||[]){if(!beam.id||beam.state==='placed')continue;seen.add(beam.id);let value=beamHighlights.get(beam.id);if(!value){const group=new THREE.Group();group.name='STEEL_HIGHLIGHT_'+beam.id;const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(18,.68,.5)),looseSteel);outline.position.y=.31;group.add(outline);group.userData.collisionDisabled=true;loads.add(group);value={group,outline,tag:label(group,[0,1.25,0],[3.6,.85,1])};beamHighlights.set(beam.id,value);}const p=beam.position||{};value.group.position.set(numeric(p.x),numeric(p.y),numeric(p.z));value.group.rotation.y=numeric(beam.rotation?.y);const carried=beam.state==='rigged'||beam.state==='attached'||beam.state==='lifting';value.group.userData.beamState=beam.state;value.outline.material=carried?riggedSteel:looseSteel;value.tag.visible=carried||supplyLabels++===0;updateLabel(value.tag,carried?'RIGGED STRUCTURAL STEEL':'STEEL · READY TO LIFT',Number.isFinite(beam.mass)?beam.mass.toFixed(1)+' t · Use crane hook':'Attach hook above lifting shackles');}
  for(const [id,value]of beamHighlights)if(!seen.has(id)){clear(value.group);value.group.removeFromParent();beamHighlights.delete(id);}
 }
 function update(snapshot){
  const site=snapshot?.construction;if(!site){if(currentSnapshot?.construction)reset();return;}currentSnapshot=snapshot;root.visible=true;updateEarth(site);updateCrew(snapshot);updateSteel(site);updateQuarry(snapshot);
  const crane=Object.values(snapshot.actors||{}).find(actor=>actor.construction?.kind==='crane'||actor.modelId==='tower-crane'),structureId=crane?.construction?.structureId||'tower',t=constructionStructure(site,crane);if(!t)return;
  const placed=Math.max(0,Math.floor(t.placed||0)),perFloor=t.beamsPerFloor||4,floors=Math.floor(placed/perFloor),partial=placed%perFloor,structures=Object.values(snapshot.actors||{}).filter(actor=>actor.active!==false&&actor.constructionStructure&&(actor.constructionStructure.structureId||'tower')===structureId),physicalLevels=new Set(structures.filter(actor=>actor.constructionStructure.kind==='floor').map(actor=>actor.constructionStructure.floor)),glazedLevels=new Set(structures.filter(actor=>actor.constructionStructure.kind==='facade').map(actor=>actor.constructionStructure.floor));
  const x=t.x||0,z=t.z||0,base=t.baseY||0,h=t.floorHeight||4,w=t.width||18,d=t.depth||18,max=t.maxFloors||16,nextSignature=JSON.stringify([x,z,base,h,w,d,max,placed,[...physicalLevels],[...glazedLevels]]);
  if(nextSignature!==signature){
   signature=nextSignature;clear(frame);clear(guides);box(frame,[w+2,.3,d+2],[x,base+.02,z],slab);
   const visibleFloors=Math.min(max,floors+(floors<max?1:0));
   for(let level=0;level<visibleFloors;level++){const y=base+level*h;if(!physicalLevels.has(level+1))for(const dx of [-w/2,w/2])for(const dz of [-d/2,d/2])box(frame,[.45,h,.45],[x+dx,y+h/2,z+dz]);const beams=level<floors?perFloor:partial;for(let side=0;!site.beams&&side<Math.min(4,beams);side++){const alongX=side%2===0;box(frame,alongX?[w+.5,.55,.42]:[.42,.55,d+.5],[x+(side===1?w/2:side===3?-w/2:0),y+h,z+(side===0?-d/2:side===2?d/2:0)]);}if(level<floors){if(!physicalLevels.has(level+1))box(frame,[w-.4,.16,d-.4],[x,y+h-.36,z],slab);if(!t.frameOnly&&(glazedLevels.has(level+1)||level<floors-1||floors===max)){box(frame,[w-.7,h-.7,.08],[x,y+h/2,z-d/2+.08],glass);box(frame,[.08,h-.7,d-.7],[x+w/2-.08,y+h/2,z],glass);}}}
   const ghost=box(guides,[w,max*h,d],[x,base+max*h/2,z],wire);ghost.name='PLANNED_SKYSCRAPER';
   targetAssembly=new THREE.Group();targetAssembly.name='ACTIVE_STEEL_RECEIVER';guides.add(targetAssembly);target=box(guides,[w,.14,.5],[0,0,0],amber);target.name='NEXT_STEEL_PLACEMENT';
   for(const side of [-1,1]){box(targetAssembly,[.16,1.1,1.25],[side*w/2,.45,0],cyan);box(targetAssembly,[1.4,.12,1.25],[side*w/2,-.04,0],cyan);const chevron=box(targetAssembly,[.12,.7,.12],[side*(w/2-.7),1.2,0],safetyMaterial);chevron.rotation.z=side*.7;}
   targetRing=new THREE.Mesh(new THREE.TorusGeometry(1.35,.07,6,40),cyan);targetRing.rotation.x=Math.PI/2;targetRing.userData.collisionDisabled=true;guides.add(targetRing);
  }
  target.visible=targetAssembly.visible=targetRing.visible=!!t.target&&placed<max*perFloor;
  if(t.target&&target){const p=point(t.target);targetAssembly.position.set(p.x,p.y,p.z);targetAssembly.rotation.y=numeric(t.target.rotation?.y??t.target.yaw);target.position.set(p.x,p.y,p.z);target.rotation.y=targetAssembly.rotation.y;target.userData.worldTarget={x:p.x,y:p.y,z:p.z};targetRing.position.set(p.x,p.y+.13,p.z);}
 }
 function reset(){signature=earthSignature='';target=targetRing=targetAssembly=null;lastTime=null;currentSnapshot=null;workers.clear();beamHighlights.clear();earthPatches.clear();previousHeights.clear();previousMaterials.clear();quarryTags.clear();particles.length=0;dust.count=0;for(const group of [frame,guides,earth,crew,loads,quarryLabels])clear(group);root.visible=false;}
 return {root,get groundMeshes(){return root.visible&&earth.visible?earth.children.filter(mesh=>mesh.userData.earthPatchId):[];},update,animate(elapsed,{reducedMotion=false}={}){
  const delta=lastTime===null?0:Math.min(.1,Math.max(0,elapsed-lastTime));lastTime=elapsed;
  for(let index=particles.length-1;index>=0;index--){const p=particles[index];p.age+=delta;if(p.age>=p.life){particles.splice(index,1);continue;}p.velocity.y-=delta*3.8;p.position.addScaledVector(p.velocity,delta);}
  dust.count=particles.length;for(let index=0;index<particles.length;index++){const p=particles[index];particleMatrix.position.copy(p.position);particleMatrix.scale.setScalar(p.radius*(1-p.age/p.life*.7));particleMatrix.rotation.set(p.age*3,index*.7,p.age*2);particleMatrix.updateMatrix();dust.setMatrixAt(index,particleMatrix.matrix);dust.setColorAt(index,p.color);}dust.instanceMatrix.needsUpdate=true;if(dust.instanceColor)dust.instanceColor.needsUpdate=true;
  if(targetRing){const scale=1+Math.sin(elapsed*3)*.06;targetRing.scale.setScalar(scale);}if(target)target.material.opacity=.48+Math.sin(elapsed*2)*.14;
  const crewBlend=1-Math.exp(-delta*14),walkWave=Math.sin(elapsed*6.2),workWave=Math.sin(elapsed*4),toolWave=reducedMotion?0:Math.sin(elapsed*5);
  for(const rig of workers.values()){rig.root.position.lerp(rig.target,crewBlend);const yaw=rig.root.rotation.y;rig.root.rotation.y+=Math.atan2(Math.sin(rig.heading-yaw),Math.cos(rig.heading-yaw))*crewBlend;const walking=rig.data.state==='walking'&&!reducedMotion,wave=walkWave,working=rig.data.state==='operating'&&!reducedMotion;rig.hips.rotation.y=walking?wave*.035:0;rig.hips.rotation.z=walking?wave*.018:0;for(const {leg,knee,ankle,side}of rig.legs){const swing=wave*side;leg.rotation.x=rig.seated?Math.PI/2:walking?swing*.52:0;knee.rotation.x=rig.seated?-Math.PI/2:walking?-Math.max(0,-swing)*.5:0;ankle.rotation.x=rig.seated?0:walking?-leg.rotation.x*.35-knee.rotation.x*.6:0;}for(const {arm,elbow,side}of rig.arms){arm.rotation.x=rig.seated?-.95:walking?-wave*side*.35:working?-.35-workWave*.15:0;arm.rotation.z=rig.seated?side*.1:rig.tool.visible?side*.25:0;elbow.rotation.x=rig.seated?-.5:rig.tool.visible?-.6-toolWave*.2:walking?-.12-Math.max(0,wave*side)*.22:0;}rig.tag.position.y=rig.seated?2.05:2.18;}
 },reset,dispose(){reset();root.removeFromParent();dust.geometry.dispose();materials.forEach(value=>value.dispose());}};
}
