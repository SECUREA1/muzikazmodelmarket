import * as THREE from '../vendor/three/three.module.min.js';
import {finishGameItem} from './game-item-finish.js';

export const CRAFTED_BUILDING_MODEL_INFO=Object.freeze({
 'timber-cabin':['Timber Cabin','A fitted timber cabin with board seams, a shingled pitched roof, framed windows and a brass-latched entrance.',[6,3.6,5]],
 'stone-tower':['Stone Watchtower','An open stone entry leads into a block-built watchtower with carved arrow slits, timber bracing and crenellated battlements.',[4,7,4]],
 'market-stall':['Market Stall','A striped canvas market canopy shelters a board-built counter, woven produce trays and hand-fitted brass details.',[3,2.8,2.2]],
 'sci-fi-bunker':['Sci-fi Bunker','A segmented expedition bunker with reinforced panel seams, protected glazing, cooling vents and an illuminated entry frame.',[7,3,5]]
});
const colors={'timber-cabin':'#9b6944','stone-tower':'#84928d','market-stall':'#df7d50','sci-fi-bunker':'#657f8c'};
export const CRAFTED_BUILDING_ITEMS=Object.freeze(Object.entries(CRAFTED_BUILDING_MODEL_INFO).map(([id,[name,description,dimensions]])=>({
 id,buildAssetId:id,name,description,dimensions,type:'landscape',category:'buildings',behavior:id==='market-stall'?'talk':'door',color:colors[id],procedural:true,assetKind:'premade',size:88,image:`public/images/native-upgrades/${id}.svg`,animation:'crafted-idle'
})));
const material=(color,roughness=.75,metalness=.05,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
const add=(root,name,geometry,mat,position=[0,0,0],rotation=[0,0,0])=>{const node=new THREE.Mesh(geometry,mat);node.name=name;node.position.set(...position);node.rotation.set(...rotation);root.add(node);return node;};
const box=(root,name,size,mat,position,rotation)=>add(root,name,new THREE.BoxGeometry(...size),mat,position,rotation);
const cylinder=(root,name,r1,r2,height,mat,position,rotation=[0,0,0],segments=16)=>add(root,name,new THREE.CylinderGeometry(r1,r2,height,segments),mat,position,rotation);
const emissive=color=>material(color,.25,.25,{emissive:color,emissiveIntensity:.8});
function beam(root,name,a,b,width,mat){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),direction=bv.clone().sub(av),node=box(root,name,[width,direction.length(),width],mat,av.add(bv).multiplyScalar(.5).toArray());node.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return node;}
function window(root,x,y,z,width,height,frame,glass,side=false){
 const group=new THREE.Group();group.position.set(x,y,z);if(side)group.rotation.y=Math.PI/2;root.add(group);
 box(group,'RECESSED_WINDOW',[width,height,.035],glass,[0,0,0]);
 for(const sx of [-1,1])box(group,'WINDOW_STILE',[.075,height+.12,.1],frame,[sx*(width+.05)/2,0,-.035]);
 for(const sy of [-1,1])box(group,'WINDOW_RAIL',[width+.17,.075,.1],frame,[0,sy*(height+.05)/2,-.035]);
 box(group,'WINDOW_MULLION',[.045,height,.08],frame,[0,0,-.06]);box(group,'WINDOW_CROSSBAR',[width,.045,.08],frame,[0,0,-.06]);
}
function door(root,width,height,pos,timber,metal){
 const leaf=new THREE.Group();leaf.name='door';leaf.position.set(...pos);root.add(leaf);
 for(let i=0;i<5;i++)box(leaf,'DOOR_PLANK',[width/5-.008,height,.085],timber,[-width*.4+i*width/5,height/2,0]);
 for(const y of [height*.2,height*.8])box(leaf,'DOOR_STRAP',[width*.9,.065,.035],metal,[0,y,-.06]);
 cylinder(leaf,'BRASS_LATCH',.033,.033,.075,metal,[width*.31,height*.48,-.105],[Math.PI/2,0,0],10);
 return leaf;
}

function cabin(root){
 const boards=[material(0x875537,.86),material(0x9f6c46,.87),material(0x99623f,.86)],trim=material(0x4d352b,.8),stone=material(0x5e6868,.95),roof=material(0x384e53,.78,.15),seam=material(0x233a40,.85),brass=material(0xb8a16c,.4,.7),glass=material(0x6b999e,.24,.25,{emissive:0x36565b,emissiveIntensity:.18});
 box(root,'CABIN_FOUNDATION',[5.8,.22,4.8],stone,[0,.11,0]);
 box(root,'TIMBER_FLOOR',[5.65,.14,4.65],trim,[0,.29,0]);
 for(let row=0;row<8;row++){
  const y=.48+row*.255,m=boards[row%3];
  box(root,'REAR_BOARD',[5.6,.247,.16],m,[0,y,2.28]);
  for(const side of [-1,1])box(root,'SIDE_BOARD',[.16,.247,4.55],m,[side*2.72,y,0]);
  if(row<7)for(const side of [-1,1])box(root,'FRONT_BOARD',[2.17,.247,.16],m,[side*1.72,y,-2.28]);
  else box(root,'DOOR_HEADER_BOARD',[5.6,.247,.16],m,[0,y,-2.28]);
 }
 for(const x of [-2.73,2.73])for(const z of [-2.29,2.29])box(root,'CORNER_POST',[.21,2.19,.21],trim,[x,1.39,z]);
 for(const side of [-1,1]){
  const shape=new THREE.Shape();shape.moveTo(-2.8,0);shape.lineTo(2.8,0);shape.lineTo(0,1.05);shape.closePath();
  add(root,'TIMBER_GABLE',new THREE.ExtrudeGeometry(shape,{depth:.14,bevelEnabled:false}),boards[1],[0,2.42,side*2.3-.07]);
 }
 for(const side of [-1,1]){
  box(root,'PITCHED_ROOF',[3.2,.12,5],roof,[side*1.48,2.99,0],[0,0,-side*.355]);
  for(let row=0;row<5;row++){
   const x=side*(.28+row*.6),y=3.48-Math.abs(x)*.371;
   box(root,'SHINGLE_COURSE',[.027,.022,4.99],seam,[x,y+.07,0],[0,0,-side*.355]);
  }
  for(let seamIndex=0;seamIndex<7;seamIndex++)box(root,'SHINGLE_JOIN',[3.16,.013,.018],seam,[side*1.48,3.065,-2.1+seamIndex*.7],[0,0,-side*.355]);
  beam(root,'GABLE_BARGEBOARD',[0,3.54,side*2.47],[-2.98,2.44,side*2.47],.105,trim);
  beam(root,'GABLE_BARGEBOARD',[0,3.54,side*2.47],[2.98,2.44,side*2.47],.105,trim);
 }
 box(root,'ROOF_RIDGE_CAP',[.15,.13,5.04],trim,[0,3.51,0]);
 for(const side of [-1,1])window(root,side*1.7,1.5,-2.38,.74,.76,trim,glass);
 window(root,2.825,1.5,.45,.85,.8,trim,glass,true);
 for(const x of [-.62,.62])box(root,'ENTRY_FRAME',[.13,1.97,.19],trim,[x,1.3,-2.36]);
 box(root,'ENTRY_LINTEL',[1.36,.12,.19],trim,[0,2.28,-2.36]);
 door(root,1.08,1.84,[0,.36,-2.32],boards[0],brass);
 box(root,'ENTRY_STEP',[1.56,.16,.45],stone,[0,.16,-2.25]);
}

function tower(root){
 const stones=[material(0x78817d,.94),material(0x8b938d,.91),material(0x68736e,.95),material(0x93998c,.93)],dark=material(0x29383b,.9),wood=material(0x6d503a,.86),iron=material(0x42515a,.42,.7),moss=material(0x506d48,.96);
 cylinder(root,'TOWER_FOUNDATION',1.9,1.97,.3,stones[2],[0,.15,0],[0,0,0],12);
 cylinder(root,'STONE_FLOOR',1.67,1.72,.18,stones[0],[0,.39,0],[0,0,0],12);
 const segments=12;
 for(let row=0;row<9;row++)for(let i=0;i<segments;i++){
  const a=i/segments*Math.PI*2+(row%2?Math.PI/segments:0),x=Math.sin(a)*1.57,z=-Math.cos(a)*1.57;
  if(row<3&&z<-1.3&&Math.abs(x)<.82)continue;
  box(root,'WATCHTOWER_STONE',[.8,.575,.4],stones[(row+i)%stones.length],[x,.76+row*.59,z],[0,-a,0]);
 }
 for(const side of [-1,1])box(root,'ENTRY_JAMB',[.24,1.84,.49],stones[1],[side*.66,1.39,-1.56]);
 for(let i=0;i<5;i++){
  const a=Math.PI*(i+.5)/5;
  box(root,'ENTRY_ARCH_STONE',[.29,.32,.51],stones[i%4],[Math.cos(a)*.67,2.29+Math.sin(a)*.51,-1.56],[0,0,a-Math.PI/2]);
 }
 door(root,1.04,1.72,[0,.48,-1.64],wood,iron);
 for(const side of [-1,1]){
  box(root,'ARROW_SLIT_INSET',[.2,1.05,.025],dark,[side*.72,4.4,-1.765]);
  for(const sx of [-1,1])box(root,'ARROW_SLIT_CARVING',[.065,1.17,.09],stones[1],[side*.72+sx*.14,4.4,-1.8]);
  box(root,'ARROW_SLIT_SILL',[.39,.08,.14],stones[1],[side*.72,3.83,-1.8]);
 }
 cylinder(root,'BATTLEMENT_CORBEL',1.95,1.75,.26,stones[2],[0,6.02,0],[0,0,0],12);
 cylinder(root,'WATCH_PLATFORM',1.92,1.92,.16,wood,[0,6.23,0],[0,0,0],12);
 for(let i=0;i<12;i++){
  const a=i/12*Math.PI*2;
  box(root,'BATTLEMENT_MERLON',[.61,.63,.4],stones[i%4],[Math.sin(a)*1.67,6.63,-Math.cos(a)*1.67],[0,-a,0]);
 }
 for(const side of [-1,1])box(root,'WEATHERED_MOSS_PATCH',[.32,.08,.035],moss,[side*.89,1.02,-1.8],[0,0,side*.08]);
}

function stall(root){
 const wood=material(0x956641,.86),dark=material(0x513b31,.82),brass=material(0xb39c65,.37,.72),canvas=[material(0xd87950,.92),material(0xf0dec0,.94)],green=material(0x6a9954,.79),red=material(0xd86c4f,.67),yellow=material(0xe7b05b,.75),basket=material(0xb99768,.93);
 box(root,'STALL_PLINTH',[2.8,.12,2.02],dark,[0,.06,0]);
 for(const x of [-1.26,1.26])for(const z of [-.88,.88]){
  box(root,'MARKET_POST',[.13,2.42,.13],wood,[x,1.29,z]);
  box(root,'POST_FOOT_COLLAR',[.19,.16,.19],brass,[x,.22,z]);
  beam(root,'POST_BRACE',[x,1.92,z],[x-Math.sign(x)*.35,2.39,z],.065,dark);
 }
 for(const side of [-1,1])box(root,'CANOPY_RAIL',[2.72,.11,.11],dark,[0,2.44,side*.88]);
 for(let i=0;i<10;i++){
  const x=-1.5+i*.3;
  const section=new THREE.Shape();section.moveTo(-1.08,0);section.quadraticCurveTo(-.5,.16,0,.22);section.quadraticCurveTo(.5,.16,1.08,0);section.lineTo(1.08,-.04);section.quadraticCurveTo(0,.15,-1.08,-.04);section.closePath();
  const g=new THREE.ExtrudeGeometry(section,{depth:.295,bevelEnabled:false,curveSegments:10});
  add(root,'STRIPED_CANOPY',g,canvas[i%2],[x,2.52,0],[0,Math.PI/2,0]);
  for(const side of [-1,1]){
   const shape=new THREE.Shape();shape.moveTo(-.1475,0);shape.lineTo(.1475,0);shape.lineTo(.1475,-.13);shape.quadraticCurveTo(0,-.32,-.1475,-.13);shape.closePath();
   add(root,'SCALLOPED_CANOPY_EDGE',new THREE.ShapeGeometry(shape,10),new THREE.MeshStandardMaterial({color:canvas[i%2].color,roughness:.94,side:THREE.DoubleSide}),[x+.1475,2.5,side*1.08]);
  }
 }
 box(root,'MARKET_COUNTER',[2.62,.11,.72],wood,[0,1.04,-.68]);
 for(let i=0;i<11;i++)box(root,'COUNTER_FRONT_BOARD',[.226,.76,.08],wood,[-1.17+i*.234,.62,-.98]);
 for(const y of [.28,.91])box(root,'COUNTER_BOARD_RAIL',[2.62,.065,.06],dark,[0,y,-1.03]);
 for(let tray=0;tray<3;tray++){
  const x=(tray-1)*.76;
  box(root,'PRODUCE_TRAY',[.65,.055,.53],basket,[x,1.12,-.66]);
  for(const side of [-1,1])box(root,'WOVEN_TRAY_RIM',[.65,.14,.035],basket,[x,1.19,-.66+side*.25]);
  for(const side of [-1,1])box(root,'WOVEN_TRAY_RIM',[.035,.14,.5],basket,[x+side*.31,1.19,-.66]);
  for(let i=0;i<6;i++){
   const fruit=add(root,'MARKET_PRODUCE',new THREE.IcosahedronGeometry(.095,1),[red,yellow,green][tray],[x+(i%3-1)*.16,1.24+Math.floor(i/3)*.025,-.79+Math.floor(i/3)*.24]);
   fruit.scale.y=tray===1?.74:1;
  }
 }
 box(root,'REAR_MARKET_SHELF',[2.55,.09,.4],dark,[0,.68,.73]);
 box(root,'MARKET_SIGNBOARD',[.64,.26,.06],dark,[0,2.21,-.94]);
 for(const x of [-.19,0,.19])cylinder(root,'BRASS_SIGN_COIN',.06,.06,.018,brass,[x,2.21,-.984],[Math.PI/2,0,0],12);
}

function bunker(root){
 const concrete=material(0x607780,.87,.13),panel=material(0x344b58,.45,.65),dark=material(0x182b38,.64,.45),trim=material(0x94acb4,.28,.8),glass=material(0x348ca3,.2,.3,{emissive:0x1a5466,emissiveIntensity:.35}),glow=emissive(0x77e9db),amber=emissive(0xe8b26b);
 box(root,'BUNKER_FOUNDATION',[7,.18,5],dark,[0,.09,0]);
 box(root,'BUNKER_FLOOR',[6.7,.12,4.7],panel,[0,.24,0]);
 box(root,'REAR_CONCRETE_WALL',[6.64,2.43,.3],concrete,[0,1.55,2.25]);
 for(const side of [-1,1])box(root,'CONCRETE_SIDE_WALL',[.3,2.43,4.5],concrete,[side*3.17,1.55,0]);
 for(const side of [-1,1])box(root,'ENTRY_CONCRETE_WALL',[2.51,2.43,.3],concrete,[side*2.06,1.55,-2.25]);
 box(root,'ENTRY_HEADER',[1.62,.34,.3],concrete,[0,2.6,-2.25]);
 box(root,'ARMOURED_ROOF',[6.86,.22,4.82],panel,[0,2.85,0]);
 for(const x of [-2.74,0,2.74])box(root,'ROOF_RAISED_RIB',[.13,.09,4.72],trim,[x,2.985,0]);
 for(const side of [-1,1]){
  for(let i=0;i<4;i++){
   box(root,'BUNKER_SIDE_PANEL',[.065,1.88,.89],panel,[side*3.335,1.55,-1.54+i*1.02]);
  }
  for(const z of [-1.88,-.1,1.88])box(root,'WALL_RIB',[.105,2.28,.12],trim,[side*3.37,1.55,z]);
  window(root,side*2.02,1.68,-2.44,1.37,.73,trim,glass);
  box(root,'WINDOW_ARMOURED_AWNING',[1.63,.1,.4],panel,[side*2.02,2.19,-2.47],[.12,0,0]);
  box(root,'COOLING_VENT_HOUSING',[1.21,.43,.14],dark,[side*2.02,.75,-2.44]);
  for(let i=0;i<5;i++)box(root,'COOLING_LOUVRE',[1.06,.035,.085],trim,[side*2.02,.59+i*.08,-2.54],[.35,0,0]);
  box(root,'ENTRY_ARMOURED_COLUMN',[.17,2.2,.31],dark,[side*.81,1.45,-2.41]);
  const rail=box(root,'ENTRY_ENERGY_RAIL',[.026,1.87,.025],glow,[side*.715,1.45,-2.58]);rail.userData.craftedPulse=.8;rail.userData.collisionDisabled=true;
  for(const y of [.42,2.57])for(const x of [1.34,2.71])cylinder(root,'PANEL_FASTENER',.028,.028,.025,trim,[side*x,y,-2.43],[Math.PI/2,0,0],6);
 }
 box(root,'ENTRY_UPPER_FRAME',[1.79,.14,.31],dark,[0,2.58,-2.41]);
 const leaf=new THREE.Group();leaf.name='door';leaf.position.set(0,.31,-2.31);root.add(leaf);
 for(const side of [-1,1]){
  box(leaf,'BUNKER_DOOR_PANEL',[.64,2.08,.12],panel,[side*.33,1.04,0]);
  box(leaf,'DOOR_RELIEF_PANEL',[.46,1.44,.035],dark,[side*.33,1.08,-.09]);
  box(leaf,'ENTRY_CAUTION_STRIPE',[.18,.035,.02],amber,[side*.34,.34,-.12],[0,0,side*.35]);
 }
 box(leaf,'DOOR_CENTER_GASKET',[.018,2.04,.025],trim,[0,1.04,-.08]);
 box(root,'ACCESS_PANEL',[.18,.29,.055],dark,[1,1.39,-2.53]);
 box(root,'ACCESS_STATUS_DISPLAY',[.12,.13,.012],glow,[1,1.43,-2.565]);
 box(root,'ENTRY_TREAD',[1.82,.12,.37],trim,[0,.23,-2.37]);
}

export function createCraftedBuildingModel(id){
 const info=CRAFTED_BUILDING_MODEL_INFO[id];if(!info)return null;
 const root=new THREE.Group();({'timber-cabin':cabin,'stone-tower':tower,'market-stall':stall,'sci-fi-bunker':bunker})[id](root);
 root.name=info[0];root.userData={craftedBuildingModel:true,builderObject:true,modelId:id,label:info[0],description:info[1],dimensions:[...info[2]],behavior:id==='market-stall'?'talk':'door',interactive:true,animated:true};
 const bounds=new THREE.Box3().setFromObject(root);if(Number.isFinite(bounds.min.y))for(const child of root.children)child.position.y-=bounds.min.y;
 root.traverse(node=>{if(node.isMesh){node.castShadow=!node.userData.collisionDisabled;node.receiveShadow=true;node.userData.builderRoot=root;}});
 return finishGameItem(THREE,root);
}
export function updateCraftedBuildingModel(root,elapsed){
 if(!root?.userData?.craftedBuildingModel||root.userData.animationState?.enabled===false)return;
 const speed=Number(root.userData.animationState?.speed??1),time=(Number.isFinite(elapsed)?elapsed:0)*(Number.isFinite(speed)?Math.max(0,speed):1);
 root.traverse(node=>{if(node.userData.craftedPulse!==undefined&&node.material?.emissive)node.material.emissiveIntensity=node.userData.craftedPulse*(1+Math.sin(time*1.4)*.09);});
}
