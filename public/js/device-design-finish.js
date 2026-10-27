import {INTERACTIVE_DEVICES} from './interactive-devices.js';
import {FITNESS_ITEMS} from './fitness-equipment.js';
import {HOCKEY_ITEMS} from './hockey-models.js';
import {ARCADE_PARTS} from './arcade-rules.js';

// Finishes stay on the authored parts: opening panels, articulated athletes and
// moving rides retain their native meshes, transforms and animation controls.
export const DEVICE_DESIGN_VERSION='crafted-devices-1';
const hockey=new Set(HOCKEY_ITEMS.map(item=>item.id));
const arcade=new Set(ARCADE_PARTS.map(item=>'arcade-part-'+item.id));
const basketball=new Set(['basketball','basketball-hoop','basketball-jersey-home','basketball-jersey-away']);
export const DEVICE_DESIGN_IDS=Object.freeze([...new Set([...Object.keys(INTERACTIVE_DEVICES),...Object.keys(FITNESS_ITEMS),...hockey,...arcade,...basketball,'prison-radio'])]);
const supported=new Set(DEVICE_DESIGN_IDS);
export const supportsDeviceDesign=id=>supported.has(id);

const protectedName=/SCREEN|DISPLAY|MARQUEE|ARTWORK|SCORE|CLOCK|LABEL|SEGMENT|NUMBER|DIGIT|FEED|GLASS|VISOR|NET_|_NET|TARGET_BOX|TARGET_RECT|COURT_LINE|CENTRE_LINE|EDGE_LINE|LANE_LINE|TIMING_LINE|CANVAS_BADGE|CARD_PLACE|FELT_SURFACE/i;
function protectedPart(node,root){
 for(let part=node;part&&part!==root;part=part.parent){
  if(part.userData?.mediaScreen||part.userData?.scoreSegment||part.userData?.nativeDesignDetail)return true;
  if(part!==node&&/^(?:FITNESS_SCORE_(?:RED|BLUE|TIME|ROUND)|DEVICE_(?:SCREEN|IDLE_DISPLAY|MARQUEE)|ARCADE_LABEL_)/.test(part.name||''))return true;
 }
 if(protectedName.test(node.name||'')&&!/FRAME|STAND|SUPPORT|POST|FOOT|RAIL|BODY|CABINET|HOUSING|PANEL/.test(node.name||''))return true;
 return node.isInstancedMesh||!node.visible||node.userData?.collisionOnly;
}
function surfaceMaterial(THREE,node,light=false){
 const source=[].concat(node.material||[]).find(material=>material?.color),color=source?.color?.clone()||new THREE.Color(0x445766);
 color.lerp(new THREE.Color(light?0xd7ded3:0x101c29),light?.4:.55);
 const material=new THREE.MeshStandardMaterial({color,roughness:light?.4:.8,metalness:light?.46:.14});
 material.name=light?'CRAFTED_DEVICE_HARDWARE':'CRAFTED_DEVICE_RECESSED_SEAM';return material;
}
function mark(node,root,name){
 node.name=name;node.userData={collisionDisabled:true,nativeDesignDetail:true,builderRoot:root};node.castShadow=false;node.receiveShadow=true;return node;
}
// Unit-box batches keep an entire seam/fastener treatment at one extra draw call.
function batch(THREE,parent,root,parts,material,name){
 if(!parts.length)return 0;
 const value=mark(new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,parts.length),root,name),dummy=new THREE.Object3D();
 for(let i=0;i<parts.length;i++){
  const {size,position,rotation=[0,0,0]}=parts[i];dummy.position.set(...position);dummy.rotation.set(...rotation);dummy.scale.set(...size);dummy.updateMatrix();value.setMatrixAt(i,dummy.matrix);
 }
 value.instanceMatrix.needsUpdate=true;value.computeBoundingBox();value.computeBoundingSphere();parent.add(value);return 1;
}
function localBounds(THREE,node){
 const geometry=node.geometry;if(!geometry?.getAttribute('position'))return null;
 if(!geometry.boundingBox)geometry.computeBoundingBox();
 const bounds=geometry.boundingBox?.clone();if(!bounds||bounds.isEmpty())return null;
 const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 if(![...size,...center].every(Number.isFinite))return null;
 return {bounds,size:size.toArray(),center:center.toArray()};
}
function boxPart(node){
 const parameters=node.geometry?.parameters;
 return parameters&&Number.isFinite(parameters.width)&&Number.isFinite(parameters.height)&&Number.isFinite(parameters.depth);
}
function hardwarePlate(THREE,node,root,{cloth=false,top=false,floor=false}={}){
 const local=localBounds(THREE,node);if(!local)return 0;
 const {size:[w,h,d],center:[cx,cy,cz]}=local;
 if(Math.min(w,h,d)<=.002)return 0;
 // Work on one authored face only. The margin keeps details off frame edges,
 // controls, playing lines and curved chamfers. Skins expand by <=1 mm.
 const face=top||floor?'y':'z',width=w,height=face==='y'?d:h;
 if(width<.025||height<.025)return 0;
 const inset=Math.min(width,height)*.13,line=Math.max(.0005,Math.min(.007,Math.min(width,height)*.012));
 const scale=node.getWorldScale(new THREE.Vector3()),halfX=width/2-inset,halfY=height/2-inset,depth=.0008/Math.max(.001,Math.abs(face==='y'?scale.y:scale.z));
 const position=(x,y)=>face==='y'?[cx+x,cy+h/2+depth/2,cz+y]:[cx+x,cy+y,cz-d/2-depth/2];
 const dimensions=(x,y)=>face==='y'?[x,depth,y]:[x,y,depth];
 const parts=[];
 if(cloth){
  // Parallel stitched welts sit on padding, rather than metallic screw heads.
  const stitchCount=Math.max(4,Math.min(20,Math.floor(width/.05))),pitch=halfX*2/stitchCount;
  for(const y of [-halfY,halfY])for(let i=0;i<stitchCount;i++)parts.push({size:dimensions(pitch*.44,line),position:position(-halfX+(i+.5)*pitch,y)});
  for(const x of [-halfX,halfX])parts.push({size:dimensions(line,halfY*2),position:position(x,0)});
 }else if(floor){
  // Insets at the perimeter avoid marking up the regulated play surface.
  const length=Math.min(width,height)*.12;
  for(const x of [-halfX,halfX])for(const y of [-halfY,halfY]){
   parts.push({size:dimensions(length,line),position:position(x-Math.sign(x)*length*.35,y)});
   parts.push({size:dimensions(line,length),position:position(x,y-Math.sign(y)*length*.35)});
  }
 }else{
  const screw=Math.max(.001,Math.min(.018,Math.min(width,height)*.045));
  for(const x of [-halfX,halfX])for(const y of [-halfY,halfY])parts.push({size:dimensions(screw,screw),position:position(x,y),rotation:face==='y'?[0,Math.PI/4,0]:[0,0,Math.PI/4]});
  // Short service-panel seams and three cooling slots are deliberately kept
  // below the face centre, leaving the machine's existing controls unobstructed.
  parts.push({size:dimensions(width*.56,line),position:position(0,-height*.22)});
  for(let i=0;i<3;i++)parts.push({size:dimensions(width*.18,line),position:position(width*.17,-height*.09+i*height*.055)});
 }
 return batch(THREE,node,root,parts,surfaceMaterial(THREE,node,cloth),cloth?'CRAFTED_PADDED_STITCHING':floor?'CRAFTED_PERIMETER_INLAYS':'CRAFTED_SERVICE_PANEL');
}
function shaftBindings(THREE,node,root,cloth=false){
 const local=localBounds(THREE,node);if(!local)return 0;
 const {size,center}=local,axis=size.indexOf(Math.max(...size)),length=size[axis],other=[0,1,2].filter(index=>index!==axis);
 if(length<=.025)return 0;
 const width=Math.min(...other.map(index=>size[index]));if(width<=.003)return 0;
 const scale=node.getWorldScale(new THREE.Vector3()).toArray(),parts=[],band=Math.min(length*.017,width*.1,.01);
 for(let i=0;i<5;i++){
  const progress=.08+i*.045;
  for(const face of other)for(const side of [-1,1]){
   const depth=.0006/Math.max(.001,Math.abs(scale[face]));
   const cross=other.find(index=>index!==face),position=[...center],dimensions=[0,0,0];
   position[axis]+=length*(.5-progress);position[face]+=side*(size[face]/2+depth/2);
   dimensions[axis]=band;dimensions[face]=depth;dimensions[cross]=size[cross]*.9;
   parts.push({size:dimensions,position});
  }
 }
 return batch(THREE,node,root,parts,surfaceMaterial(THREE,node,cloth),cloth?'CRAFTED_TAPED_GRIP':'CRAFTED_SHAFT_BINDINGS');
}
function cylinderCollars(THREE,node,root,padded=false){
 const parameters=node.geometry?.parameters;
 if(!Number.isFinite(parameters?.radiusTop)||!Number.isFinite(parameters?.height))return 0;
 const local=localBounds(THREE,node),radius=Math.min(parameters.radiusTop,parameters.radiusBottom,...(local?[local.size[0]/2,local.size[2]/2]:[])),height=parameters.height;
 if(!(radius>.003&&height>.003))return 0;
 const scale=node.getWorldScale(new THREE.Vector3()),tube=Math.max(.00005,Math.min(.0025,radius*.035,.001/Math.max(.001,Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z)))),positions=[-height*.34,height*.34],geometry=new THREE.TorusGeometry(Math.max(tube,radius-tube*.2),tube,4,24),material=surfaceMaterial(THREE,node,padded);
 // Two rings merge into a single instanced draw call while following the
 // original cylinder if it is a turning handle, rotating wheel or pivot.
 const value=mark(new THREE.InstancedMesh(geometry,material,2),root,padded?'CRAFTED_PADDED_END_BINDINGS':'CRAFTED_MACHINED_COLLARS'),dummy=new THREE.Object3D();
 positions.forEach((y,index)=>{dummy.position.set(0,y,0);dummy.rotation.set(Math.PI/2,0,0);dummy.updateMatrix();value.setMatrixAt(index,dummy.matrix);});
 value.instanceMatrix.needsUpdate=true;value.computeBoundingBox();value.computeBoundingSphere();node.add(value);return 1;
}
function ballPebbling(THREE,node,root){
 const radius=node.geometry?.parameters?.radius;if(!(radius>.01))return 0;
 const material=surfaceMaterial(THREE,node),count=96,geometry=new THREE.CircleGeometry(Math.min(.0024,radius*.009),5),pebbles=mark(new THREE.InstancedMesh(geometry,material,count),root,'CRAFTED_BALL_PEBBLED_GRIP'),dummy=new THREE.Object3D(),axis=new THREE.Vector3(0,0,1);
 for(let i=0;i<count;i++){
  const y=1-(i+.5)/count*2,angle=i*2.39996323,normal=new THREE.Vector3(Math.sqrt(1-y*y)*Math.cos(angle),y,Math.sqrt(1-y*y)*Math.sin(angle));
  dummy.position.copy(normal).multiplyScalar(radius+.00035);dummy.quaternion.setFromUnitVectors(axis,normal);dummy.updateMatrix();pebbles.setMatrixAt(i,dummy.matrix);
 }
 pebbles.instanceMatrix.needsUpdate=true;pebbles.computeBoundingBox();pebbles.computeBoundingSphere();node.add(pebbles);return 1;
}
function garmentStitching(THREE,root,nodes){
 let count=0;
 for(const node of nodes.filter(node=>node.name==='Jersey_Side')){
  const local=localBounds(THREE,node);if(!local)continue;
  const {size:[w,h],center:[cx,cy,cz]}=local,parts=[];
  for(let i=0;i<10;i++)for(const x of [-w*.45,w*.45])parts.push({size:[.0015,h*.028,.0006],position:[cx+x,cy-h*.42+i*h*.084,cz+.0005]});
  count+=batch(THREE,node,root,parts,surfaceMaterial(THREE,node,true),'CRAFTED_JERSEY_FRENCH_SEAMS');
 }
 return count;
}
function candidateScore(node,family){
 const name=node.name||'',p=node.geometry?.parameters||{};
 if(family==='devices')return /CABINET_BODY/.test(name)?100:/PROJECTOR|TABLE_SUPPORT|PLINTH/.test(name)?80:/TABLE_RAIL/.test(name)?70:/CONTROL_DECK/.test(name)?20:1;
 if(family==='fitness')return /PAD|PADDING|BENCH_CUSHION|BACKREST|SEAT|BAG|MAT|HANDLE|GRIP|FOAM/.test(name)?100:/LOCKER_BODY|COUNTER|FRAME|POST|SUPPORT|FOOT|PLATFORM/.test(name)?60:1;
 if(family==='hockey')return /HOCKEY_TORSO|HOCKEY_ARM/.test(name)?100:boxPart(node)&&Math.max(p.width,p.height,p.depth)>.3?80:1;
 if(family==='basketball')return /PADDED_BASE|PADDED_STANCHION|PADDING/.test(name)?100:1;
 return /TRAIN|COASTER|BENCH|SAFETY|BOARDING/.test(name)?100:boxPart(node)?50:1;
}

export function finishDeviceDesign(THREE,root,id){
 if(!root||!supportsDeviceDesign(id)||root.userData.deviceDesignFinish===DEVICE_DESIGN_VERSION)return root;
 const nodes=[];root.traverse(node=>{if(node.isMesh&&!protectedPart(node,root))nodes.push(node);});
 const family=INTERACTIVE_DEVICES[id]||id==='prison-radio'?'devices':FITNESS_ITEMS[id]?'fitness':hockey.has(id)?'hockey':basketball.has(id)?'basketball':'arcade';
 let added=0;
 if(id.startsWith('basketball-jersey-'))added=garmentStitching(THREE,root,nodes);
 else if(id==='basketball'||id==='arcade-part-basketball-ball'||id==='arcade-part-billiard-balls'){
  for(const node of nodes.filter(node=>node.geometry?.type==='SphereGeometry').slice(0,id.endsWith('billiard-balls')?2:1))added+=ballPebbling(THREE,node,root);
 }else if(id==='hockey-stick'||id==='arcade-part-billiard-cue'){
  const shaft=nodes.filter(boxPart).sort((a,b)=>{const p=a.geometry.parameters,q=b.geometry.parameters;return Math.max(q.width,q.height,q.depth)-Math.max(p.width,p.height,p.depth);})[0];
  if(shaft)added+=shaftBindings(THREE,shaft,root,true);
  else for(const node of nodes.slice(0,1))added+=cylinderCollars(THREE,node,root,true);
 }else{
  const sorted=[...nodes].sort((a,b)=>candidateScore(b,family)-candidateScore(a,family)),limit=family==='devices'?3:family==='hockey'?2:3;
  const selected=[];
  for(const node of sorted){
   if(selected.length>=limit)break;
   if(boxPart(node)){
    const local=localBounds(THREE,node);if(!local)continue;
    const [w,h,d]=local.size;if(Math.min(w,h,d)<.003||Math.max(w,h,d)<.04)continue;
    const name=node.name||'',cloth=family==='hockey'&&/HOCKEY_TORSO|HOCKEY_ARM/.test(name)||family==='fitness'&&/PAD|BAG|MAT|SEAT|BENCH_CUSHION|BACKREST/.test(name)||family==='basketball'&&/PADDING|PADDED/.test(name);
    const floor=node.userData.walkableFloor||node.userData.sportsSurface||h<Math.min(w,d)*.2;
    // Do not add a service plate to a narrow structural post: grip bindings and
    // fitted rails communicate its manufacture at the scale of the part.
    if(!cloth&&!floor&&Math.max(w,h,d)>Math.min(w,h,d)*5)added+=shaftBindings(THREE,node,root);
    else added+=hardwarePlate(THREE,node,root,{cloth,floor,top:floor||h<Math.min(w,d)*.4});
    selected.push(node);
   }
  }
  if(!added)for(const node of sorted){if(cylinderCollars(THREE,node,root,family==='fitness')){added++;break;}}
  if(!added)for(const node of sorted){if(ballPebbling(THREE,node,root)){added++;break;}}
 }
 // Record only a finish which contributed visible geometry. The caller can
 // audit unsupported/empty recipes rather than treating a stamp as artwork.
 if(added){root.userData.deviceDesignFinish=DEVICE_DESIGN_VERSION;root.userData.deviceDesignDetails=added;}
 return root;
}
