import {finishGameItem} from './game-item-finish.js';
import {finishNativeSurfaces} from './native-surface-finish.js';
import {NATIVE_DESIGN_VERSION} from './native-design-profile.js';
import {createBuildingBlock} from './building-materials.js';

const ranged=['laser','pulse-rifle','rail-cannon','pulse-pistol','twin-blaster','heavy-bolt','scatter-shot','marksman','arc-carbine'];
const utility=['medkit','shield-kit','scanner','repair-tool','recycler','supply-kit','beacon'];
export const HELD_TOOL_DESIGN_IDS=Object.freeze([...ranged,...utility,'bat','spray','brick','flamethrower','taser','toxin','dynamite','jetpack']);
const supported=new Set(HELD_TOOL_DESIGN_IDS);
const colors={laser:0xff4661,'pulse-rifle':0x43d8ff,'rail-cannon':0xc66bff,'pulse-pistol':0xf3eb69,'twin-blaster':0xff7adf,'heavy-bolt':0xff8654,'scatter-shot':0xffb743,marksman:0x7affac,'arc-carbine':0x65a4ff,medkit:0x72ffc0,'shield-kit':0xff72d5,scanner:0x69d8ff,'repair-tool':0xffd06b,recycler:0xbcff65,'supply-kit':0xff9671,beacon:0xd79aff,spray:0xe3a6d7,jetpack:0x76ccca};

/** Finish physical gear without changing its grip pose, muzzle or action rules. */
export function finishHeldToolDesign(T,root,id){
 if(!root||!supported.has(id)||root.userData.heldToolDesign?.version===NATIVE_DESIGN_VERSION)return root;
 finishGameItem(T,root);root.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(root,true),parts=[];
 root.traverse(n=>{if(n.isMesh&&!n.userData.nativeDesignDetail&&!n.material?.transparent)parts.push(n);});
 let details=0;
 const first=parts[0],depthTest=first?.material?.depthTest??true;
 const steel=new T.MeshStandardMaterial({name:'HELD_TOOL_ALLOY_FASTENER',color:0xb3c5ca,roughness:.32,metalness:.78,depthTest});
 function attach(parent,node,name){
  node.name=name;node.userData={nativeDesignDetail:true,heldToolDetail:true,collisionDisabled:true,collider:false};node.castShadow=false;node.receiveShadow=true;node.renderOrder=parent.renderOrder||root.renderOrder;
  parent.add(node);root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(node,true);
  if(['x','y','z'].some(a=>box.min[a]<bounds.min[a]-.00001||box.max[a]>bounds.max[a]+.00001)){node.removeFromParent();node.geometry.dispose();return false;}
  details++;return true;
 }
 // Recessed corner hardware follows the actual casing, never a muzzle, screen,
 // animated probe or mounted attachment. It stays inside the authored footprint.
 for(const node of parts){
  if(details>=2)break;
  const p=node.geometry?.parameters;if(!p||![p.width,p.height,p.depth].every(v=>Number.isFinite(v)&&v>.045)||/SCREEN|DISPLAY|MUZZLE|PROBE/i.test(node.name))continue;
  const w=p.width,h=p.height,d=p.depth,r=Math.min(w,h)*.035;
  const hardware=new T.InstancedMesh(new T.SphereGeometry(r,6,4),steel,4),matrix=new T.Matrix4();
  let index=0;for(const x of [-w*.34,w*.34])for(const y of [-h*.32,h*.32])hardware.setMatrixAt(index++,matrix.makeTranslation(x,y,-d/2+r*.25));
  hardware.computeBoundingBox();hardware.computeBoundingSphere();attach(node,hardware,'CRAFTED_HELD_TOOL_CASE_FASTENERS');
 }
 // A grip's fine ferrules provide readable craft detail on cylindrical tools.
 if(details<2){
  const grip=parts.find(node=>node.geometry?.parameters?.radiusTop&&node.geometry.parameters.height>.12&&node.geometry.parameters.radiusTop>.025);
  if(grip){const p=grip.geometry.parameters,r=Math.min(p.radiusTop,p.radiusBottom)*.94;
   // Use the grip's local cylinder plane so animation/rotation is retained.
   for(const y of [-p.height*.28,p.height*.28]){const ring=new T.Mesh(new T.TorusGeometry(r,r*.025,5,24),steel);ring.rotation.x=Math.PI/2;ring.position.y=y;attach(grip,ring,'CRAFTED_TOOL_GRIP_FERRULE');}
  }
 }
 finishNativeSurfaces(T,root,'tool:'+id);
 root.userData.heldToolDesign={version:NATIVE_DESIGN_VERSION,id,details};root.userData.toolId=id;
 return root;
}

/** Physical prototypes also supply catalog/export previews of every tool SKU. */
export function createHeldToolModel(T,id,settings={}){
 if(!supported.has(id))return null;
 if(id==='brick')return finishHeldToolDesign(T,createBuildingBlock(T,'studs',{width:1.2,height:.4,depth:.6}),'brick');
 const root=new T.Group();root.name='MUZIKAZ_HELD_'+id.toUpperCase().replaceAll('-','_');
 const mat=(color,roughness=.5,metalness=.15,extra={})=>new T.MeshStandardMaterial({color,roughness,metalness,...extra});
 const alloy=mat(0x344a58,.35,.72),rubber=mat(0x19272d,.88,0),steel=mat(0xacbec4,.3,.8),paint=mat(settings.color??colors[id]??0xcf8250,.52,.2),accent=mat(settings.color??colors[id]??0xe6ad71,.33,.25,{emissive:settings.color??colors[id]??0x684024,emissiveIntensity:.32});
 const add=(name,g,m,pos=[0,0,0],rot=[0,0,0])=>{const n=new T.Mesh(g,m);n.name=name;n.position.set(...pos);n.rotation.set(...rot);root.add(n);return n;};
 const box=(name,size,m,pos,rot)=>add(name,new T.BoxGeometry(...size),m,pos,rot);
 const cylinder=(name,r,h,m,pos,rot)=>add(name,new T.CylinderGeometry(r,r,h,16),m,pos,rot);
 const ring=(name,r,t,m,pos,rot)=>add(name,new T.TorusGeometry(r,t,6,32),m,pos,rot);
 if(ranged.includes(id)||['spray','taser','toxin','flamethrower'].includes(id)){
  const long=['rail-cannon','marksman','heavy-bolt'].includes(id),small=id==='pulse-pistol'||id==='taser',length=long?.7:small?.34:.48;
  box('TOOL_COATED_RECEIVER',[small?.17:.23,.19,length],alloy,[0,0,0]);
  box('TOOL_WRAPPED_GRIP',[.13,.27,.16],rubber,[0,-.18,.10],[-.18,0,0]);
  for(let i=0;i<4;i++)box('TOOL_GRIP_TREAD',[.132,.009,.165],alloy,[0,-.12-i*.045,.1],[-.18,0,0]);
  box('TOOL_UPPER_RAIL',[.09,.045,length*.78],steel,[0,.12,-.015]);
  const barrels=id==='twin-blaster'||id==='scatter-shot'?[-.065,.065]:[0];
  for(const x of barrels){cylinder('TOOL_BARREL_SHROUD',long?.047:.037,length*.6,alloy,[x,.015,-length*.65],[Math.PI/2,0,0]);ring('TOOL_MUZZLE_COLLAR',long?.048:.039,.007,steel,[x,.015,-length*.95],[0,0,0]);}
  for(const x of [-.122,.122])box('TOOL_REACTOR_INLAY',[.012,.055,length*.45],accent,[x,.025,0]);
  if(id==='marksman'||id==='rail-cannon'){cylinder('TOOL_OPTIC_TUBE',.045,.21,rubber,[0,.19,-.015],[Math.PI/2,0,0]);add('TOOL_OPTIC_LENS',new T.CircleGeometry(.038,20),accent,[0,.19,-.121]);}
  if(['spray','toxin','flamethrower'].includes(id)){const tankMat=id==='toxin'?mat(0x75ff25,.24,.08,{emissive:0x287c13,emissiveIntensity:.6,transparent:true,opacity:.86}):paint;cylinder('TOOL_SUPPLY_RESERVOIR',.105,.32,tankMat,[.19,.025,.04]);for(const y of [-.1,.15])ring('TOOL_TANK_BRACKET',.108,.012,steel,[.19,y,.04],[Math.PI/2,0,0]);}
  const muzzle=new T.Object3D();muzzle.name='HELD_TOOL_MUZZLE';muzzle.position.set(0,.015,-length*.95);root.add(muzzle);
 }else if(utility.includes(id)){
  if(id==='repair-tool'){
   cylinder('REPAIR_HAMMER_SHAFT',.028,.46,rubber,[0,-.1,0]);box('REPAIR_HAMMER_HEAD',[.3,.14,.15],steel,[0,.18,0]);box('REPAIR_HAMMER_FACE',[.025,.15,.16],paint,[.16,.18,0]);
  }else if(id==='beacon'){
   cylinder('BEACON_BASE',.13,.08,alloy,[0,-.16,0]);cylinder('BEACON_BODY',.08,.3,paint,[0,.025,0]);add('BEACON_SIGNAL_CRYSTAL',new T.OctahedronGeometry(.105),accent,[0,.23,0]);ring('BEACON_CRYSTAL_CAGE',.11,.008,steel,[0,.23,0],[Math.PI/2,0,0]);
  }else if(id==='scanner'){
   box('SCANNER_CASE',[.29,.36,.08],alloy,[0,0,0]);box('SCANNER_SCREEN',[.23,.25,.009],mat(0x244d5b,.35,.2,{emissive:0x1b404a,emissiveIntensity:.45}),[0,.025,-.047]);ring('SCANNER_RADAR_GRATICULE',.085,.004,accent,[0,.035,-.054],[0,0,0]);for(const x of [-.08,0,.08])box('SCANNER_BUTTON',[.035,.015,.008],rubber,[x,-.145,-.049]);
  }else{
   const shield=id==='shield-kit';box('FIELD_KIT_CASE',[.34,.25,.16],alloy,[0,0,0]);box('FIELD_KIT_FRONT',[.29,.19,.02],paint,[0,0,-.09]);box('FIELD_KIT_HANDLE',[.17,.035,.065],rubber,[0,.15,0]);
   for(const x of [-.11,.11])box('FIELD_KIT_LATCH',[.035,.075,.025],steel,[x,.065,-.11]);
   if(id==='medkit'){box('MEDICAL_CROSS_BAR',[.13,.035,.012],steel,[0,0,-.106]);box('MEDICAL_CROSS_STEM',[.035,.13,.012],steel,[0,0,-.106]);}
   else if(shield)ring('SHIELD_EMITTER',.066,.009,accent,[0,0,-.108],[0,0,0]);
   else for(let i=0;i<3;i++)box('FIELD_KIT_STATUS_INLAY',[.1-i*.018,.008,.01],accent,[0,.035-i*.03,-.107]);
  }
 }else if(id==='jetpack'){
  box('JETPACK_CENTRAL_CASING',[.27,.39,.16],alloy,[0,0,0]);
  for(const x of [-.19,.19]){cylinder('JETPACK_FUEL_TANK',.09,.39,paint,[x,0,0]);cylinder('JETPACK_THRUSTER',.07,.11,steel,[x,-.25,0]);ring('JETPACK_THRUSTER_LIP',.07,.008,rubber,[x,-.3,0],[Math.PI/2,0,0]);box('JETPACK_CHEST_STRAP',[.04,.34,.04],rubber,[x*.6,0,-.11]);}
  for(let i=0;i<3;i++)box('JETPACK_COOLING_FIN',[.22,.017,.025],steel,[0,.09-i*.07,.095]);
 }else if(id==='bat'){
  const points=[[0,-.52],[.055,-.5],[.04,-.4],[.034,-.13],[.08,.18],[.095,.47],[.02,.55]].map(p=>new T.Vector2(...p));add('CRAFTED_WALNUT_BAT',new T.LatheGeometry(points,24),mat(0xa96e40,.66),[0,0,0]);cylinder('BAT_WRAPPED_GRIP',.043,.24,rubber,[0,-.34,0]);
 }else if(id==='dynamite'){
  cylinder('DYNAMITE_PAPER_SLEEVE',.105,.48,mat(0xc94440,.78),[0,0,0],[0,0,Math.PI/2]);for(const x of [-.13,.13])ring('DYNAMITE_STRAP',.106,.013,rubber,[x,0,0],[0,Math.PI/2,0]);cylinder('DYNAMITE_WOVEN_FUSE',.009,.18,rubber,[.28,.06,0],[0,0,-.55]);
 }
 return finishHeldToolDesign(T,root,id);
}
