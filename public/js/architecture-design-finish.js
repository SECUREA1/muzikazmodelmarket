import {ENTERABLE_BUILDINGS} from './building-districts.js';
import {LAYOUT_SCENES} from './builder-layout-scenes.js';
import {RESORT_PRODUCTS} from './resort-products.js';

export const ARCHITECTURE_DESIGN_VERSION='crafted-architecture-v1';
const interiors=new Set(['studio-desk','recording-booth','modular-wall','glass-door','loft-bed','wardrobe','bathroom-vanity','dining-set','fireplace','elevator']);
const rooms=new Set(['grand-floor','open-studio','connected-suite','garden-courtyard','estate-house','estate-yard','drive-in-garage','open-office']);
const crafted=new Set(['timber-cabin','stone-tower','market-stall','sci-fi-bunker']);
export const ARCHITECTURE_DESIGN_IDS=Object.freeze([...new Set([...Object.keys(ENTERABLE_BUILDINGS),...Object.keys(LAYOUT_SCENES),...Object.keys(RESORT_PRODUCTS),...interiors,...rooms,...crafted])]);
const supported=new Set(ARCHITECTURE_DESIGN_IDS);
export function supportsArchitectureDesign(id){return supported.has(id);}

// Details remain attached to their original surfaces: cutaway roofs and movable
// furniture retain their existing parents, origins, collision and media feeds.
export function finishArchitectureDesign(T,root,id){
 if(!root||!supportsArchitectureDesign(id)||root.userData.architectureDesign===ARCHITECTURE_DESIGN_VERSION)return root;
 const candidates=[];
 root.traverse(node=>{
  if(!node.isMesh||node.isInstancedMesh||node.userData.nativeDesignDetail||node.userData.collisionOnly||node.userData.mediaScreen||node.userData.mediaFace!==undefined||node.visible===false)return;
  if(/SCREEN|DISPLAY|VIDEO|FEED|COLLIDER|COLLISION|NAVMESH/i.test(node.name||''))return;
  const p=node.geometry?.parameters;
  if(!p||![p.width,p.height,p.depth].every(value=>Number.isFinite(value)&&value>0))return;
  candidates.push({node,w:p.width,h:p.height,d:p.depth});
 });
 const maxDetails=40,materials=new Map();let count=0;
 const surfaceMaterial=(node,tone=.72,metalness=null)=>{
  const source=[].concat(node.material||[]).find(value=>value?.color),color=source?.color?.clone()||new T.Color(0x50616a);
  color.multiplyScalar(tone);
  const metal=metalness===null?Math.min(.65,source?.metalness||.08):metalness,key=color.getHex()+':'+metal;
  if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,roughness:metal>.3?.38:.76,metalness:metal}));
  return materials.get(key);
 };
 const add=(parent,name,size,position,material,rotation=[0,0,0])=>{
  if(count>=maxDetails||size.some(value=>!Number.isFinite(value)||value<=0))return null;
  const mesh=new T.Mesh(new T.BoxGeometry(...size),material);mesh.name='CRAFTED_ARCHITECTURE_'+name;
  mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.castShadow=false;mesh.receiveShadow=true;
  mesh.userData={nativeDesignDetail:true,collisionDisabled:true,builderRoot:root};parent.add(mesh);count++;return mesh;
 };
 // An inset frame is contained within the source face. The 0.001 m offset is
 // only a depth-fighting allowance, not a replacement collision surface.
 function frame(item,{face=-1,weight=.025,tone=.72}={}){
  const {node,w,h,d}=item,b=Math.min(weight,w*.08,h*.08),z=face*(d/2+.0006),mat=surfaceMaterial(node,tone);
  for(const side of [-1,1])add(node,'INSET_STILE',[b,Math.max(.002,h-b*2),.0012],[side*(w/2-b*1.35),0,z],mat);
  for(const side of [-1,1])add(node,'INSET_RAIL',[Math.max(.002,w-b*2),b,.0012],[0,side*(h/2-b*1.35),z],mat);
 }
 function horizontalFace(item,{axis='y',lines=3,tone=.83}={}){
  const {node,w,h,d}=item,mat=surfaceMaterial(node,tone),amount=Math.min(lines,6);
  if(axis==='y')for(let i=1;i<=amount;i++){
   const x=-w/2+w*i/(amount+1);add(node,'FITTED_TOP_JOINT',[Math.min(.008,w*.004),.0012,d*.88],[x,h/2+.0006,0],mat);
  }
  else for(let i=1;i<=amount;i++)add(node,'FITTED_FRONT_JOINT',[w*.87,Math.min(.008,h*.008),.0012],[0,-h/2+h*i/(amount+1),-d/2-.0006],mat);
 }
 function cabinet(item,doors=2){
  const {node,w,h,d}=item,mat=surfaceMaterial(node,.63),metal=surfaceMaterial(node,1.18,.58),n=Math.min(doors,4);
  const width=w/n;
  for(let i=0;i<n;i++){
   const x=-w/2+width*(i+.5);
   // Front reveals and handles sit within the original cabinet volume.
   add(node,'CABINET_REVEAL',[.006,h*.82,.0012],[x-width/2+.018,0,-d/2-.0006],mat);
   add(node,'RECESSED_DRAWER_PULL',[Math.min(.16,width*.3),.018,.009],[x,h*.23,-d/2+.004],metal);
  }
  add(node,'CABINET_BOTTOM_REVEAL',[w*.94,.009,.0012],[0,-h*.38,-d/2-.0006],mat);
 }
 function wallMolding(item){
  const {node,w,h,d}=item,thinX=w<d,span=thinX?d:w,thickness=Math.min(w,d),mat=surfaceMaterial(node,.75);
  const band=Math.min(.075,h*.035),edge=thickness/2+.0006;
  for(const level of [-h*.43,h*.43]){
   if(thinX)add(node,'WALL_DADO',[.0012,band,span*.96],[-edge,level,0],mat);
   else add(node,'WALL_DADO',[span*.96,band,.0012],[0,level,-edge],mat);
  }
 }
 function acoustic(item){
  const {node,w,h,d}=item,thinX=w<d,span=thinX?d:w,mat=surfaceMaterial(node,.77),thickness=Math.min(w,d);
  for(let i=0;i<4;i++){
   const offset=-span*.35+i*span*.23;
   if(thinX)add(node,'ACOUSTIC_FLUTE',[.006,h*.72,Math.min(.055,span*.04)],[Math.sign(node.position.x||1)*(-thickness/2+.003),0,offset],mat);
   else add(node,'ACOUSTIC_FLUTE',[Math.min(.055,span*.04),h*.72,.006],[offset,0,-d/2+.003],mat);
  }
 }
 function resort(){
  const upholstered=candidates.filter(({node,w,h})=>/CUSHION|BACK|PADDED_ARM/i.test(node.name)&&w>.2&&h>.1);
  for(const item of upholstered.slice(0,4))frame(item,{weight:.008,tone:.85});
  const cabinets=candidates.filter(({node})=>/CABINET_BODY|CABINET$|WALNUT_SKI_RACK/.test(node.name));
  for(const item of cabinets.slice(0,2))cabinet(item,Math.max(2,Math.round(item.w/.8)));
  const stone=candidates.find(({node})=>/STONE_TOP|MARBLE_MANTEL|STONE_COUNTER/.test(node.name));
  if(stone)horizontalFace(stone,{lines:2,tone:.95});
  const frames=candidates.filter(({node,w,h})=>/FRAME|KIOSK/.test(node.name)&&w>.2&&h>.2);
  for(const item of frames.slice(0,1))frame(item,{weight:.014,tone:1.12});
  if(RESORT_PRODUCTS[id].shape==='planter'){
   let pot;root.traverse(node=>{if(!pot&&node.isMesh&&node.geometry?.type==='CylinderGeometry'&&node.geometry.parameters.radiusTop>.4)pot=node;});
   if(pot){const p=pot.geometry.parameters,mat=surfaceMaterial(pot,.7,.65);
    for(const fraction of [.16,.84]){
     const r=p.radiusBottom+(p.radiusTop-p.radiusBottom)*fraction-.007;
     const mesh=new T.Mesh(new T.TorusGeometry(r,.007,6,40),mat);mesh.name='CRAFTED_ARCHITECTURE_PLANTER_INLAY';mesh.position.y=(fraction-.5)*p.height;mesh.rotation.x=Math.PI/2;
     mesh.userData={nativeDesignDetail:true,collisionDisabled:true,builderRoot:root};mesh.receiveShadow=true;pot.add(mesh);count++;
    }
   }
  }
 }
 if(interiors.has(id)){
  if(id==='studio-desk'){
   const monitor=candidates.find(item=>Math.abs(item.w-.85)<.02&&item.h>.4);if(monitor)frame(monitor,{weight:.025,tone:1.6});
   for(const item of candidates.filter(item=>Math.abs(item.w-.42)<.02&&item.h>.5)){
    frame(item,{weight:.018,tone:1.22});horizontalFace(item,{axis:'z',lines:4,tone:.55});
   }
   const desk=candidates.find(item=>item.w>2&&item.h<.2);if(desk)horizontalFace(desk,{lines:2,tone:.87});
   const keys=candidates.find(item=>item.w>1&&item.w<1.1&&item.h<.1);if(keys){const m=surfaceMaterial(keys.node,.42);for(let i=0;i<8;i++)add(keys.node,'MIXER_CHANNEL',[.025,.003,.16],[-.42+i*.12,keys.h/2+.0006,0],m);}
  }else if(id==='recording-booth'){
   for(const item of candidates.filter(item=>item.h>2&&Math.min(item.w,item.d)<.2).slice(0,3))acoustic(item);
   const glass=candidates.find(item=>[].concat(item.node.material||[]).some(mat=>mat.transparent)&&item.h>1);if(glass)frame(glass,{weight:.028,tone:.55});
  }else if(id==='modular-wall'){
   const panel=candidates.find(item=>item.w>3);if(panel){frame(panel,{weight:.035,tone:.83});horizontalFace(panel,{axis:'z',lines:2,tone:.94});}
   for(const item of candidates.filter(item=>item.w<.2&&item.h>2).slice(0,4))frame(item,{weight:.008,tone:.72});
  }else if(id==='glass-door'){
   const glass=candidates.find(item=>item.w>1&&item.h>2);if(glass){frame(glass,{weight:.028,tone:.63});const m=surfaceMaterial(glass.node,.58,.68);add(glass.node,'DOOR_KICK_PLATE',[glass.w*.85,.12,.0012],[0,-glass.h*.4,-glass.d/2-.0006],m);for(const y of [-.65,.65])add(glass.node,'DOOR_HINGE',[.035,.11,.0012],[-glass.w*.4,y,-glass.d/2-.0006],m);}
  }else if(id==='loft-bed'){
   const mattress=candidates.find(item=>item.w>1.9&&item.h>.2&&item.h<.3);if(mattress){frame(mattress,{weight:.012,tone:.85});horizontalFace(mattress,{lines:1,tone:.94});}
   for(const item of candidates.filter(item=>item.h>1&&item.w<.2)){const m=surfaceMaterial(item.node,.67);for(const y of [-item.h*.4,item.h*.4])add(item.node,'BED_POST_COLLAR',[item.w*.99,.025,item.d*.99],[0,y,0],m);}
  }else if(id==='wardrobe'){
   const back=candidates.find(item=>item.w>2&&item.h>2);if(back){frame(back,{weight:.028,tone:.8});horizontalFace(back,{axis:'z',lines:3,tone:.91});}
   for(const item of candidates.filter(item=>item.w>.9&&item.w<1&&item.h<.1))cabinet(item,1);
  }else if(id==='bathroom-vanity'){
   const body=candidates.find(item=>item.w>1.5&&item.h>.7&&item.h<.8);if(body)cabinet(body,3);
   const mirror=candidates.find(item=>item.w>1.2&&item.h>1);if(mirror)frame(mirror,{weight:.021,tone:.65});
  }else if(id==='dining-set'){
   const table=candidates.find(item=>item.w>1.8&&item.h<.2);if(table)horizontalFace(table,{lines:3,tone:.86});
   for(const item of candidates.filter(item=>item.w<.6&&item.h>.5))frame(item,{weight:.009,tone:.83});
  }else if(id==='fireplace'){
   const opening=candidates.find(item=>item.w>1.2&&item.w<1.3&&item.h>.8);if(opening)frame(opening,{weight:.025,tone:1.35});
   const body=candidates.find(item=>item.w>2&&item.h>2);if(body)horizontalFace(body,{axis:'z',lines:5,tone:.9});
   const mantel=candidates.find(item=>item.w>2&&item.h<.2);if(mantel)horizontalFace(mantel,{lines:2,tone:.87});
   // The original fire uses green shared accent material. Isolate its surface
   // before giving only the flame geometry a natural amber emissive finish.
   let flameIndex=0;root.traverse(node=>{if(node.isMesh&&node.geometry?.type==='ConeGeometry'){
    const material=node.material.clone();material.color.setHex(flameIndex++%2?0xff9a42:0xffc77b);material.emissive?.setHex(0xf47e22);material.emissiveIntensity=.8;node.material=material;
   }});
  }else if(id==='elevator'){
   for(const item of candidates.filter(item=>item.h>2.5&&item.w>1&&item.w<1.1))frame(item,{weight:.012,tone:.82});
   const control=candidates.find(item=>item.w>.25&&item.w<.3&&item.h<.4);if(control){frame(control,{weight:.012,tone:.5});const m=surfaceMaterial(control.node,.48,.5);for(const y of [-.075,.075])add(control.node,'LIFT_CALL_BUTTON',[.075,.045,.0012],[0,y,-control.d/2-.0006],m);}
  }
 }else if(RESORT_PRODUCTS[id])resort();
 else {
  // Apply trim to individual wall spans, never across a doorway or entrance.
  // The hedge-maze keeps organic walls; its treatment belongs on the paving.
  const organic=id==='scene-hedge-maze'||id==='estate-yard'||id==='garden-courtyard';
  if(!organic){const walls=candidates.filter(item=>item.h>1.7&&Math.min(item.w,item.d)<.5&&Math.max(item.w,item.d)>1).sort((a,b)=>b.w*b.h*b.d-a.w*a.h*a.d);
   for(const item of walls.slice(0,5))wallMolding(item);
  }
  const glass=candidates.filter(item=>/WINDOW|GLAZ/i.test(item.node.name)&&item.w>.2&&item.h>.2);
  for(const item of glass.slice(0,3))frame(item,{weight:.025,tone:.55});
  const roofs=candidates.filter(item=>/ROOF|COUNTER_TOP/i.test(item.node.name)&&item.w>1&&item.h<.5);
  for(const item of roofs.slice(0,2))horizontalFace(item,{lines:4,tone:.85});
  const signs=candidates.filter(item=>/BUILDING_SIGN/i.test(item.node.name));
  for(const item of signs.slice(0,1))frame(item,{weight:.027,tone:.67});
  const floors=candidates.filter(item=>item.w>2&&item.d>2&&item.h<.4&&!/ROOF/i.test(item.node.name)).sort((a,b)=>b.w*b.d-a.w*a.d);
  const floor=floors[0];if(floor){const mat=surfaceMaterial(floor.node,.83),w=floor.w,d=floor.d,h=floor.h;
   for(const x of [-w*.465,w*.465])add(floor.node,'FLOOR_BORDER',[Math.min(.045,w*.007),.0012,d*.93],[x,h/2+.0006,0],mat);
   for(const z of [-d*.465,d*.465])add(floor.node,'FLOOR_BORDER',[w*.93,.0012,Math.min(.045,d*.007)],[0,h/2+.0006,z],mat);
  }
  const counters=candidates.filter(item=>/BUILDING_COUNTER|workbench/.test(item.node.name));for(const item of counters.slice(0,2))cabinet(item,3);
 }
 // Some scene templates contain named custom surfaces rather than a complete
 // building shell. Add restrained joinery to the two largest useful panels so
 // every supported architecture item receives a visible geometric treatment.
 if(count===0){
  const suitable=candidates.filter(item=>item.w>.2&&item.h>.08&&item.d>.02).sort((a,b)=>b.w*b.h*b.d-a.w*a.h*a.d);
  for(const item of suitable.slice(0,2)){
   if(item.h<Math.max(item.w,item.d)*.4)horizontalFace(item,{lines:3,tone:.84});else frame(item,{weight:.018,tone:.8});
  }
 }
 root.userData.architectureDesign=ARCHITECTURE_DESIGN_VERSION;
 root.userData.architectureDesignDetails=count;
 return root;
}
