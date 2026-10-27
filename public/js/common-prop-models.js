import * as THREE from '../vendor/three/three.module.min.js';
import {bevelledBoxGeometry,finishGameItem} from './game-item-finish.js';

// Metre-scaled native props. Every surface is geometry, so the same asset works
// in gameplay, the editor, market previews and headless asset exports.
export const COMMON_PROP_MODEL_INFO=Object.freeze({
 'quest-scroll':['Quest Scroll','Rolled parchment, handwritten ink and a stamped wax quest seal.',[1,.3,.76]],
 'treasure-crystal':['Energy Crystal','Cut cyan crystal shards held in a machined luminous plinth.',[.98,1.32,.98]],
 'healing-potion':['Healing Potion','Rose restorative in a glass flask with brass fittings and a healing emblem.',[.7,1,.7]],
 'supply-crate':['Supply Crate','Individual timber boards, reinforced corners, iron straps and recessed handles.',[1.1,1,1.1]],
 'treasure-chest':['Treasure Chest','An arched oak chest with fitted brass bands, rivets and a keyhole lock.',[1.2,.8,.7]],
 'lever-switch':['Lever Switch','A pivoting brass control lever with a guarded base and luminous status lamps.',[.8,1.1,.5]],
 'mana-potion':['Azure Healing Elixir','A blue restorative flask with an inset crystal stopper and silver fittings.',[.7,1,.7]],
 'crystal-cluster':['Amethyst Crystal Cluster','A cluster of faceted amethyst shards on a weathered mineral base.',[1.16,1.42,1.06]],
 'reinforced-crate':['Reinforced Supply Crate','A sealed expedition crate with metal armour, amber clasps and corner protectors.',[1.1,1,1.1]],
 'relic-chest':['Astral Relic Chest','A midnight chest with silver arc bands, a crystal lock and illuminated inlays.',[1.2,.8,.7]]
});
const behaviors={'quest-scroll':'quest','treasure-crystal':'pickup','healing-potion':'heal','supply-crate':'pickup','treasure-chest':'pickup','lever-switch':'door','mana-potion':'heal','crystal-cluster':'pickup','reinforced-crate':'pickup','relic-chest':'pickup'};
const colors={'quest-scroll':'#e0bc72','treasure-crystal':'#63eaff','healing-potion':'#ff5ba7','supply-crate':'#9a6539','treasure-chest':'#b88a49','lever-switch':'#d5b34c','mana-potion':'#55bfff','crystal-cluster':'#ba85ff','reinforced-crate':'#637d89','relic-chest':'#947cff'};
export const COMMON_PROP_ITEMS=Object.freeze(Object.entries(COMMON_PROP_MODEL_INFO).map(([id,[name,description,dimensions]])=>Object.freeze({
 id,name,description,dimensions,buildAssetId:id,image:'public/images/native-upgrades/'+id+'.svg',type:['supply-crate','reinforced-crate'].includes(id)?'interior':'interactive',category:['supply-crate','reinforced-crate'].includes(id)?'props':'interactive',behavior:behaviors[id],color:colors[id],icon:id.includes('potion')?'🧪':id.includes('crystal')?'💎':id.includes('chest')?'🧰':id==='quest-scroll'?'📜':id==='lever-switch'?'🎚️':'📦',procedural:true,assetKind:'premade',size:72,
 animation:'shimmer',
 function_data:{behavior:behaviors[id],prompt:id==='quest-scroll'?'Read quest':id==='lever-switch'?'Use lever':behaviors[id]==='heal'?'Drink '+name:'Collect '+name}
})));
const mat=(color,roughness=.65,metalness=.05,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
const add=(root,geometry,material,position=[0,0,0],rotation=[0,0,0],name='')=>{
 const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.name=name;root.add(mesh);return mesh;
};
const block=(root,size,material,position,rotation=[0,0,0],name='')=>add(root,bevelledBoxGeometry(THREE,...size,.025),material,position,rotation,name);
const tube=(root,points,radius,material,name='')=>add(root,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,radius,6,false),material,[0,0,0],[0,0,0],name);
const ring=(root,radius,tubeRadius,material,position,rotation=[Math.PI/2,0,0],name='')=>add(root,new THREE.TorusGeometry(radius,tubeRadius,8,40),material,position,rotation,name);
const cylinder=(root,top,bottom,height,material,position,segments=20,rotation=[0,0,0],name='')=>add(root,new THREE.CylinderGeometry(top,bottom,height,segments),material,position,rotation,name);
const glow=(color,intensity=.7)=>mat(color,.24,.28,{emissive:color,emissiveIntensity:intensity});
function pulse(mesh,intensity=.7,phase=0){mesh.userData.propPulse={intensity,phase};mesh.userData.collisionDisabled=true;return mesh;}
function rivet(root,x,y,z,material,r=.018){return add(root,new THREE.SphereGeometry(r,8,6),material,[x,y,z],[0,0,0],'FORGED_RIVET');}

function crate(root,reinforced){
 const timber=[mat(reinforced?0x37515a:0x885734,.83),mat(reinforced?0x425f69:0xa06a3e,.86),mat(reinforced?0x4a646d:0x95613a,.82)],iron=mat(reinforced?0x26313d:0x3a3f42,.36,.78),edge=mat(reinforced?0x7a96a1:0x76776b,.34,.72),dark=mat(0x171e22,.9),accent=reinforced?glow(0xf6b84c,.55):mat(0xc2ab79,.64,.28);
 block(root,[1.02,.91,1.02],dark,[0,.48,0]);
 // Separated boards retain real seams on all four sides, including the lid.
 for(let i=0;i<5;i++){
  const x=-.408+i*.204;
  for(const side of [-1,1])block(root,[.196,.85,.055],timber[i%3],[x,.49,side*.515]);
  for(const side of [-1,1])block(root,[.055,.85,.196],timber[(i+1)%3],[side*.515,.49,x]);
  block(root,[.196,.055,1.02],timber[i%3],[x,.95,0]);
 }
 for(const y of [.11,.85]){
  for(const side of [-1,1])block(root,[1.1,.095,.085],iron,[0,y,side*.508]);
  for(const side of [-1,1])block(root,[.085,.095,1.1],iron,[side*.508,y,0]);
 }
 for(const x of [-.36,.36]){
  for(const side of [-1,1])block(root,[.065,.9,.03],edge,[x,.5,side*.554]);
  block(root,[.065,.03,1.1],edge,[x,.985,0]);
  for(const y of [.13,.84])for(const side of [-1,1])rivet(root,x,y,side*.573,iron);
 }
 for(const side of [-1,1]){
  block(root,[.027,.17,.38],iron,[side*.555,.57,0]);
  block(root,[.036,.07,.25],dark,[side*.573,.57,0]);
  block(root,[.045,.03,.22],edge,[side*.581,.6,0]);
 }
 block(root,[.27,.18,.02],accent,[0,.49,-.554],[0,0,0],'SUPPLY_MANIFEST');
 for(let i=0;i<3;i++)block(root,[.16-i*.025,.012,.009],dark,[0,.53-i*.038,-.57]);
 if(reinforced){
  for(const x of [-.49,.49])for(const z of [-.49,.49]){
   block(root,[.13,.22,.13],edge,[x,.15,z]);block(root,[.13,.15,.13],edge,[x,.895,z]);
  }
  for(const x of [-.27,.27])block(root,[.11,.15,.07],accent,[x,.77,-.566],[0,0,0],'EXPEDITION_CLASP');
 }else{
  // Diagonal timber brace and shallow grain marks make the silhouette legible.
  block(root,[.09,.92,.034],timber[2],[0,.49,-.558],[0,0,-.74]);
  for(let i=0;i<5;i++)block(root,[.075,.004,.003],timber[(i+1)%3],[-.4+i*.2,.34+(i%2)*.22,-.546]);
 }
}

function chest(root,relic){
 const wood=mat(relic?0x202d4a:0x7e4829,.72,.08),boards=[wood,mat(relic?0x29365b:0x9d6438,.75,.06)],metal=mat(relic?0xaebed4:0xc29a53,.3,.76),dark=mat(0x1b2027,.66,.35),lit=glow(relic?0x9a79ff:0xdbc68b,.5);
 block(root,[1.16,.44,.66],dark,[0,.26,0]);
 for(let i=0;i<6;i++)for(const side of [-1,1])block(root,[.186,.37,.04],boards[i%2],[-.474+i*.1896,.28,side*.333]);
 for(const side of [-1,1])block(root,[.04,.37,.62],wood,[side*.584,.28,0]);
 for(const y of [.08,.48])for(const side of [-1,1])block(root,[1.2,.055,.045],metal,[0,y,side*.327]);
 const lid=new THREE.Group();lid.name='ARCHED_CHEST_LID';lid.position.set(0,.49,0);root.add(lid);
 const profile=new THREE.Shape();profile.moveTo(-.35,0);
 for(let i=0;i<=24;i++){const a=Math.PI-i/24*Math.PI;profile.lineTo(Math.cos(a)*.35,Math.sin(a)*.29);}
 profile.lineTo(-.35,0);profile.closePath();
 const geometry=new THREE.ExtrudeGeometry(profile,{depth:1.18,steps:1,bevelEnabled:true,bevelSize:.008,bevelThickness:.006,bevelSegments:1});geometry.translate(0,0,-.59);
 add(lid,geometry,wood,[0,0,0],[0,Math.PI/2,0],'CURVED_WOODEN_LID');
 // Scored lid planks and continuous curved metal bands.
 for(let i=1;i<7;i++){const a=i/7*Math.PI,z=Math.cos(a)*.352,y=Math.sin(a)*.292;block(lid,[1.16,.008,.009],dark,[0,y,z]);}
 for(const x of [-.39,.39]){
  const points=[];for(let i=0;i<=24;i++){const a=i/24*Math.PI;points.push([x,Math.sin(a)*.3,Math.cos(a)*.36]);}
  tube(lid,points,.026,metal,'CURVED_CHEST_BAND');
  for(const side of [-1,1]){block(root,[.065,.37,.035],metal,[x,.28,side*.36]);for(const y of [.15,.4])rivet(root,x,y,side*.382,dark);}
  for(const side of [-1,1])rivet(lid,x,.12,side*.33,dark,.015);
 }
 for(const side of [-1,1])ring(root,.08,.014,metal,[side*.61,.3,0],[0,Math.PI/2,0],'CHEST_CARRY_RING');
 block(root,[.19,.22,.065],metal,[0,.43,-.385],[0,0,0],'CHEST_LOCK');
 if(relic){
  const gem=add(root,new THREE.OctahedronGeometry(.072,0),lit,[0,.44,-.43],[0,0,0],'RELIC_LOCK_CRYSTAL');gem.scale.set(.75,1.15,.35);pulse(gem,.55,.8);
  for(const x of [-.18,.18])pulse(block(root,[.075,.018,.014],lit,[x,.26,-.366],[0,0,x<0?-.5:.5]),.5,x);
 }else{
  add(root,new THREE.CircleGeometry(.025,16),dark,[0,.46,-.422],[0,Math.PI,0],'KEYHOLE');
  block(root,[.019,.045,.006],dark,[0,.43,-.422]);
 }
}

function potion(root,blue){
 const brass=mat(blue?0x9bbed0:0xd4ac66,.26,.78),cork=mat(0x785137,.96),dark=mat(0x293644,.61,.3),color=blue?0x449fff:0xf63f8e;
 const glass=new THREE.MeshPhysicalMaterial({color:blue?0xc7eaff:0xf9e1f0,roughness:.12,metalness:0,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide,clearcoat:1,clearcoatRoughness:.12});
 const outline=[[0,.015],[.13,.015],[.25,.045],[.32,.16],[.35,.35],[.31,.53],[.22,.65],[.12,.71],[.12,.85],[.145,.86],[.145,.9],[.11,.91]];
 add(root,new THREE.LatheGeometry(outline.map(p=>new THREE.Vector2(...p)),32),glass,[0,0,0],[0,0,0],'GLASS_FLASK');
 const liquid=glow(color,.65);liquid.transparent=true;liquid.opacity=.88;liquid.depthWrite=false;
 const body=add(root,new THREE.SphereGeometry(.3,24,16),liquid,[0,.3,0],[0,0,0],'RESTORATIVE_LIQUID');body.scale.set(1,.77,1);pulse(body,.65,blue?1:0);
 cylinder(root,.255,.255,.01,liquid,[0,.44,0],32,[0,0,0],'LIQUID_SURFACE');
 ring(root,.132,.018,brass,[0,.85,0]);ring(root,.128,.015,brass,[0,.72,0]);
 cylinder(root,.115,.112,.11,cork,[0,.93,0],18,[0,0,0],'FLASK_STOPPER');
 if(blue)add(root,new THREE.OctahedronGeometry(.065),glow(color,.6),[0,.98,0],[0,0,0],'CRYSTAL_STOPPER');
 else cylinder(root,.12,.12,.025,brass,[0,.99,0],20);
 ring(root,.31,.018,brass,[0,.25,0]);
 // A real inset emblem stays readable through the transparent flask.
 const badge=cylinder(root,.095,.095,.022,brass,[0,.34,-.323],20,[Math.PI/2,0,0],'POTION_BADGE');
 block(root,[.115,.035,.012],blue?dark:mat(0xffe2eb,.5),[0,.34,-.339]);block(root,[.035,.115,.012],blue?dark:mat(0xffe2eb,.5),[0,.34,-.339]);
 for(const x of [-.08,.08])rivet(root,x,.34,-.337,brass,.009);
 const neckChain=[];for(let i=0;i<9;i++){const a=Math.PI*.2+i*.075;neckChain.push([Math.cos(a)*.14,.74-i*.024,-.15-i*.012]);}tube(root,neckChain,.007,brass,'POTION_NECK_CHAIN');
 for(let i=0;i<3;i++){
  const bubble=add(root,new THREE.SphereGeometry(.018+i*.004,8,6),glow(blue?0xc4f5ff:0xffc1e1,.4),[(i-1)*.095,.22+i*.06,-.1],[0,0,0],'ELIXIR_BUBBLE');
  bubble.userData.propBubble={baseY:bubble.position.y,phase:i*1.8};bubble.userData.collisionDisabled=true;
 }
 badge.renderOrder=1;
}

function crystal(root,cluster){
 const stone=mat(cluster?0x3e3652:0x2c3d4d,.88,.16),metal=mat(cluster?0x756177:0x7a9ba9,.3,.74),color=cluster?0xae71ff:0x54d9f1,gemMat=mat(color,.2,.38,{flatShading:true,emissive:color,emissiveIntensity:.48});
 if(cluster){const base=add(root,new THREE.IcosahedronGeometry(.54,1),stone,[0,.1,0]);base.scale.set(1.04,.18,.94);}
 else{
  cylinder(root,.43,.49,.14,stone,[0,.07,0],24);cylinder(root,.42,.44,.045,metal,[0,.16,0],24);
  pulse(ring(root,.37,.018,glow(color,.9),[0,.187,0]),.9);
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2;block(root,[.04,.04,.12],metal,[Math.sin(a)*.39,.2,Math.cos(a)*.39],[0,a,0]);}
 }
 const shards=cluster?[[0,0,0,1.2,0],[-.32,.02,.06,.73,-.36],[.3,.02,.12,.83,.3],[.13,.02,-.29,.62,-.2],[-.18,.02,-.26,.51,.45]]:[[0,.18,0,1.08,0],[-.24,.16,.08,.52,-.28],[.24,.16,.08,.59,.32]];
 const floatGroup=new THREE.Group();floatGroup.name='FACETED_CRYSTALS';root.add(floatGroup);floatGroup.userData.propFloat={baseY:0,amplitude:cluster?.012:.022};
 for(const [x,y,z,height,tilt]of shards){
  const radius=height*.22,points=[[0,0],[radius*.66,.1*height],[radius,.32*height],[radius*.88,.72*height],[0,height]].map(p=>new THREE.Vector2(...p));
  const gem=add(floatGroup,new THREE.LatheGeometry(points,6),gemMat,[x,y+(cluster?.17:0),z],[0,tilt*.6,tilt],'CUT_CRYSTAL_SHARD');gem.userData.propPulse={intensity:.48,phase:x*2};
  // Darker facet shoes show how crystals are seated in their plinth.
  cylinder(root,radius*.6,radius*.75,.07,metal,[x,y+(cluster?.17:.0)+.025,z],6,[0,0,tilt]);
 }
}

function scroll(root){
 const parchment=mat(0xe4c68c,.94),edge=mat(0xc5a167,.9),ink=mat(0x6f533b,.94),wax=mat(0xb63d48,.57),gold=mat(0xc8a369,.42,.56);
 const shape=new THREE.Shape();shape.moveTo(-.4,-.32);shape.lineTo(.4,-.32);shape.bezierCurveTo(.37,-.13,.44,.1,.4,.32);shape.lineTo(-.4,.32);shape.bezierCurveTo(-.43,.1,-.37,-.1,-.4,-.32);shape.closePath();
 const paperGeo=new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:true,bevelThickness:.003,bevelSize:.004,bevelSegments:1});
 add(root,paperGeo,parchment,[0,.075,0],[-Math.PI/2,0,0],'PARCHMENT');
 for(const x of [-.43,.43]){
  cylinder(root,.065,.065,.71,edge,[x,.095,0],20,[Math.PI/2,0,0],'SCROLL_ROLL');
  for(const z of [-.355,.355]){
   cylinder(root,.073,.073,.025,gold,[x,.095,z],16,[Math.PI/2,0,0],'SCROLL_FINIAL');
   ring(root,.04,.008,parchment,[x,.095,z*1.045],[0,0,0]);
  }
 }
 for(let i=0;i<7;i++)block(root,[.39-(i%3)*.045,.004,.012],ink,[-.045,.094,-.23+i*.057]);
 block(root,[.55,.004,.014],gold,[0,.095,-.275]);
 for(const x of [-.3,.3])block(root,[.012,.004,.53],gold,[x,.095,0]);
 // Ribbon tails and a raised wax impression finish the quest seal.
 for(const x of [-.045,.045])block(root,[.05,.009,.17],wax,[.17+x,.105,.255],[0,x*2,0]);
 cylinder(root,.085,.09,.025,wax,[.17,.122,.17],20,[0,0,0],'WAX_QUEST_SEAL');
 ring(root,.056,.005,gold,[.17,.138,.17]);
 block(root,[.055,.005,.012],gold,[.17,.14,.17]);block(root,[.012,.005,.055],gold,[.17,.14,.17]);
}

function lever(root){
 const steel=mat(0x344551,.35,.72),trim=mat(0xd0ad61,.32,.76),dark=mat(0x15242c,.8),handle=mat(0x8a3b32,.52,.28),green=glow(0x6de8b0,.8),red=mat(0xac4346,.55,.3);
 block(root,[.8,.13,.5],steel,[0,.065,0]);block(root,[.64,.12,.38],trim,[0,.17,0]);
 for(const x of [-.31,.31])for(const z of [-.17,.17])rivet(root,x,.132,z,trim,.024);
 block(root,[.12,.04,.32],dark,[0,.25,0]);
 for(const x of [-.17,.17]){
  block(root,[.07,.24,.21],steel,[x,.34,0]);
  cylinder(root,.075,.075,.03,trim,[x*1.28,.41,0],20,[0,0,Math.PI/2],'LEVER_PIVOT_BOLT');
 }
 const pivot=new THREE.Group();pivot.name='CONTROL_LEVER_PIVOT';pivot.position.set(0,.41,0);pivot.rotation.x=-.34;root.add(pivot);
 cylinder(pivot,.028,.04,.5,trim,[0,.23,0],12,[0,0,0],'LEVER_SHAFT');
 cylinder(pivot,.07,.07,.25,handle,[0,.5,0],20,[0,0,Math.PI/2],'LEVER_GRIP');
 for(const x of [-.13,.13])cylinder(pivot,.073,.073,.02,steel,[x,.5,0],20,[0,0,Math.PI/2]);
 for(const x of [-.24,.24]){
  cylinder(root,.035,.035,.02,steel,[x,.25,-.08],16);
  const light=cylinder(root,.022,.022,.022,x<0?red:green,[x,.265,-.08],14);if(x>0)pulse(light,.8);
 }
 for(const x of [-.31,.31])tube(root,[[x,.26,.15],[x,.66,.15],[x*.65,.73,.15],[x*.45,.66,.15]],.017,steel,'LEVER_GUARD');
 block(root,[.17,.012,.055],trim,[0,.242,-.145]);
}

export function createCommonPropModel(id){
 const info=COMMON_PROP_MODEL_INFO[id];if(!info)return null;
 const root=new THREE.Group();
 if(id==='quest-scroll')scroll(root);
 else if(id==='treasure-crystal'||id==='crystal-cluster')crystal(root,id==='crystal-cluster');
 else if(id==='healing-potion'||id==='mana-potion')potion(root,id==='mana-potion');
 else if(id==='supply-crate'||id==='reinforced-crate')crate(root,id==='reinforced-crate');
 else if(id==='treasure-chest'||id==='relic-chest')chest(root,id==='relic-chest');
 else lever(root);
 root.name=info[0];root.userData={builderObject:true,modelId:id,commonPropModel:true,label:info[0],description:info[1],dimensions:[...info[2]],behavior:behaviors[id],interactive:true,animated:true};
 // Ground against actual authored surfaces, including thin finials and feet.
 const bounds=new THREE.Box3().setFromObject(root);if(Number.isFinite(bounds.min.y))for(const child of root.children)child.position.y-=bounds.min.y;
 root.traverse(node=>{if(node.userData.propFloat)node.userData.propFloat.baseY=node.position.y;if(node.userData.propBubble)node.userData.propBubble.baseY=node.position.y;if(node.isMesh){node.userData.builderRoot=root;node.castShadow=!node.userData.collisionDisabled;node.receiveShadow=true;}});
 return finishGameItem(THREE,root);
}

export function updateCommonPropModel(root,elapsed){
 if(!root?.userData?.commonPropModel)return;
 const state=root.userData,animation=state.animationState||{},enabled=state.animationEnabled!==false&&animation.enabled!==false;
 if(!enabled)return;
 const time=Number.isFinite(elapsed)?elapsed*(Number.isFinite(animation.speed)?Math.max(0,animation.speed):1):0;
 root.traverse(node=>{
  const pulse=node.userData.propPulse,float=node.userData.propFloat,bubble=node.userData.propBubble;
  if(pulse&&node.material?.emissive)node.material.emissiveIntensity=pulse.intensity*(1+(enabled?Math.sin(time*1.6+pulse.phase)*.13:0));
  if(float)node.position.y=float.baseY+(enabled?Math.sin(time*1.2)*float.amplitude:0);
  if(bubble)node.position.y=bubble.baseY+(enabled?Math.sin(time*1.8+bubble.phase)*.035:0);
 });
}
