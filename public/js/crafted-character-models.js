import * as THREE from '../vendor/three/three.module.min.js';
import {finishGameItem} from './game-item-finish.js';

export const CRAFTED_CHARACTER_MODEL_INFO=Object.freeze({
 'forest-ranger':['Forest Ranger','A hooded woodland guide with a layered travelling cloak, fitted leather equipment and a full arrow quiver.',[.75,1.8,.55]],
 'desert-merchant':['Desert Merchant','A robed trader with wrapped headwear, embroidered hems, coin clasps and an expedition satchel.',[.8,1.75,.6]],
 'clockwork-knight':['Clockwork Knight','An articulated brass guardian with overlapping steel armour, exposed pivot joints and a luminous visor.',[.85,1.9,.65]],
 'spectral-ghost':['Spectral Ghost','A translucent hooded spirit with a scalloped spectral robe, luminous eyes and a sheltered soul core.',[.85,1.7,.6]],
 'emerald-slime':['Emerald Slime','A glossy, irregular emerald creature with an inset heart crystal, suspended bubbles and a curious face.',[1,.8,.9]],
 'moss-golem':['Moss Golem','A weathered stone sentinel with articulated boulder limbs, mineral seams, moss patches and glowing eyes.',[1.4,2.6,1]],
 'cave-spider':['Cave Spider','An eight-legged cave hunter with plated chitin, articulated limbs, amber eyes and curved ivory fangs.',[1.8,.65,1.6]],
 'sky-ray':['Sky Ray','A soaring ray with sculpted wings, a long curling tail and luminous turquoise markings.',[3.2,.55,1.8]],
 'friendly-ghost':['Friendly Ghost','A gentle floating spirit with a scalloped sheet silhouette, welcoming arms and a softly glowing smile.',[.9,1.65,.7]]
});
const behaviors={'forest-ranger':'quest','desert-merchant':'talk','clockwork-knight':'patrol','spectral-ghost':'quest','emerald-slime':'hostile','moss-golem':'patrol','cave-spider':'hostile','sky-ray':'patrol','friendly-ghost':'quest'};
const colors={'forest-ranger':'#4ca477','desert-merchant':'#d79a52','clockwork-knight':'#a58b62','spectral-ghost':'#b9efff','emerald-slime':'#75d83d','moss-golem':'#68805d','cave-spider':'#493c55','sky-ray':'#56a8c7','friendly-ghost':'#d9f7ff'};
export const CRAFTED_CHARACTER_ITEMS=Object.freeze(Object.entries(CRAFTED_CHARACTER_MODEL_INFO).map(([id,[name,description,dimensions]])=>Object.freeze({
 id,buildAssetId:id,name,description,dimensions,color:colors[id],type:id==='friendly-ghost'?'interactive':['emerald-slime','moss-golem','cave-spider','sky-ray'].includes(id)?'enemy':'avatar',category:['emerald-slime','moss-golem','cave-spider','sky-ray'].includes(id)?'creatures':id==='friendly-ghost'?'interactive':'characters',behavior:behaviors[id],image:'public/images/native-upgrades/'+id+'.svg',animation:'crafted-idle',procedural:true,assetKind:'premade',size:76,
 function_data:{behavior:behaviors[id],prompt:['quest','talk'].includes(behaviors[id])?'Talk to '+name:behaviors[id]==='hostile'?'Beware of '+name:'Approach '+name}
})));

const mat=(color,roughness=.65,metalness=.05,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
const glow=(color,intensity=.7)=>mat(color,.28,.25,{emissive:color,emissiveIntensity:intensity});
function add(root,name,geometry,material,pos=[0,0,0],rot=[0,0,0]){const node=new THREE.Mesh(geometry,material);node.name=name;node.position.set(...pos);node.rotation.set(...rot);root.add(node);return node;}
const box=(root,name,size,material,pos,rot)=>add(root,name,new THREE.BoxGeometry(...size),material,pos,rot);
const sphere=(root,name,r,material,pos,scale=[1,1,1])=>{const node=add(root,name,new THREE.SphereGeometry(r,18,12),material,pos);node.scale.set(...scale);return node;};
const cyl=(root,name,r1,r2,h,material,pos,segments=16,rot)=>add(root,name,new THREE.CylinderGeometry(r1,r2,h,segments),material,pos,rot);
const torus=(root,name,r,t,material,pos,rot=[Math.PI/2,0,0],arc=Math.PI*2)=>add(root,name,new THREE.TorusGeometry(r,t,6,32,arc),material,pos,rot);
function tube(root,name,points,r,material){return add(root,name,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,6),material);}
function link(root,name,a,b,r,material){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),node=cyl(root,name,r,r*1.12,start.distanceTo(end),material,start.clone().add(end).multiplyScalar(.5).toArray(),10);node.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());return node;}
function animatedGroup(root,name,pos,axis='y',amplitude=.03,phase=0){const group=new THREE.Group();group.name=name;group.position.set(...pos);group.userData.characterMotion={kind:'rotation',axis,base:0,amplitude,phase};root.add(group);return group;}
function emission(node,intensity=.7,phase=0){node.userData.characterGlow={intensity,phase};return node;}
function profile(root,name,points,depth,material,pos=[0,0,0],rotation=[0,0,0]){
 const shape=new THREE.Shape();shape.moveTo(...points[0]);for(const point of points.slice(1))shape.lineTo(...point);shape.closePath();
 const geo=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelSize:Math.min(.018,depth*.3),bevelThickness:Math.min(.012,depth*.25),bevelSegments:1});geo.translate(0,0,-depth/2);
 return add(root,name,geo,material,pos,rotation);
}
// A tailored garment is a continuous tapered surface, with a waved lower hem.
function garment(root,name,rings,material,pos=[0,0,0],openFront=false){
 const positions=[],indices=[],segments=28;
 rings.forEach(([y,rx,rz],row)=>{for(let i=0;i<=segments;i++){const a=(openFront?.27:0)+(i/segments)*(openFront?Math.PI*2-.54:Math.PI*2),wave=row===0?Math.cos(a*7)*.024:0;positions.push(Math.sin(a)*rx,y+wave,Math.cos(a)*rz);}});
 for(let row=0;row<rings.length-1;row++)for(let i=0;i<segments;i++){const a=row*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();return add(root,name,geo,material,pos);
}

function humanoid(root,merchant=false){
 const cloth=mat(merchant?0xb7824a:0x315d4b,.88,.02,{side:THREE.DoubleSide}),shade=mat(merchant?0x75492f:0x213d36,.94),leather=mat(0x4d352c,.84),skin=mat(merchant?0xbe875d:0xd3a27c,.82),gold=mat(0xc4a065,.34,.7),ink=mat(0x17232c,.85),ivory=mat(0xe1d0ac,.8);
 // Boots, shaped tunic and split travelling cloak give distinct silhouettes.
 for(const side of [-1,1]){
  box(root,'LEATHER_BOOT',[.19,.16,.31],leather,[side*.14,.08,-.06]);
  cyl(root,'TROUSER_LEG',.082,.075,.53,shade,[side*.14,.39,0],12);
  torus(root,'BOOT_CUFF',.086,.015,gold,[side*.14,.18,0]);
 }
 const torso=animatedGroup(root,'TRAVELLER_TORSO',[0,.84,0],'z',.012,merchant?1:0);
 garment(torso,'TAILORED_TUNIC',[[-.15,.25,.16],[.22,.25,.16],[.48,.22,.15]],cloth);
 if(merchant){
  garment(torso,'LAYERED_TRADER_ROBE',[[-.65,.32,.22],[-.55,.33,.22],[.2,.25,.17]],cloth);
  torus(torso,'ROBE_EMBROIDERED_HEM',.305,.016,gold,[0,-.61,0]);
  for(const side of [-1,1])for(let i=0;i<4;i++)sphere(torso,'ROBE_STITCH',.012,gold,[side*.16,-.5+i*.13,-.19]);
 }else{
  const cloak=garment(torso,'RANGER_SPLIT_CLOAK',[[-.55,.32,.23],[-.3,.35,.25],[.38,.27,.18],[.5,.17,.13]],shade,[0,0,.06],true);cloak.rotation.y=Math.PI;
  cloak.userData.characterMotion={kind:'rotation',axis:'x',base:0,amplitude:.025,phase:1};
  for(const side of [-1,1])profile(torso,'CLOAK_LAPEL',[[0,0],[side*.19,-.36],[side*.25,.04]],.025,cloth,[0,.37,-.17]);
 }
 cyl(torso,'FITTED_LEATHER_BELT',.25,.25,.085,leather,[0,-.02,0]);
 box(torso,'BELT_BUCKLE',[.095,.08,.035],gold,[0,-.02,-.25]);
 box(torso,'BUCKLE_INSET',[.052,.038,.012],ink,[0,-.02,-.273]);
 for(const side of [-1,1]){
  const arm=animatedGroup(torso,'TRAVELLER_ARM',[side*.27,.28,0],'x',.025,side);
  link(arm,'CLOTH_SLEEVE',[0,0,0],[side*.075,-.3,-.015],.086,cloth);
  cyl(arm,'LEATHER_BRACER',.075,.075,.12,leather,[side*.074,-.32,-.015],12);
  sphere(arm,'TRAVELLER_HAND',.074,skin,[side*.075,-.42,-.02],[.82,1,.8]);
  for(let i=0;i<2;i++)torus(arm,'BRACER_STRAP',.076,.008,gold,[side*.074,-.29-i*.055,-.015]);
 }
 const head=animatedGroup(torso,'TRAVELLER_HEAD',[0,.64,0],'y',.04,.6);
 sphere(head,'TRAVELLER_FACE',.175,skin,[0,0,-.015],[.85,1.12,.9]);
 for(const x of [-.055,.055]){
  sphere(head,'TRAVELLER_EYE',.015,ink,[x,.015,-.163],[1,.65,.55]);
  box(head,'TRAVELLER_BROW',[.046,.012,.014],leather,[x,.05,-.158]);
 }
 sphere(head,'TRAVELLER_NOSE',.025,skin,[0,-.02,-.18],[.6,1,1]);
 if(merchant){
  for(let i=0;i<4;i++){const wrap=torus(head,'WRAPPED_TURBAN',.16-i*.012,.046,ivory,[0,.09+i*.033,0]);wrap.scale.z=.91;wrap.rotation.z=.06*(i%2?1:-1);}
  torus(head,'TURBAN_BRASS_BAND',.175,.012,gold,[0,.115,0]);
  sphere(head,'TURBAN_CLASP',.032,gold,[0,.14,-.183],[.8,1,.4]);
  const strap=box(torso,'SATCHEL_SHOULDER_STRAP',[.055,.7,.022],leather,[0,.14,-.19],[0,0,-.48]);
  const bag=box(torso,'TRADER_SATCHEL',[.23,.25,.15],leather,[.27,-.13,-.045],[0,0,-.08]);
  box(torso,'SATCHEL_FLAP',[.25,.09,.022],shade,[.27,-.06,-.13]);
  box(torso,'SATCHEL_CLASP',[.04,.055,.018],gold,[.27,-.13,-.145]);
  for(let i=0;i<3;i++)sphere(torso,'TRADER_COIN',.023,gold,[-.13+i*.055,-.04,-.255],[1,1,.25]);
  strap.name='CROSS_BODY_LEATHER_STRAP';bag.name='STITCHED_EXPEDITION_SATCHEL';
 }else{
  // Hollow hood surrounds a recessed face, rather than covering it with a sphere.
  const hoodGeo=new THREE.LatheGeometry([[0,.21],[.11,.18],[.2,.1],[.225,-.02],[.205,-.12],[.175,-.15]].map(p=>new THREE.Vector2(...p)),28);
  add(head,'RANGER_HOOD',hoodGeo,cloth,[0,.015,.015],[Math.PI/2,0,0]);
  torus(head,'HOOD_FACE_BINDING',.178,.018,shade,[0,.02,-.136],[0,0,0],Math.PI*1.84).rotation.z=.25;
  cyl(torso,'ARROW_QUIVER',.105,.085,.56,leather,[-.2,.15,.215],16,[0,0,-.22]);
  for(let i=0;i<5;i++){
   const x=-.24+(i%3)*.04,z=.2+Math.floor(i/3)*.055;
   cyl(torso,'WOODEN_ARROW_SHAFT',.005,.005,.7,ivory,[x,.32,z],6);
   profile(torso,'ARROW_FLETCHING',[[0,0],[.035,.08],[0,.065],[-.035,.08]],.008,cloth,[x,.63,z]);
  }
  box(torso,'QUIVER_SHOULDER_STRAP',[.045,.65,.025],leather,[.02,.16,-.18],[0,0,.42]);
  sphere(torso,'RANGER_CLOAK_CLASP',.035,gold,[0,.36,-.205],[1,1,.4]);
 }
}

function knight(root){
 const brass=mat(0xa58950,.34,.8),steel=mat(0x8a9da2,.3,.82),dark=mat(0x263741,.62,.65),leather=mat(0x4c3330,.82),light=glow(0x75e5ef,1.1);
 for(const side of [-1,1]){
  box(root,'SABATON_BOOT',[.23,.15,.37],steel,[side*.17,.075,-.075]);
  for(let i=0;i<3;i++)box(root,'BOOT_OVERLAP_PLATE',[.23,.025,.09],brass,[side*.17,.15,-.18+i*.07]);
  link(root,'LEG_ACTUATOR',[side*.17,.17,0],[side*.17,.73,0],.055,dark);
  cyl(root,'GREAVE_ARMOUR',.09,.11,.31,steel,[side*.17,.34,0],10);
  sphere(root,'KNEE_PIVOT',.1,brass,[side*.17,.55,-.012],[1,1,.85]);
  box(root,'THIGH_OVERLAP',[.2,.26,.15],brass,[side*.17,.73,0]);
 }
 const torso=animatedGroup(root,'CLOCKWORK_TORSO',[0,.94,0],'y',.018,.3);
 cyl(torso,'WAIST_GEAR',.2,.2,.11,dark,[0,0,0],16);
 torus(torso,'WAIST_GEAR_TRIM',.205,.02,brass,[0,.025,0]);
 profile(torso,'TAPERED_CHEST_PLATE',[[-.27,-.01],[.27,-.01],[.32,.3],[.24,.45],[-.24,.45],[-.32,.3]],.28,steel,[0,.08,0]);
 profile(torso,'BREASTPLATE_INLAY',[[0,0],[.15,.2],[0,.34],[-.15,.2]],.017,brass,[0,.12,-.16]);
 emission(sphere(torso,'CLOCKWORK_HEART',.052,light,[0,.29,-.186],[1,1,.4]),1.1,.8);
 for(const x of [-.21,.21])for(const y of [.13,.4])sphere(torso,'ARMOUR_RIVET',.018,brass,[x,y,-.16]);
 for(const side of [-1,1]){
  const arm=animatedGroup(torso,'CLOCKWORK_ARM',[side*.32,.33,0],'z',.025,side+1);
  sphere(arm,'SHOULDER_GEAR',.1,dark,[0,0,0]);
  const pauldron=sphere(arm,'OVERLAPPING_PAULDRON',.15,brass,[side*.025,.025,0],[1.2,.65,1.15]);
  pauldron.rotation.z=side*.2;
  link(arm,'UPPER_ARM_PISTON',[side*.02,-.03,0],[side*.05,-.26,0],.055,dark);
  cyl(arm,'VAMBRACE',.095,.08,.22,steel,[side*.055,-.35,0],10);
  sphere(arm,'ELBOW_PIVOT',.078,brass,[side*.05,-.23,0]);
  box(arm,'GAUNTLET',[.15,.15,.16],brass,[side*.055,-.52,-.015]);
  for(let i=0;i<3;i++)box(arm,'GAUNTLET_FINGER_PLATE',[.025,.06,.027],steel,[side*.055-.04+i*.04,-.58,-.075]);
 }
 const head=animatedGroup(torso,'CLOCKWORK_HELMET',[0,.65,0],'y',.045,.9);
 cyl(head,'GORGET',.135,.15,.09,brass,[0,-.125,0],16);
 sphere(head,'DOMED_HELMET',.195,steel,[0,.015,0],[.9,1.04,.95]);
 box(head,'DARK_VISOR_RECESS',[.31,.085,.045],dark,[0,.01,-.165]);
 emission(box(head,'LUMINOUS_VISOR_SLIT',[.26,.023,.013],light,[0,.017,-.194]),1.1);
 for(const side of [-1,1])box(head,'VISOR_BRASS_FRAME',[.025,.1,.035],brass,[side*.16,.015,-.184]);
 profile(head,'HELMET_CREST',[[0,0],[.075,.06],[.045,.25],[-.045,.25],[-.075,.06]],.04,brass,[0,.13,.01],[Math.PI/2,0,0]);
 box(torso,'LEATHER_TABARD',[.25,.4,.025],leather,[0,-.19,-.153]);
 for(const side of [-1,1])box(torso,'TABARD_BRASS_HEM',[.014,.35,.012],brass,[side*.105,-.19,-.171]);
}

function spirit(root,friendly=false){
 const robe=mat(friendly?0xd9f1f5:0x8bd8e9,.47,.04,{transparent:true,opacity:friendly?.82:.68,side:THREE.DoubleSide,emissive:friendly?0x4d8e9a:0x33859d,emissiveIntensity:.25}),shadow=mat(0x172c42,.68,.04),soul=glow(friendly?0xb1faff:0x6ee8ff,.9);
 const body=animatedGroup(root,'SPIRIT_FLOAT',[0,.09,0],'y',.025,.2);body.userData.characterMotion={kind:'position',axis:'y',base:.09,amplitude:.035,phase:.2};
 garment(body,'SCALLOPED_SPIRIT_ROBE',[[0,.38,.28],[.12,.34,.27],[.38,.29,.23],[.72,.25,.21],[.99,.21,.18]],robe);
 const head=animatedGroup(body,'SPIRIT_HEAD',[0,1.1,0],'z',.035,1.2);
 if(friendly){
  sphere(head,'FRIENDLY_SHEET_HEAD',.29,robe,[0,0,0],[1,1.12,.82]);
  for(const side of [-1,1]){
   sphere(head,'FRIENDLY_GHOST_EYE',.045,shadow,[side*.095,.025,-.22],[.75,1.1,.5]);
   sphere(head,'EYE_GLINT',.012,soul,[side*.095-.009,.041,-.243]);
   const arm=animatedGroup(body,'WELCOMING_ARM',[side*.25,.77,0],'z',.04,side);
   tube(arm,'GHOST_ARM',[[0,0,0],[side*.13,.1,-.025],[side*.22,.14,-.04]],.085,robe);
  }
  torus(head,'GHOST_SMILE',.065,.012,shadow,[0,-.065,-.247],[0,0,Math.PI],Math.PI);
 }else{
  sphere(head,'SPECTRAL_HOOD',.28,robe,[0,0,.025],[.93,1.15,.9]);
  sphere(head,'RECESSED_HOOD_SHADOW',.202,shadow,[0,-.025,-.125],[.85,1.12,.4]);
  for(const x of [-.065,.065])emission(sphere(head,'SPECTRAL_EYE',.033,soul,[x,-.015,-.21],[1,.7,.5]),.9,x);
  torus(head,'SPECTRAL_HOOD_RIM',.215,.018,soul,[0,-.015,-.117],[0,0,0],Math.PI*1.85).rotation.z=.23;
  emission(add(body,'SHELTERED_SOUL',new THREE.OctahedronGeometry(.09),soul,[0,.71,-.12]),.9,.6);
  for(const side of [-1,1])profile(body,'TATTERED_SPECTRAL_ARM',[[0,0],[side*.23,-.35],[side*.05,-.24],[-side*.025,-.12]],.1,robe,[side*.23,.85,0]);
 }
 for(let i=0;i<7;i++){
  const a=i/7*Math.PI*2,node=friendly?sphere(body,'SOFT_SHEET_SCALLOP',.075,robe,[Math.sin(a)*.29,.01,Math.cos(a)*.21],[.85,.75,.75]):add(body,'SPIRIT_HEM_TRAIL',new THREE.ConeGeometry(.05,.2,6),robe,[Math.sin(a)*.29,-.005,Math.cos(a)*.21],[Math.PI,0,0]);
  node.userData.characterMotion={kind:'scale',axis:'y',base:1,amplitude:.08,phase:i};node.userData.collisionDisabled=true;
 }
 const ring=torus(root,'SPIRIT_GROUND_AURA',.33,.008,soul,[0,.012,0]);ring.userData.collisionDisabled=true;emission(ring,.9,.8);
}

function slime(root){
 const skin=new THREE.MeshPhysicalMaterial({color:0x61b932,roughness:.2,metalness:.05,clearcoat:1,clearcoatRoughness:.15,transparent:true,opacity:.82}),dark=mat(0x173a24,.55),light=glow(0xb8ff77,.7);
 const blob=animatedGroup(root,'SLIME_BREATH',[0,0,0],'y',.025,.4);blob.userData.characterMotion={kind:'scale',axis:'y',base:1,amplitude:.025,phase:.4};
 const geometry=new THREE.SphereGeometry(.48,36,22),positions=geometry.attributes.position;
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),wave=1+Math.sin(x*11+z*7)*.045+Math.sin(z*14-y*4)*.025;
  positions.setXYZ(i,x*wave,Math.max(-.31,y*.82),z*wave*.88);
 }
 geometry.computeVertexNormals();add(blob,'GLOSSY_SLIME_BODY',geometry,skin,[0,.32,0]);
 for(const side of [-1,1]){
  sphere(blob,'SLIME_FOOT_LOBE',.16,skin,[side*.29,.1,-.03],[1,.55,1.05]);
  sphere(blob,'SLIME_CURIOUS_EYE',.06,dark,[side*.13,.43,-.367],[.8,1,.55]);
  sphere(blob,'SLIME_EYE_GLINT',.017,light,[side*.13-.012,.45,-.4]);
 }
 torus(blob,'SLIME_SMILE',.07,.012,dark,[0,.29,-.413],[0,0,Math.PI],Math.PI);
 emission(add(blob,'SLIME_HEART_CRYSTAL',new THREE.OctahedronGeometry(.12),light,[0,.29,-.01]),.7);
 for(let i=0;i<6;i++){
  const bubble=sphere(blob,'SLIME_SUSPENDED_BUBBLE',.017+i%3*.009,light,[Math.sin(i*3.1)*.27,.2+(i%3)*.12,Math.cos(i*2.4)*.19]);
  bubble.userData.characterMotion={kind:'position',axis:'y',base:bubble.position.y,amplitude:.025,phase:i};bubble.userData.collisionDisabled=true;
 }
}

function golem(root){
 const rock=[mat(0x536761,.97),mat(0x6a7c72,.96),mat(0x77887c,.93)],moss=mat(0x537643,.97),dark=mat(0x283d39,.96),light=glow(0xb9ed76,.8);
 const boulder=(group,name,r,pos,scale=[1,1,1],index=0)=>{const node=add(group,name,new THREE.DodecahedronGeometry(r,0),rock[index%3],pos,[.1*index,.4*index,.2*index]);node.scale.set(...scale);return node;};
 for(const side of [-1,1]){
  boulder(root,'GOLEM_STONE_FOOT',.22,[side*.27,.15,-.1],[1,.6,1.6],1);
  boulder(root,'GOLEM_SHIN',.19,[side*.27,.47,0],[.9,1.35,.9],0);
  boulder(root,'GOLEM_KNEE',.19,[side*.27,.76,-.035],[1,.85,.95],2);
  boulder(root,'GOLEM_UPPER_LEG',.22,[side*.27,1,0],[1,1.2,1],1);
 }
 const torso=animatedGroup(root,'GOLEM_TORSO',[0,1.38,0],'z',.016,.4);
 boulder(torso,'GOLEM_CHEST_BOULDER',.43,[0,.15,0],[1.02,1.17,.78],0);
 boulder(torso,'GOLEM_WAIST_BOULDER',.29,[0,-.21,0],[1.1,.7,.85],1);
 for(const side of [-1,1]){
  const arm=animatedGroup(torso,'GOLEM_ARM',[side*.43,.3,0],'x',.035,side);
  boulder(arm,'GOLEM_SHOULDER',.23,[0,0,0],[1,.9,.9],1);
  boulder(arm,'GOLEM_UPPER_ARM',.19,[side*.06,-.26,.01],[.9,1.25,.88],0);
  boulder(arm,'GOLEM_ELBOW',.15,[side*.1,-.45,0],[1,.8,1],2);
  boulder(arm,'GOLEM_FOREARM',.2,[side*.12,-.65,-.02],[1,1.25,.9],1);
  boulder(arm,'GOLEM_STONE_FIST',.2,[side*.14,-.89,-.07],[1,.85,1.1],0);
  for(let i=0;i<3;i++)boulder(arm,'GOLEM_FIST_KNUCKLE',.055,[side*.14-.085+i*.085,-.91,-.23],[1,1,.6],1);
  for(let i=0;i<3;i++)sphere(arm,'GOLEM_SHOULDER_MOSS',.085,moss,[Math.sin(i)*.15,.12,Math.cos(i)*.11],[1,.4,1]);
 }
 const head=animatedGroup(torso,'GOLEM_HEAD',[0,.76,-.035],'y',.035,.8);
 boulder(head,'GOLEM_HEAD_STONE',.28,[0,0,0],[1,1.02,.85],1);
 box(head,'GOLEM_BROW',[.46,.085,.11],dark,[0,.055,-.205]);
 for(const x of [-.12,.12])emission(box(head,'GOLEM_LUMINOUS_EYE',[.095,.034,.018],light,[x,.015,-.266]),.8,x);
 box(head,'GOLEM_MOUTH_SEAM',[.2,.017,.016],dark,[0,-.11,-.23]);
 for(let i=0;i<4;i++)sphere(head,'GOLEM_CROWN_MOSS',.085,moss,[-.15+i*.1,.22,0],[1,.4,.8]);
 for(const side of [-1,1]){
  tube(torso,'MINERAL_CHEST_SEAM',[[side*.04,.4,-.3],[side*.13,.22,-.35],[side*.09,.1,-.36],[side*.18,-.03,-.31]],.009,light);
  for(let i=0;i<3;i++)sphere(torso,'CHEST_MOSS_PATCH',.08,moss,[side*.29,.22-i*.13,-.23],[1,.5,.45]);
 }
}

function spider(root){
 const chitin=mat(0x413952,.39,.2),plates=mat(0x6d5a76,.42,.25),dark=mat(0x1d1c2b,.58),ivory=mat(0xb8ad8b,.67),eyes=glow(0xffb552,.85);
 const body=animatedGroup(root,'SPIDER_BODY',[0,.3,0],'y',.012,.5);body.userData.characterMotion={kind:'position',axis:'y',base:.3,amplitude:.012,phase:.5};
 sphere(body,'SPIDER_ABDOMEN',.31,chitin,[0,.07,.25],[.9,.73,1.22]);
 sphere(body,'SPIDER_THORAX',.22,plates,[0,.04,-.14],[.92,.65,1.05]);
 for(let i=0;i<4;i++)torus(body,'ABDOMEN_PLATE_SEAM',.23-i*.018,.009,plates,[0,.08,.1+i*.1],[Math.PI/2,0,0]);
 for(const side of [-1,1])for(let i=0;i<4;i++){
  const z=-.26+i*.17,spread=.66+Math.sin(i/3*Math.PI)*.16,footZ=z+(i-1.5)*.25;
  const leg=animatedGroup(body,'SPIDER_ARTICULATED_LEG',[side*.14,0,z],'z',.014,side+i*1.3);
  const a=[0,0,0],b=[side*spread*.52,.2,(i-1.5)*.09],c=[side*(spread-.14),-.01,(i-1.5)*.2],d=[side*spread,-.29,footZ-z];
  link(leg,'SPIDER_COXA',a,b,.029,chitin);link(leg,'SPIDER_TIBIA',b,c,.023,plates);link(leg,'SPIDER_TARSUS',c,d,.015,dark);
  for(const pos of [a,b,c])sphere(leg,'SPIDER_LEG_JOINT',.039,plates,pos,[1,.9,1]);
 }
 for(const side of [-1,1]){
  for(let i=0;i<3;i++)emission(sphere(body,'SPIDER_AMBER_EYE',.026+i*.004,eyes,[side*(.045+i*.05),.12-i*.024,-.326+i*.023],[1,.88,.6]),.85,i);
  tube(body,'SPIDER_CURVED_FANG',[[side*.07,-.025,-.31],[side*.115,-.065,-.375],[side*.085,-.13,-.4],[side*.045,-.14,-.39]],.024,ivory);
  link(body,'SPIDER_PEDIPALP',[side*.14,-.02,-.27],[side*.21,-.08,-.41],.022,chitin);
 }
 for(let i=0;i<3;i++)profile(body,'ABDOMEN_DORSAL_MARK',[[0,0],[.075,.05],[0,.14],[-.075,.05]],.008,plates,[0,.29,.08+i*.11],[Math.PI/2,0,0]);
}

function ray(root){
 const skin=mat(0x347d98,.44,.15,{side:THREE.DoubleSide}),rim=mat(0x78c3d0,.4,.2),under=mat(0x286174,.57,.1),light=glow(0x8cf1ef,.75),eye=mat(0x0f2b3c,.32,.15);
 const body=animatedGroup(root,'SKY_RAY_BODY',[0,.19,0],'z',.016,.5);
 sphere(body,'RAY_CENTRAL_BODY',.35,skin,[0,.06,0],[.85,.42,1.55]);
 for(const side of [-1,1]){
  const wing=animatedGroup(body,'RAY_WING',[side*.13,.055,0],'z',.04,side<0?0:Math.PI);
  const points=[[0,-.38],[side*.36,-.43],[side*.84,-.34],[side*1.42,-.13],[side*1.32,.14],[side*.84,.3],[side*.4,.26],[0,.4]];
  profile(wing,'SCULPTED_RAY_WING',points,.038,skin,[0,0,0],[-Math.PI/2,0,0]);
  tube(wing,'RAY_WING_EDGE',[[side*.18,.017,.39],[side*.6,.017,.38],[side*1.04,.017,.27],[side*1.4,.017,.12]],.012,rim);
  for(let i=0;i<4;i++){
   const x=side*(.24+i*.25),z=-.22+i*.035;
   emission(tube(wing,'BIOLUMINESCENT_WING_STREAK',[[x,.035,z],[x+side*.07,.045,z+.15],[x+side*.13,.025,z+.27]],.008,light),.75,i);
  }
  sphere(body,'RAY_RAISED_EYE',.055,under,[side*.16,.17,-.3],[1,.7,1.05]);
  sphere(body,'RAY_EYE',.029,eye,[side*.17,.18,-.34],[1,.75,.65]);
  sphere(body,'RAY_EYE_GLINT',.009,light,[side*.17-.006,.19,-.357]);
  tube(body,'RAY_CEPHALIC_FIN',[[side*.13,.025,-.42],[side*.18,.045,-.58],[side*.24,.06,-.62]],.038,skin);
 }
 const tail=animatedGroup(body,'RAY_TAIL',[0,.025,.38],'y',.035,1.4);
 tube(tail,'CURVING_RAY_TAIL',[[0,0,0],[.02,.015,.25],[.1,.045,.5],[.06,.09,.72],[-.04,.12,.84]],.025,under);
 emission(sphere(tail,'LUMINOUS_TAIL_TIP',.032,light,[-.04,.12,.84],[.7,.7,1.5]),.75,1);
 profile(body,'RAY_DORSAL_FIN',[[0,0],[.12,.12],[.28,0]],.025,rim,[0,.16,.16],[0,Math.PI/2,0]);
}

export function createCraftedCharacterModel(id){
 const info=CRAFTED_CHARACTER_MODEL_INFO[id];if(!info)return null;
 const root=new THREE.Group(),design=new THREE.Group();design.name='CRAFTED_CHARACTER_DESIGN';root.add(design);
 if(id==='forest-ranger'||id==='desert-merchant')humanoid(design,id==='desert-merchant');
 else if(id==='clockwork-knight')knight(design);
 else if(id==='spectral-ghost'||id==='friendly-ghost')spirit(design,id==='friendly-ghost');
 else if(id==='emerald-slime')slime(design);
 else if(id==='moss-golem')golem(design);
 else if(id==='cave-spider')spider(design);
 else ray(design);
 // Preserve placement origin and original advertised character height/span.
 const bounds=new THREE.Box3().setFromObject(design,true),size=bounds.getSize(new THREE.Vector3());
 design.scale.set(info[2][0]/size.x,info[2][1]/size.y,info[2][2]/size.z);design.position.y=-bounds.min.y*design.scale.y;
 root.name=info[0];root.userData={builderObject:true,craftedCharacterModel:true,modelId:id,label:info[0],description:info[1],dimensions:[...info[2]],behavior:behaviors[id],interactive:true,animated:true};
 root.traverse(node=>{if(node.isMesh){node.userData.builderRoot=root;node.castShadow=!node.userData.collisionDisabled;node.receiveShadow=true;}});
 return finishGameItem(THREE,root);
}

export function updateCraftedCharacterModel(root,elapsed){
 if(!root?.userData?.craftedCharacterModel||root.userData.animationState?.enabled===false)return;
 const speed=Number(root.userData.animationState?.speed??1),time=(Number.isFinite(elapsed)?elapsed:0)*(Number.isFinite(speed)?Math.max(0,speed):1);
 root.traverse(node=>{
  const motion=node.userData.characterMotion,glow=node.userData.characterGlow;
  if(motion){const value=motion.base+Math.sin(time*1.35+motion.phase)*motion.amplitude;if(motion.kind==='rotation')node.rotation[motion.axis]=value;else if(motion.kind==='position')node.position[motion.axis]=value;else node.scale[motion.axis]=value;}
  if(glow&&node.material?.emissive)node.material.emissiveIntensity=glow.intensity*(1+Math.sin(time*1.5+glow.phase)*.1);
 });
}
