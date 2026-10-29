import {finishVehicleDesign} from './vehicle-design-system.js';
import * as THREE from '../vendor/three/three.module.min.js';
import {bevelledBoxGeometry,finishGameItem} from './game-item-finish.js';

// Authored equipment replaces the starter recipes while retaining native IDs.
export const EQUIPMENT_PROP_MODEL_INFO=Object.freeze({
 'plasma-sword':['Plasma Sword','A forged alloy hilt with wrapped grip, cyan reactor and a tapered luminous plasma blade.',[.25,1.4,.12]],
 'battle-axe':['Battle Axe','A curved forged steel axe head with an inset cutting edge, brass rivets and a leather-wrapped haft.',[.8,1.5,.16]],
 'arc-bow':['Arc Bow','A recurved timber bow with alloy limb tips, tensioned string and luminous aiming inlays.',[.9,1.3,.12]],
 'crystal-staff':['Crystal Staff','A brass-bound carved staff with a faceted amethyst held in an open three-prong crown.',[.3,1.8,.3]],
 'wooden-cart':['Wooden Cart','A board-built handcart with iron tyres, open spoked wheels, cross-braced sides and fitted pull shafts.',[2.4,1.5,1.2]],
 'iron-anvil':['Iron Anvil','A forged anvil with a tapered horn, hardened working face, hardy hole and bolted timber pedestal.',[.9,.8,.45]],
 'street-sign':['Weathered Signpost','A cedar wayfinding post with carved arrow boards, iron brackets, brass nails and a warm lantern.',[1.2,2.4,.5]],
 'windmill':['Working Windmill','A tapered masonry mill with timber balcony, braced canvas sails and a driven iron rotor.',[4,6,2.5]]
});
const settings={
 'plasma-sword':['weapons','interior','pickup','#63eaff'],
 'battle-axe':['weapons','interior','pickup','#a9b2b6'],
 'arc-bow':['weapons','interior','pickup','#b98246'],
 'crystal-staff':['weapons','interior','pickup','#a78bfa'],
 'wooden-cart':['props','interior','decor','#80522f'],
 'iron-anvil':['props','interior','interact','#4b5960'],
 'street-sign':['props','interior','talk','#795238'],
 windmill:['interactive','interactive','interact','#d8c49d']
};
export const EQUIPMENT_PROP_ITEMS=Object.freeze(Object.entries(EQUIPMENT_PROP_MODEL_INFO).map(([id,[name,description,dimensions]])=>{
 const [category,type,behavior,color]=settings[id];
 return Object.freeze({id,buildAssetId:id,name,description,dimensions,category,type,behavior,color,procedural:true,assetKind:'premade',size:74,
  image:`public/images/native-upgrades/${id}.svg`,animation:'crafted-idle',
  function_data:{behavior,prompt:behavior==='pickup'?'Collect '+name:behavior==='talk'?'Read signpost':behavior==='interact'?'Use '+name:name}});
}));

const material=(color,roughness=.55,metalness=.08,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
const glow=(color,intensity=1)=>material(color,.23,.25,{emissive:color,emissiveIntensity:intensity});
function add(root,geometry,mat,position=[0,0,0],rotation=[0,0,0],name=''){
 const part=new THREE.Mesh(geometry,mat);part.name=name;part.position.set(...position);part.rotation.set(...rotation);root.add(part);return part;
}
const block=(root,size,mat,pos,rot=[0,0,0],name='')=>add(root,bevelledBoxGeometry(THREE,...size,.025),mat,pos,rot,name);
const cylinder=(root,r1,r2,h,mat,pos,rot=[0,0,0],segments=16,name='')=>add(root,new THREE.CylinderGeometry(r1,r2,h,segments),mat,pos,rot,name);
const ring=(root,r,t,mat,pos,rot=[Math.PI/2,0,0],name='')=>add(root,new THREE.TorusGeometry(r,t,8,32),mat,pos,rot,name);
function pulse(part,base=1,phase=0){part.userData.equipmentPulse={base,phase};return part;}
function line(root,points,r,mat,name=''){
 return add(root,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point))),32,r,6),mat,[0,0,0],[0,0,0],name);
}
function silhouette(root,points,depth,mat,pos=[0,0,0],name=''){
 const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
 const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.006,bevelThickness:.004,bevelSegments:2});geo.translate(0,0,-depth/2);
 return add(root,geo,mat,pos,[0,0,0],name);
}
function rivet(root,pos,mat,r=.017){return add(root,new THREE.SphereGeometry(r,8,6),mat,pos,[0,0,0],'FORGED_RIVET');}

function sword(root){
 const steel=material(0x647b8d,.28,.82),dark=material(0x152230,.65,.42),leather=material(0x35424c,.89),light=glow(0x57e9ff,1.25);
 cylinder(root,.035,.045,.28,leather,[0,.21,0],[0,0,0],14,'WRAPPED_SWORD_GRIP');
 for(let i=0;i<7;i++)ring(root,.038,.006,steel,[0,.09+i*.038,0]);
 add(root,new THREE.DodecahedronGeometry(.052),steel,[0,.047,0],[0,0,0],'FACETED_POMMEL');
 block(root,[.25,.055,.105],steel,[0,.385,0],[0,0,0],'SWORD_CROSSGUARD');
 for(const side of [-1,1])block(root,[.052,.09,.09],dark,[side*.093,.41,0],[0,0,side*-.25]);
 cylinder(root,.044,.044,.038,steel,[0,.435,0]);
 silhouette(root,[[-.052,.45],[.052,.45],[.043,1.22],[0,1.4],[-.043,1.22]],.04,steel,[0,0,0],'TAPERED_BLADE_FRAME');
 const blade=silhouette(root,[[-.033,.49],[.033,.49],[.027,1.22],[0,1.365],[-.027,1.22]],.048,light,[0,0,0],'PLASMA_CUTTING_CORE');pulse(blade,1.25);
 for(const z of [-.057,.057]){
  block(root,[.075,.11,.008],dark,[0,.307,z]);
  pulse(block(root,[.018,.062,.009],light,[0,.31,z*1.1]),1.25);
 }
}

function axe(root){
 const iron=material(0x596a77,.31,.82),edge=material(0xc7d5db,.22,.84),wood=material(0x614328,.89),leather=material(0x302b29,.88),brass=material(0xb48d50,.37,.75);
 cylinder(root,.033,.046,1.35,wood,[0,.675,0],[0,0,0],14,'ASH_AXE_HAFT');
 for(let i=0;i<10;i++)ring(root,.043,.009,leather,[0,.1+i*.048,0]);
 cylinder(root,.045,.05,.07,brass,[0,.04,0]);cylinder(root,.045,.045,.07,brass,[0,.61,0]);
 const blade=[[-.04,1.13],[-.25,1.1],[-.39,1.04],[-.38,1.24],[-.29,1.43],[-.09,1.5],[.055,1.39],[.18,1.4],[.27,1.33],[.16,1.27],[.05,1.28]];
 silhouette(root,blade,.09,iron,[0,0,0],'FORGED_AXE_HEAD');
 silhouette(root,[[-.39,1.04],[-.38,1.24],[-.29,1.43],[-.24,1.44],[-.31,1.23],[-.32,1.08]],.095,edge,[0,0,0],'HONED_AXE_EDGE');
 block(root,[.11,.22,.13],iron,[0,1.31,0],[0,0,0],'HAFT_EYE');
 for(const z of [-.073,.073]){
  for(const y of [1.25,1.37])rivet(root,[0,y,z],brass,.018);
  block(root,[.1,.012,.01],brass,[-.18,1.3,z*.72],[0,0,-.65]);
  block(root,[.065,.012,.01],brass,[-.19,1.25,z*.72],[0,0,.45]);
 }
}

function bow(root){
 const wood=material(0x875b35,.72),dark=material(0x302e33,.66,.38),brass=material(0xb49459,.34,.72),cyan=glow(0x58d8dc,.85),cord=material(0xd8d1b8,.9);
 const points=[[.26,.025,0],[-.02,.14,0],[-.27,.37,0],[-.34,.65,0],[-.27,.93,0],[-.02,1.16,0],[.26,1.275,0]];
 line(root,points,.031,wood,'RECURVED_TIMBER_LIMBS');
 line(root,points.map(([x,y,z])=>[x-.015,y,z-.025]),.009,brass,'BOW_INLAY');
 line(root,[[.26,.025,0],[.13,.65,0],[.26,1.275,0]],.005,cord,'TENSIONED_BOWSTRING');
 block(root,[.085,.22,.085],dark,[-.335,.65,0],[0,0,0],'BOW_GRIP');
 for(let i=0;i<5;i++)ring(root,.041,.006,brass,[-.335,.57+i*.04,0]);
 for(const y of [.05,1.25]){
  cylinder(root,.029,.029,.1,brass,[.23,y,0],[0,0,1.05],12,'LIMB_TIP_FITTING');
  pulse(add(root,new THREE.OctahedronGeometry(.036),cyan,[.12,y<.5?.14:1.16,-.025]),.85,y);
 }
 // A nocked arrow, vane and three-sided point make the bow instantly readable.
 cylinder(root,.007,.007,.76,wood,[.05,.65,-.027],[0,0,Math.PI/2],8,'NOCKED_ARROW');
 add(root,new THREE.ConeGeometry(.028,.09,3),brass,[-.37,.65,-.027],[0,0,Math.PI/2],'ARROWHEAD');
 for(const side of [-1,1])silhouette(root,[[.3,.65],[.37,.65],[.39,.65+side*.045],[.33,.65+side*.035]],.008,cyan,[0,0,-.027],'ARROW_FLETCHING');
}

function staff(root){
 const wood=material(0x41302d,.86),gold=material(0xb29558,.35,.75),dark=material(0x24333e,.62,.5),violet=glow(0xb18aff,.8);
 cylinder(root,.027,.038,1.47,wood,[0,.735,0],[0,0,0],12,'CARVED_STAFF_SHAFT');
 cylinder(root,.032,.044,.08,gold,[0,.04,0]);
 for(const y of [.35,.58,1.31,1.42])ring(root,y>1?.04:.032,.009,gold,[0,y,0]);
 for(let i=0;i<7;i++)ring(root,.032,.005,dark,[0,.73+i*.043,0]);
 cylinder(root,.06,.04,.09,gold,[0,1.47,0],undefined,12,'STAFF_CROWN_BASE');
 for(let i=0;i<3;i++){
  const a=i/3*Math.PI*2;
  line(root,[[Math.cos(a)*.045,1.49,Math.sin(a)*.045],[Math.cos(a)*.12,1.59,Math.sin(a)*.12],[Math.cos(a)*.1,1.73,Math.sin(a)*.1]],.014,gold,'CRYSTAL_CROWN_PRONG');
 }
 const crystal=add(root,new THREE.OctahedronGeometry(.135),violet,[0,1.655,0],[0,Math.PI/6,0],'AMETHYST_STAFF_FOCUS');crystal.scale.set(.65,1.04,.65);pulse(crystal,.8);
 ring(root,.092,.009,gold,[0,1.56,0]);
 for(const z of [-.04,.04])pulse(block(root,[.012,.1,.009],violet,[0,1.17,z]),.8);
}

function cart(root){
 const oak=[material(0x8a5b35,.85),material(0xa16c41,.83)],iron=material(0x34434d,.4,.78),hub=material(0xb39363,.42,.68);
 // Cart length runs along X; the open tray and large wheel spokes remain visible.
 for(let i=0;i<6;i++)block(root,[1.48,.075,.135],oak[i%2],[.2,.66,-.36+i*.144]);
 for(const x of [-.35,.8])block(root,[.09,.12,.94],iron,[x,.575,0]);
 for(const side of [-1,1]){
  for(let row=0;row<3;row++)block(root,[1.6,.15,.055],oak[row%2],[.2,.83+row*.19,side*.46]);
  for(const x of [-.57,.97])block(root,[.085,.77,.085],oak[1],[x,1.005,side*.45]);
  block(root,[1.66,.045,.085],iron,[.2,1.4,side*.46]);
  for(const x of [-.57,.97])for(const y of [.83,1.22])rivet(root,[x,y,side*.503],hub,.025);
 }
 for(const x of [-.58,.98])for(let row=0;row<3;row++)block(root,[.055,.15,.9],oak[row%2],[x,.83+row*.19,0]);
 // Long straight pull shafts attach beneath the timber bed.
 for(const z of [-.31,.31]){
  block(root,[1.1,.075,.075],oak[1],[-.84,.56,z],[0,0,.11]);
  block(root,[.28,.085,.085],iron,[-1.26,.61,z]);
 }
 cylinder(root,.044,.044,1.09,iron,[.2,.44,0],[Math.PI/2,0,0],12,'IRON_CART_AXLE');
 for(const side of [-1,1]){
  const z=side*.535;
  ring(root,.38,.044,iron,[.2,.44,z],[0,0,0],'IRON_WHEEL_TYRE');
  ring(root,.345,.036,oak[0],[.2,.44,z],[0,0,0],'TIMBER_WHEEL_RIM');
  for(let i=0;i<10;i++){
   const a=i*Math.PI/5;
   block(root,[.029,.63,.035],oak[i%2],[.2,.44,z],[0,0,a],'OPEN_WHEEL_SPOKE');
  }
  cylinder(root,.095,.095,.12,hub,[.2,.44,z],[Math.PI/2,0,0],16,'CART_WHEEL_HUB');
  rivet(root,[.2,.44,z+side*.07],iron,.04);
 }
}

function anvil(root){
 const wood=material(0x6d4931,.9),iron=material(0x354550,.45,.72),face=material(0xb2c1c8,.26,.85),band=material(0x6a7478,.38,.76);
 cylinder(root,.215,.23,.29,wood,[0,.145,0],[0,0,0],12,'SMITHING_PEDESTAL');
 for(const y of [.06,.24])ring(root,.222,.016,band,[0,y,0]);
 block(root,[.46,.065,.37],iron,[0,.326,0]);
 silhouette(root,[[-.19,.36],[.19,.36],[.145,.43],[.11,.6],[.2,.66],[-.2,.66],[-.11,.6],[-.145,.43]],.27,iron,[0,0,0],'WAISTED_FORGED_ANVIL');
 block(root,[.53,.12,.36],iron,[.01,.7,0]);
 block(root,[.53,.025,.36],face,[.01,.775,0],[0,0,0],'HARDENED_ANVIL_FACE');
 // Smooth tapered horn and a rectangular heel are separate from the waist.
 add(root,new THREE.ConeGeometry(.12,.31,18),face,[-.4,.7,0],[0,0,Math.PI/2],'TAPERED_ANVIL_HORN');
 block(root,[.13,.065,.25],face,[.335,.735,0]);
 block(root,[.048,.003,.048],material(0x14212a,.8),[.305,.77,0],[0,0,0],'HARDY_HOLE');
 cylinder(root,.015,.015,.004,material(0x14212a,.8),[.18,.79,.08],[0,0,0],12,'PRITCHEL_HOLE');
 for(const x of [-.17,.17])for(const z of [-.12,.12])rivet(root,[x,.365,z],band,.019);
}

function sign(root){
 const wood=material(0x795337,.87),face=material(0xa77b4f,.84),edge=material(0x49372a,.91),iron=material(0x364550,.42,.75),brass=material(0xbfa269,.4,.7),light=glow(0xffd387,.8);
 block(root,[.18,2.3,.18],wood,[0,1.15,0]);
 cylinder(root,.22,.28,.08,iron,[0,.04,0],undefined,8,'SIGNPOST_FOOT');
 add(root,new THREE.ConeGeometry(.15,.15,4),brass,[0,2.31,0],[0,Math.PI/4,0],'CAPPED_SIGNPOST');
 for(const [side,y]of [[1,1.95],[-1,1.52]]){
  silhouette(root,[[-.5,-.13],[.4,-.13],[.6,0],[.4,.13],[-.5,.13]],.07,face,[side*.06,y,-.15],'CARVED_ARROW_BOARD');
  const board=root.children[root.children.length-1];if(side<0)board.rotation.y=Math.PI;
  for(const z of [-.202,.202]){
   for(let i=0;i<3;i++)block(root,[.3-i*.04,.012,.008],edge,[.04,y+.06-i*.06,z]);
   for(const x of [-.35,.28])rivet(root,[x,y,z],brass,.016);
  }
 }
 for(const y of [1.32,2.13])ring(root,.108,.017,iron,[0,y,0]);
 line(root,[[0,2.2,0],[.18,2.25,0],[.3,2.2,0],[.3,2.1,0]],.018,iron,'LANTERN_HANGER');
 const lantern=new THREE.Group();lantern.position.set(.3,1.94,0);root.add(lantern);
 block(lantern,[.18,.04,.18],iron,[0,-.12,0]);block(lantern,[.19,.04,.19],iron,[0,.12,0]);
 pulse(block(lantern,[.13,.2,.13],light,[0,0,0],[0,0,0],'WAYFINDING_LANTERN'),.8,1);
 for(const x of [-.077,.077])for(const z of [-.077,.077])block(lantern,[.015,.22,.015],iron,[x,0,z]);
 for(const side of [-1,1]){
  block(root,[.055,.4,.055],edge,[side*.16,.2,0],[0,0,side*-.18]);
  add(root,new THREE.IcosahedronGeometry(.12,0),material(0x667a65,.96),[side*.18,.085,.12]);
 }
}

function windmill(root){
 const stone=[material(0xb9aa8f,.92),material(0xa2947c,.94)],timber=material(0x64472f,.83),dark=material(0x35414a,.5,.74),canvas=material(0xe9d8b6,.94),roof=material(0x53665f,.77,.14),glass=glow(0xffd695,.65);
 cylinder(root,.76,1.03,3.65,stone[0],[0,1.825,0],[0,0,0],20,'TAPERED_MASONRY_MILL');
 // Shallow masonry courses break up the broad tapered tower surface.
 for(let i=1;i<12;i++){
  const y=i*.29,r=1.03-y/3.65*.27;
  ring(root,r+.005,.012,stone[i%2],[0,y,0]);
 }
 cylinder(root,0,1.16,1.16,roof,[0,4.23,0],[0,Math.PI/8,0],12,'TIMBER_MILL_ROOF');
 block(root,[.42,.72,.07],timber,[0,.38,-1.025]);
 block(root,[.045,.045,.025],dark,[.12,.4,-1.07]);
 for(const y of [1.55,2.7])for(const side of [-1,1]){
  const x=side*.36,z=-(1.03-y/3.65*.27)*.91;
  block(root,[.28,.38,.045],timber,[x,y,z]);
  block(root,[.2,.3,.017],glass,[x,y,z-.028]);
  block(root,[.022,.33,.025],timber,[x,y,z-.045]);block(root,[.23,.025,.025],timber,[x,y,z-.045]);
 }
 // A real timber balcony surrounds the upper working floor.
 cylinder(root,1.12,1.12,.09,timber,[0,2.07,0],[0,0,0],20,'MILL_BALCONY');
 ring(root,1.105,.028,timber,[0,2.66,0]);
 for(let i=0;i<14;i++){
  const a=i/14*Math.PI*2;
  block(root,[.045,.59,.045],timber,[Math.sin(a)*1.1,2.365,Math.cos(a)*1.1]);
 }
 cylinder(root,.12,.14,.35,dark,[0,3.84,-.97],[Math.PI/2,0,0],16,'MILL_DRIVE_AXLE');
 const rotor=new THREE.Group();rotor.name='BRACED_CANVAS_ROTOR';rotor.position.set(0,3.84,-1.2);rotor.userData.equipmentRotor={speed:.33,axis:'z'};root.add(rotor);
 for(let i=0;i<4;i++){
  const sail=new THREE.Group();sail.rotation.z=i*Math.PI/2;rotor.add(sail);
  block(sail,[.09,1.94,.09],timber,[0,.96,0]);
  block(sail,[.44,1.18,.035],canvas,[.15,1.28,.025],[0,0,0],'STITCHED_CANVAS_SAIL');
  for(const x of [-.07,.37])block(sail,[.035,1.24,.055],timber,[x,1.28,0]);
  for(let k=0;k<5;k++)block(sail,[.47,.025,.055],timber,[.15,.7+k*.29,-.01]);
  line(sail,[[-.05,.57,-.04],[.37,1.87,-.04]],.012,dark,'SAIL_DIAGONAL_BRACE');
 }
 cylinder(rotor,.2,.2,.14,dark,[0,0,0],[Math.PI/2,0,0],16,'MILL_ROTOR_HUB');
 cylinder(rotor,.11,.11,.155,stone[1],[0,0,-.025],[Math.PI/2,0,0],12,'MILL_HUB_CAP');
}

export function createEquipmentPropModel(id){
 const info=EQUIPMENT_PROP_MODEL_INFO[id];if(!info)return null;
 const root=new THREE.Group();({'plasma-sword':sword,'battle-axe':axe,'arc-bow':bow,'crystal-staff':staff,'wooden-cart':cart,'iron-anvil':anvil,'street-sign':sign,windmill})[id](root);
 const behavior=settings[id][2];root.name=info[0];root.userData={builderObject:true,equipmentPropModel:true,modelId:id,label:info[0],description:info[1],dimensions:[...info[2]],behavior,interactive:behavior!=='decor',animated:true};
 const bounds=new THREE.Box3().setFromObject(root);if(Number.isFinite(bounds.min.y))for(const child of root.children)child.position.y-=bounds.min.y;
 root.traverse(node=>{if(node.isMesh){node.userData.builderRoot=root;node.castShadow=!node.userData.collisionDisabled;node.receiveShadow=true;}});
 return finishVehicleDesign(THREE,finishGameItem(THREE,root),id);
}

export function updateEquipmentPropModel(root,elapsed){
 if(!root?.userData?.equipmentPropModel||root.userData.animationState?.enabled===false)return;
 const speed=Number(root.userData.animationState?.speed??1),time=(Number.isFinite(elapsed)?elapsed:0)*(Number.isFinite(speed)?Math.max(0,speed):1);
 root.traverse(node=>{
  const pulse=node.userData.equipmentPulse,rotor=node.userData.equipmentRotor;
  if(pulse&&node.material?.emissive)node.material.emissiveIntensity=pulse.base*(1+Math.sin(time*1.55+pulse.phase)*.12);
  if(rotor)node.rotation[rotor.axis]=time*rotor.speed;
 });
}
