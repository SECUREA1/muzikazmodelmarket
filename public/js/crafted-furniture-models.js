import * as THREE from '../vendor/three/three.module.min.js';
import {bevelledBoxGeometry,finishGameItem} from './game-item-finish.js';

// Authored counterparts to the original starter-library silhouettes. Materials,
// fitted seams and construction details are geometry and need no downloaded maps.
export const CRAFTED_FURNITURE_MODEL_INFO=Object.freeze({
 'canopy-tree':['Canopy Tree','A spreading shade tree with flared roots, branched timber and layered leaf crowns.',[3.8,5.2,3.8]],
 'pine-tree':['Pine Tree','A textured evergreen with layered needle boughs and a bark-covered trunk.',[2.8,5.8,2.8]],
 'flower-bed':['Flower Bed','A bordered garden bed filled with leafy stems and individual coloured flowers.',[2.4,.35,1.2]],
 'hedge-corner':['Hedge Corner','A clipped evergreen corner with a timber edging and dense, varied foliage.',[2.4,1.05,2.4]],
 'garden-rocks':['Garden Rocks','Layered, weathered garden stones with pale mineral seams and small moss patches.',[2.1,.75,1.5]],
 pond:['Reflecting Pond','A stone-edged ornamental pond with water ripples, reeds and floating water lilies.',[3.4,.22,2.5]],
 'path-tile':['Path Tile','Eight fitted slate pavers set into a chamfered stone border.',[2.2,.12,1.2]],
 hill:['Soft Hill','A grassy mound with exposed stone, low meadow plants and a walkable rounded surface.',[4.2,1.25,3.6]],
 'lamp-post':['Lamp Post','A cast-metal street lantern with brass trim, glazed panels and a warm luminous core.',[.55,3.4,.55]],
 planter:['Tall Planter','A fluted ceramic vessel with a brass foot and a layered leafy ornamental plant.',[.85,1.45,.85]],
 'pillow-ring':['Pillow Ring Seat','An upholstered floor cushion with stitched panels, piping and a recessed centre seat.',[1.5,.42,1.5]],
 sofa:['Cloud Sofa','A tailored three-seat sofa with fitted cushions, piped seams and walnut legs.',[2.15,.9,.92]],
 armchair:['Accent Chair','A tailored lounge chair with upholstered cushions, rounded arms and walnut legs.',[.9,1.02,.9]],
 'coffee-table':['Coffee Table','A joinery-built walnut table with inset top panels, a lower shelf and brass feet.',[1.25,.46,.72]],
 bookshelf:['Bookshelf','A walnut bookcase with fitted shelves, individual bound books and a ceramic ornament.',[1.2,2.05,.38]],
 'floor-lamp':['Floor Lamp','A sculpted standing lamp with a brass stem, pleated fabric shade and warm diffuser.',[.62,1.75,.62]],
 'room-divider':['Room Divider','A framed timber screen with chamfered vertical slats, brass joints and stable feet.',[1.8,2,.18]],
 'kitchen-island':['Kitchen Island','An inset-panel island with stone worktop, metal sink, curved tap and cabinet handles.',[2.1,.94,.9]],
 'spiral-stairs':['Spiral Stairs','Timber wedge treads and a continuous handrail around a machined central column.',[2.1,2.8,2.1]],
 archway:['Archway','Block-built limestone pillars and an arched passage with a contrasting carved keystone.',[2.4,2.8,.5]],
 'art-wall':['Art Wall','A gallery wall with a walnut and brass frame around a layered geometric composition.',[2.2,2.15,.18]],
 campfire:['Campfire','Charred split logs, glowing embers and layered animated flames in a ring of weathered stone.',[1.05,1.05,1.05]],
 'green-bubbles':['Green Bubble Field','A brass-trimmed healing plinth with luminous channels and rising green alchemy bubbles.',[1.6,1.6,1.6]]
});
const seats=new Set(['pillow-ring','sofa','armchair']),landscape=new Set(['canopy-tree','pine-tree','flower-bed','hedge-corner','garden-rocks','pond','path-tile','hill','lamp-post','planter']);
const colors={'canopy-tree':'#4e8d53','pine-tree':'#2e6951','flower-bed':'#df7a9d','hedge-corner':'#48825a','garden-rocks':'#919a91',pond:'#55afc8','path-tile':'#939c9b',hill:'#679456','lamp-post':'#d1b370',planter:'#83b18b','pillow-ring':'#4bafa6',sofa:'#73aabb',armchair:'#c78271','coffee-table':'#926740',bookshelf:'#926740','floor-lamp':'#e2c991','room-divider':'#a17b4d','kitchen-island':'#567a7b','spiral-stairs':'#af855b',archway:'#c9bd9e','art-wall':'#dc8197',campfire:'#ff924c','green-bubbles':'#9ee979'};
export const CRAFTED_FURNITURE_ITEMS=Object.freeze(Object.entries(CRAFTED_FURNITURE_MODEL_INFO).map(([id,[name,description,dimensions]])=>({
 id,buildAssetId:id,name,description,dimensions,color:colors[id],image:`public/images/native-upgrades/${id}.svg`,procedural:true,assetKind:'premade',size:78,
 type:landscape.has(id)?'landscape':['campfire','green-bubbles'].includes(id)?'interactive':'interior',category:landscape.has(id)?'landscape':['campfire','green-bubbles'].includes(id)?'interactive':'interior',
 behavior:seats.has(id)?'seat':id==='campfire'?'talk':id==='green-bubbles'?'heal':'decor',animation:'crafted-idle',
 ...(seats.has(id)?{function_data:{seatOffset:[0,id==='pillow-ring'?.38:.56,0],exitOffset:[1.15,0,0]}}:{})
})));
const mat=(color,roughness=.65,metalness=.05,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
const luminous=(color,intensity=.75)=>mat(color,.26,.12,{emissive:color,emissiveIntensity:intensity});
const add=(root,geo,material,pos=[0,0,0],rot=[0,0,0],name='')=>{const node=new THREE.Mesh(geo,material);node.position.set(...pos);node.rotation.set(...rot);node.name=name;root.add(node);return node;};
const box=(root,size,material,pos,rot=[0,0,0],name='')=>add(root,bevelledBoxGeometry(THREE,...size,.035),material,pos,rot,name);
const cylinder=(root,r1,r2,h,material,pos,segments=16,rot=[0,0,0],name='')=>add(root,new THREE.CylinderGeometry(r1,r2,h,segments),material,pos,rot,name);
const sphere=(root,r,material,pos,scale=[1,1,1],name='')=>{const node=add(root,new THREE.SphereGeometry(r,14,10),material,pos,[0,0,0],name);node.scale.set(...scale);return node;};
const tube=(root,points,r,material,name='',closed=false)=>add(root,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v)),closed),Math.max(12,points.length*3),r,6,closed),material,[0,0,0],[0,0,0],name);
const ring=(root,r,t,material,pos,rot=[Math.PI/2,0,0],name='')=>add(root,new THREE.TorusGeometry(r,t,8,40),material,pos,rot,name);
function branch(root,a,b,r1,r2,material,name='TIMBER_BRANCH'){
 const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),d=to.clone().sub(from),node=cylinder(root,r2,r1,d.length(),material,from.add(to).multiplyScalar(.5).toArray(),10,[0,0,0],name);
 node.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return node;
}
function pulse(node,base=.75,phase=0){node.userData.craftedPulse={base,phase};return node;}
function sway(node,phase=0,strength=.025){node.userData.craftedSway={base:node.rotation.z,phase,strength};return node;}
function textureLines(root,width,y,z,material,count=6){for(let i=0;i<count;i++)box(root,[width*(.38+(i%3)*.14),.003,.004],material,[(i%2?1:-1)*width*.13,y+i*.018,z]);}

function tree(root,pine){
 const bark=mat(pine?0x654638:0x71503a,.95),ridge=mat(pine?0x3f3029:0x493928,.97),leaves=[mat(0x215943,.89),mat(pine?0x34765b:0x4d8a53,.86),mat(pine?0x44896a:0x6a9f59,.87)];
 cylinder(root,.14,.32,pine?3.1:2.65,bark,[0,pine?1.55:1.325,0],12);
 for(let i=0;i<7;i++){
  const a=i/7*Math.PI*2;
  branch(root,[Math.sin(a)*.16,.36,Math.cos(a)*.16],[Math.sin(a)*.55,.07,Math.cos(a)*.55],.13,.035,bark,'FLARED_TREE_ROOT');
  branch(root,[Math.sin(a)*.22,.18,Math.cos(a)*.22],[Math.sin(a)*.15,2.5,Math.cos(a)*.15],.025,.012,ridge,'BARK_RIDGE');
 }
 if(pine){
  for(let level=0;level<7;level++){
   const radius=1.35-level*.17,y=1.65+level*.56;
   const bough=new THREE.Group();bough.position.y=y;root.add(bough);sway(bough,level*.7,.014);
   for(let i=0;i<2;i++)add(bough,new THREE.ConeGeometry(radius*(i?.86:1),1.4,12,1),leaves[(level+i)%3],[0,i*.22,0],[0,level*.39+i*.12,0],'LAYERED_NEEDLE_BOUGH');
   for(let i=0;i<4;i++){const a=i/4*Math.PI*2+level*.45;branch(root,[0,y-.25,0],[Math.cos(a)*radius*.78,y-.35,Math.sin(a)*radius*.78],.035,.012,bark);}
  }
 }else{
  const crowns=[[0,4.35,0,1.15],[-.85,3.7,.1,.95],[.8,3.85,.3,1.05],[.2,3.65,-.9,.95],[-.6,4.25,-.65,.85],[.6,4.5,-.4,.9],[0,3.8,.9,.85]];
  crowns.forEach(([x,y,z,r],i)=>{
   branch(root,[0,1.85+i*.09,0],[x*.85,y-.4,z*.85],.12,.045,bark);
   const crown=add(root,new THREE.IcosahedronGeometry(r,2),leaves[i%3],[x,y,z],[0,i*.83,.12],'LAYERED_LEAF_CROWN');crown.scale.y=.83;sway(crown,i*.8,.018);
   if(i<4)sphere(root,r*.45,leaves[(i+1)%3],[x+r*.37,y-.3,z+r*.12],[1,.7,1],'LEAF_EDGE_CLUSTER');
  });
 }
}

function flower(root,pos,color,index=0){
 const green=mat(0x3c7d42,.88),stem=new THREE.Group();stem.position.set(...pos);root.add(stem);sway(stem,index*.7,.035);
 cylinder(stem,.009,.012,.22,green,[0,.11,0],6);for(const s of [-1,1]){const leaf=sphere(stem,.055,green,[s*.04,.13+s*.025,0],[1,.22,.45]);leaf.rotation.z=s*.55;}
 const petal=mat(color,.67),gold=mat(0xe8bf65,.76);
 for(let i=0;i<5;i++){const a=i*Math.PI*.4;sphere(stem,.038,petal,[Math.cos(a)*.047,.235,Math.sin(a)*.047],[1,.38,1],'FLOWER_PETAL');}
 sphere(stem,.025,gold,[0,.248,0],[1,.45,1],'FLOWER_CENTRE');
}
function flowerBed(root){
 const frame=mat(0x9c8063,.88),soil=mat(0x3e3329,.98);
 box(root,[2.4,.11,1.2],frame,[0,.055,0]);box(root,[2.2,.04,1.01],soil,[0,.115,0]);
 for(const s of [-1,1])box(root,[2.4,.07,.075],frame,[0,.145,s*.56]);
 for(const s of [-1,1])box(root,[.075,.07,1.08],frame,[s*1.15,.145,0]);
 for(let i=0;i<15;i++)flower(root,[-.94+(i%5)*.47,.13,-.33+Math.floor(i/5)*.32],[0xe98fa4,0xf0c468,0xa19be2][i%3],i);
}
function hedge(root){
 const soil=mat(0x544233,.94),foliage=[mat(0x376246,.9),mat(0x4b8050,.92),mat(0x609256,.9)],edge=mat(0x9c8063,.84);
 for(const [size,pos]of [[[2.4,.12,.62],[0,.06,-.89]],[[.62,.12,1.85],[-.89,.06,.32]]])box(root,size,edge,pos);
 for(let i=0;i<10;i++){
  const x=i<6?-1+i*.4:-.9,z=i<6?-.89:-.5+(i-6)*.43;
  box(root,[.4,.7,.52],foliage[i%3],[x,.52,z]);
  for(let j=0;j<2;j++){const crown=add(root,new THREE.IcosahedronGeometry(.26,1),foliage[(i+j)%3],[x+(j-.5)*.13,.89,z],[0,i,0]);crown.scale.set(1,.6,1);}
  cylinder(root,.026,.04,.4,soil,[x,.22,z],6);
 }
}
function rocks(root){
 const stones=[mat(0x7d8986,.94),mat(0x9c9f92,.95),mat(0x667471,.93)],moss=mat(0x657d4c,.99),vein=mat(0xc1c4af,.88);
 const positions=[[-.56,.26,.12,.57],[.42,.21,.2,.49],[-.1,.34,-.3,.61],[.78,.11,-.3,.25],[-.85,.11,-.43,.25]];
 positions.forEach(([x,y,z,r],i)=>{
  const rock=add(root,new THREE.IcosahedronGeometry(r,1),stones[i%3],[x,y,z],[i*.17,i*.9,.08]);rock.scale.set(1,.68,.8);
  const patch=sphere(root,r*.43,moss,[x-r*.12,y+r*.5,z],[1,.12,.8],'GARDEN_MOSS');patch.rotation.z=.08;
  tube(root,[[x-r*.58,y+r*.28,z-r*.2],[x,y+r*.52,z],[x+r*.5,y+r*.25,z+r*.18]],.012,vein,'PALE_MINERAL_SEAM');
 });
}
function pond(root){
 const stone=[mat(0x7f8d87,.91),mat(0x929d91,.94)],soil=mat(0x3b534a,.96),water=mat(0x2e93ad,.18,.3,{transparent:true,opacity:.83}),green=mat(0x4f8553,.86),reed=mat(0x9da76f,.87),ripple=mat(0x99d4d8,.25,.12,{transparent:true,opacity:.4});
 const basin=cylinder(root,1.45,1.5,.1,soil,[0,.05,0],48);basin.scale.z=.72;
 const surface=add(root,new THREE.CircleGeometry(1.42,64),water,[0,.12,0],[-Math.PI/2,0,0],'POND_WATER_SURFACE');surface.scale.y=.71;surface.userData.craftedWater={opacity:.83};surface.userData.collisionDisabled=true;
 for(let i=0;i<22;i++){
  const a=i/22*Math.PI*2,node=add(root,new THREE.IcosahedronGeometry(.19,1),stone[i%2],[Math.cos(a)*1.5,.11,Math.sin(a)*1.06],[i*.23,i*.56,0],'POND_EDGE_STONE');node.scale.set(1.1,.55,.84);
 }
 for(let i=0;i<3;i++){
  const node=ring(root,.22+i*.14,.005,ripple,[.18,.126+i*.001,-.1],[Math.PI/2,0,0],'POND_RIPPLE');node.scale.y=.74;node.userData.craftedRipple={base:1,phase:i*1.2};node.userData.collisionDisabled=true;
 }
 for(let i=0;i<9;i++){
  const x=-1.05+(i%3)*.12,z=-.55+Math.floor(i/3)*.12,height=.26+(i%3)*.12;
  const stalk=cylinder(root,.008,.013,height,reed,[x,.13+height/2,z],6);stalk.rotation.z=(i-4)*.025;sway(stalk,i*.6,.018);
 }
 for(const [x,z]of [[.65,.34],[.87,.15]]){
  const pad=add(root,new THREE.CircleGeometry(.18,16,0,Math.PI*1.85),green,[x,.129,z],[-Math.PI/2,0,0],'LILY_PAD');pad.userData.collisionDisabled=true;
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2;sphere(root,.04,mat(0xeab8c4,.7),[x+Math.sin(a)*.04,.158,z+Math.cos(a)*.04],[1,.5,1],'WATER_LILY_PETAL');}
 }
}
function pavers(root){
 const base=mat(0x64736f,.94),stones=[mat(0x939d94,.88),mat(0xa5aca0,.91),mat(0x84928b,.93)];
 box(root,[2.2,.075,1.2],base,[0,.0375,0]);
 for(let x=0;x<4;x++)for(let z=0;z<2;z++)box(root,[.518,.045,.542],stones[(x+z)%3],[-.813+x*.542,.0975,-.28+z*.56],[0,0,0],'FITTED_SLATE_PAVER');
}
function hill(root){
 const grass=mat(0x608c4e,.98),soil=mat(0x4d6543,.98),rock=mat(0x7e8a78,.95);
 const mound=add(root,new THREE.SphereGeometry(2.1,36,16,0,Math.PI*2,0,Math.PI/2),grass,[0,0,0],[0,0,0],'GRASS_MOUND');mound.scale.set(1,.59,.86);
 for(let i=0;i<11;i++){
  const a=i/11*Math.PI*2,r=1.5+(i%3)*.12,y=1.24*Math.sqrt(Math.max(0,1-r*r/4.41));
  const node=add(root,new THREE.IcosahedronGeometry(.11+(i%2)*.03,1),rock,[Math.cos(a)*r,y*.91,Math.sin(a)*r*.86]);node.scale.set(1,.52,.85);
 }
 for(let i=0;i<7;i++){
  const a=i*.9,r=.6+i*.12,y=1.24*Math.sqrt(1-r*r/4.41);
  const patch=sphere(root,.18,soil,[Math.cos(a)*r,y-.035,Math.sin(a)*r*.86],[1,.13,.7],'MEADOW_PATCH');patch.rotation.z=.1;
 }
}

function lamp(root,street){
 const black=mat(0x26353c,.34,.8),brass=mat(0xb69b65,.32,.76),lit=luminous(0xffdda2,1.25),dark=mat(0x17232a,.5,.6),glass=mat(0xffe8b8,.2,.15,{transparent:true,opacity:.28}),shade=mat(0xe8d8b3,.8,.02,{side:THREE.DoubleSide});
 cylinder(root,street?.18:.25,street?.235:.28,.11,black,[0,.055,0],32);
 cylinder(root,street?.13:.14,street?.17:.23,.055,brass,[0,.13,0],28);
 const stemH=street?2.45:1.21;cylinder(root,.035,street?.07:.043,stemH,black,[0,.16+stemH/2,0],16);
 for(const y of street?[.2,.37,2.55]:[.19,1.3])cylinder(root,.065,.065,.035,brass,[0,y,0],20);
 if(street){
  cylinder(root,.21,.24,.1,dark,[0,2.67,0],8);cylinder(root,.19,.17,.42,glass,[0,2.93,0],8);
  cylinder(root,.105,.13,.34,lit,[0,2.92,0],16,[0,0,0],'LANTERN_LUMINOUS_CORE');
  for(let i=0;i<8;i++){const a=i*Math.PI/4;cylinder(root,.012,.016,.49,black,[Math.cos(a)*.19,2.93,Math.sin(a)*.19],6);}
  cylinder(root,.12,.25,.19,black,[0,3.23,0],8);cylinder(root,.13,.13,.035,brass,[0,3.32,0],16);sphere(root,.05,brass,[0,3.39,0]);
 }else{
  const profile=[new THREE.Vector2(.31,0),new THREE.Vector2(.23,.38)],geo=new THREE.LatheGeometry(profile,40);add(root,geo,shade,[0,1.35,0],[0,0,0],'PLEATED_FABRIC_SHADE');
  for(let i=0;i<24;i++){const a=i*Math.PI/12;branch(root,[Math.cos(a)*.31,1.35,Math.sin(a)*.31],[Math.cos(a)*.23,1.73,Math.sin(a)*.23],.004,.003,mat(0xcdbd97,.85),'SHADE_PLEAT');}
  ring(root,.31,.012,brass,[0,1.35,0]);ring(root,.23,.009,brass,[0,1.73,0]);
  cylinder(root,.28,.28,.012,lit,[0,1.357,0],32,[0,0,0],'WARM_LAMP_DIFFUSER');sphere(root,.065,lit,[0,1.48,0],[1,1.4,1]);
 }
}
function planter(root){
 const ceramic=mat(0x567c77,.38,.12),band=mat(0xc7ae73,.35,.73),soil=mat(0x443a30,.97),leaf=[mat(0x3c7253,.81),mat(0x609669,.8)];
 const shape=[[.18,0],[.24,.03],[.29,.12],[.32,.54],[.34,.63],[.3,.65],[.275,.6]].map(p=>new THREE.Vector2(...p));
 add(root,new THREE.LatheGeometry(shape,32),ceramic,[0,.035,0],[0,0,0],'FLUTED_CERAMIC_PLANTER');
 cylinder(root,.22,.23,.035,band,[0,.0175,0],28);ring(root,.325,.012,band,[0,.66,0]);cylinder(root,.28,.28,.018,soil,[0,.64,0],24);
 for(let i=0;i<16;i++){const a=i*Math.PI/8;branch(root,[Math.cos(a)*.27,.15,Math.sin(a)*.27],[Math.cos(a)*.312,.57,Math.sin(a)*.312],.004,.006,band,'PLANTER_FLUTE');}
 for(let i=0;i<11;i++){
  const a=i*2.4,height=.5+(i%3)*.09,x=Math.sin(a)*.23,z=Math.cos(a)*.23;
  branch(root,[0,.65,0],[x,.65+height,z],.012,.007,leaf[0],'ORNAMENTAL_STEM');
  const blade=sphere(root,.19,leaf[i%2],[x,.73+height*.7,z],[.43,1.2,.14],'BROAD_PLANT_LEAF');blade.rotation.set(.2,a,-Math.sin(a)*.48);sway(blade,i*.6,.025);
 }
}

function cushionPiping(root,w,d,y,material,x=0,z=0){return tube(root,[[-w/2,y,-d/2],[w/2,y,-d/2],[w/2,y,d/2],[-w/2,y,d/2]],.008,material,'UPHOLSTERY_PIPING',true);}
function seating(root,chair){
 const fabric=mat(chair?0xc28371:0x7ba8b6,.9,.02),seam=mat(chair?0xe1b09a:0xb2d0d6,.92),shadow=mat(chair?0x9c6054:0x547d8b,.94),wood=mat(0x514030,.73,.08),brass=mat(0xb4a076,.35,.7),w=chair?.9:2.15,count=chair?1:3;
 for(const x of [-w*.4,w*.4])for(const z of [-.31,.31]){
  const leg=cylinder(root,.034,.025,.21,wood,[x,.105,z],10);leg.rotation.z=x>0?-.09:.09;cylinder(root,.029,.028,.035,brass,[x,.018,z],10);
 }
 box(root,[w-.05,.19,.82],shadow,[0,.28,0]);
 box(root,[w-.04,chair?.55:.44,.18],fabric,[0,chair?.72:.66,.34],[.075,0,0],'UPHOLSTERED_BACK_FRAME');
 for(let i=0;i<count;i++){
  const cw=(w-.3)/count,x=-w/2+.15+cw*(i+.5);
  box(root,[cw-.018,.18,.64],fabric,[x,.46,-.025],[0,0,0],'TAILORED_SEAT_CUSHION');
  const piping=cushionPiping(root,cw-.05,.6,.505,seam);piping.position.set(x,0,-.025);
  box(root,[cw-.018,chair?.42:.34,.15],fabric,[x,chair?.77:.72,.235],[.09,0,0],'FITTED_BACK_CUSHION');
  for(const dx of [-cw*.25,cw*.25])sphere(root,.009,seam,[x+dx,chair?.77:.72,.151],[1,1,.35],'UPHOLSTERY_TUFT');
 }
 for(const side of [-1,1]){
  box(root,[.15,.36,.83],fabric,[side*(w/2-.075),.52,0],[0,0,0],'PADDED_ARM');
  tube(root,[[side*(w/2-.015),.68,-.37],[side*(w/2-.015),.69,.05],[side*(w/2-.015),.67,.38]],.007,seam,'ARM_PIPING');
 }
}
function pillow(root){
 const fabric=mat(0x4f9d99,.91),accent=mat(0x9fcebe,.94),base=mat(0x315a5f,.94);
 cylinder(root,.63,.64,.1,base,[0,.05,0],40);
 const body=ring(root,.49,.245,fabric,[0,.23,0]);body.scale.z=.72;
 cylinder(root,.35,.4,.15,fabric,[0,.175,0],40);
 for(let i=0;i<12;i++){
  const a=i/12*Math.PI*2,points=[];
  for(let j=0;j<=8;j++){const r=.28+j*.052,y=.23+Math.sqrt(Math.max(0,.245*.245-(r-.49)*(r-.49)))*.72;points.push([Math.cos(a)*r,y,Math.sin(a)*r]);}
  tube(root,points,.004,accent,'STITCHED_CUSHION_PANEL');
 }
 ring(root,.69,.008,accent,[0,.28,0]);ring(root,.31,.007,accent,[0,.33,0]);
}
function table(root){
 const wood=mat(0x825a38,.66,.08),edge=mat(0x503b2c,.74),grain=mat(0xa17b4d,.8),metal=mat(0xbca272,.36,.71);
 box(root,[1.25,.075,.72],wood,[0,.4225,0]);box(root,[1.14,.045,.61],edge,[0,.367,0]);
 for(let i=0;i<3;i++)box(root,[.375,.012,.64],mat([0x8d633e,0x987047,0x805a3a][i],.72),[-.39+i*.39,.464,0]);
 for(const x of [-.51,.51])for(const z of [-.25,.25]){
  box(root,[.065,.36,.065],wood,[x,.18,z]);box(root,[.069,.04,.069],metal,[x,.02,z]);
 }
 box(root,[1.06,.045,.5],edge,[0,.16,0]);
 for(const z of [-.23,.23])box(root,[1.03,.055,.035],wood,[0,.34,z]);
 for(let i=0;i<3;i++)textureLines(root,.28,.472,-.2+i*.19,grain,2);
}
function bookshelf(root){
 const wood=mat(0x765337,.74),inner=mat(0x4d3d2e,.85),trim=mat(0xbe9e67,.38,.65),paper=mat(0xd6c9a8,.89),books=[mat(0x42665f,.78),mat(0xa05652,.78),mat(0x7b7195,.78),mat(0xc29b58,.81),mat(0x50738a,.8)];
 box(root,[1.2,2.05,.075],inner,[0,1.025,.145]);
 for(const side of [-1,1])box(root,[.075,2.05,.38],wood,[side*.5625,1.025,0]);
 box(root,[1.2,.09,.4],wood,[0,2.005,0]);box(root,[1.2,.1,.4],wood,[0,.05,0]);
 for(let row=0;row<4;row++){
  const y=.14+row*.45;box(root,[1.08,.045,.35],wood,[0,y,0]);box(root,[1.04,.015,.018],trim,[0,y+.01,-.18]);
  for(let i=0;i<7;i++){
   const width=.085+(i%2)*.015,height=.27+(i%3)*.035,x=-.445+i*.142;
   box(root,[width,height,.23],books[(i+row)%5],[x,y+.025+height/2,-.025],[0,0,0],'BOUND_BOOK');
   box(root,[width*.62,.009,.005],trim,[x,y+.08,-.143]);box(root,[width*.62,.009,.005],trim,[x,y+height-.015,-.143]);
   box(root,[width*.75,.006,.15],paper,[x,y+height+.027,-.013]);
  }
 }
}
function divider(root){
 const wood=mat(0x947047,.75),dark=mat(0x5e4933,.8),brass=mat(0xc0a368,.35,.74);
 for(const x of [-.85,.85])box(root,[.1,2,.18],dark,[x,1,0]);
 for(const y of [.08,1.92])box(root,[1.8,.12,.18],dark,[0,y,0]);
 for(let i=0;i<9;i++)box(root,[.085,1.75,.11],wood,[-.72+i*.18,1,0],[0,.22,0],'CHAMFERED_SCREEN_SLAT');
 for(const x of [-.85,.85])for(const y of [.12,1.88])box(root,[.11,.065,.19],brass,[x,y,0]);
}
function island(root){
 const cabinet=mat(0x527576,.59,.12),inset=mat(0x3c5d61,.68,.1),stone=mat(0xd9d8cb,.26,.05),metal=mat(0xa7b6b6,.24,.83),dark=mat(0x293d42,.73,.2);
 box(root,[1.96,.11,.76],dark,[0,.055,0]);box(root,[1.94,.68,.76],cabinet,[0,.45,0]);box(root,[2.1,.1,.9],stone,[0,.84,0]);
 for(const x of [-.63,0,.63])for(const side of [-1,1]){
  box(root,[.56,.57,.022],inset,[x,.47,side*.389],[0,0,0],'INSET_CABINET_PANEL');
  for(const dx of [-.257,.257])box(root,[.026,.57,.025],cabinet,[x+dx,.47,side*.404]);
  for(const y of [.196,.744])box(root,[.54,.028,.025],cabinet,[x,y,side*.404]);
  box(root,[.17,.017,.026],metal,[x,.65,side*.428],[0,0,0],'CABINET_PULL');
 }
 box(root,[.55,.018,.4],metal,[.52,.895,0]);box(root,[.45,.02,.3],dark,[.52,.905,0]);box(root,[.38,.012,.23],metal,[.52,.914,0]);
 tube(root,[[.78,.89,.18],[.78,1.1,.18],[.74,1.17,.17],[.58,1.17,.16],[.53,1.1,.16]],.018,metal,'CURVED_KITCHEN_TAP');
 cylinder(root,.02,.024,.07,metal,[.9,.93,.17],10);
 for(let i=0;i<4;i++)box(root,[.27,.003,.009],mat(0xc0c4b6,.43),[-.7+i*.08,.892,-.2+i*.06],[0,.13,0],'STONE_WORKTOP_VEIN');
}
function stairs(root){
 const steel=mat(0x50626b,.33,.78),wood=mat(0x9d7850,.68,.08),brass=mat(0xc5ad7a,.38,.66);
 cylinder(root,.065,.09,2.8,steel,[0,1.4,0],20);cylinder(root,.17,.21,.08,steel,[0,.04,0],24);
 const rail=[];
 for(let i=0;i<15;i++){
  const a=i/14*Math.PI*2.12,y=.09+i*.13;
  const shape=new THREE.Shape();shape.moveTo(Math.cos(a-.13)*.12,Math.sin(a-.13)*.12);shape.lineTo(Math.cos(a-.13)*.92,Math.sin(a-.13)*.92);shape.absarc(0,0,.92,a-.13,a+.18,false);shape.lineTo(Math.cos(a+.18)*.12,Math.sin(a+.18)*.12);shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:.06,steps:1,bevelEnabled:true,bevelThickness:.006,bevelSize:.009,bevelSegments:1});
  add(root,geo,wood,[0,y+.06,0],[Math.PI/2,0,0],'WEDGE_TIMBER_TREAD');
  // Shape lies in local XY; rotating X maps its radial second axis into Z.
  const x=Math.cos(a)*.9,z=Math.sin(a)*.9;
  cylinder(root,.014,.018,.84,steel,[x,y+.45,z],7,[0,0,0],'STAIR_BALUSTER');
  rail.push([x,y+.87,z]);cylinder(root,.075,.075,.045,brass,[0,y,0],16);
 }
 tube(root,rail,.028,brass,'CONTINUOUS_SPIRAL_HANDRAIL');
}
function arch(root){
 const stone=[mat(0xc6bea7,.88),mat(0xb4ad98,.93),mat(0xd6cdb4,.88)],base=mat(0x9b9e8e,.92);
 for(const side of [-1,1]){
  box(root,[.52,.14,.5],base,[side*.94,.07,0]);
  for(let i=0;i<6;i++)box(root,[.43,.28,.47],stone[i%2],[side*.94,.3+i*.29,0],[0,0,0],'LIMESTONE_PIER_BLOCK');
  box(root,[.51,.13,.5],stone[2],[side*.94,1.98,0]);
 }
 for(let i=0;i<13;i++){
  const a=i/12*Math.PI,node=box(root,[.28,.37,.48],stone[i===6?2:i%2],[Math.cos(a)*.94,1.98+Math.sin(a)*.64,0],[0,0,a-Math.PI/2],i===6?'CARVED_ARCH_KEYSTONE':'ARCH_VOUSSOIR');
  if(i===6)for(const z of [-.247,.247])box(root,[.09,.12,.012],base,[0,2.64,z],[0,0,Math.PI/4],'KEYSTONE_INLAY');
 }
}
function artWall(root){
 const plaster=mat(0xd7d9cc,.96),wood=mat(0x5d4538,.6),gold=mat(0xbda16b,.32,.7),canvas=mat(0x263e52,.92),pink=mat(0xd17d89,.72),teal=mat(0x66b4ae,.7),cream=mat(0xe9d4aa,.85);
 box(root,[2.2,2.15,.09],plaster,[0,1.075,0]);box(root,[1.64,1.28,.065],wood,[0,1.2,-.075]);box(root,[1.49,1.13,.02],gold,[0,1.2,-.113]);box(root,[1.43,1.07,.012],canvas,[0,1.2,-.129]);
 const disk=add(root,new THREE.CircleGeometry(.29,48),pink,[-.21,1.35,-.139],[0,Math.PI,0],'ART_COLOUR_DISC');
 box(root,[.72,.12,.009],cream,[.1,.96,-.14],[0,0,-.32],'ART_DIAGONAL');box(root,[.18,.69,.009],teal,[.27,1.28,-.142],[0,0,-.32]);
 for(let i=0;i<4;i++)box(root,[.19,.012,.008],gold,[-.38+i*.045,.87+i*.05,-.146]);
 ring(root,.26,.012,gold,[-.21,1.35,-.15],[0,0,0],'ART_GOLD_OUTLINE');
}

function campfire(root){
 const stone=[mat(0x67716c,.95),mat(0x839184,.96)],char=mat(0x292727,.97),wood=mat(0x72503a,.93),ember=luminous(0xf28a37,1.2);
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2,node=add(root,new THREE.IcosahedronGeometry(.15,1),stone[i%2],[Math.cos(a)*.43,.11,Math.sin(a)*.43],[0,a,.1]);node.scale.set(1,.72,.85);}
 const ash=cylinder(root,.35,.36,.04,char,[0,.035,0],24);
 for(let i=0;i<5;i++){
  const a=i*Math.PI*.4,y=.14+i%2*.055,x=Math.cos(a)*.07,z=Math.sin(a)*.07;
  const log=cylinder(root,.065,.08,.68,wood,[x,y,z],10,[Math.PI/2,0,a],'SPLIT_FIREWOOD');
  cylinder(root,.053,.053,.69,char,[x,y+.01,z],8,[Math.PI/2,0,a],'CHARRED_LOG_CORE');
  for(const side of [-1,1])sphere(root,.035,ember,[Math.sin(a)*side*.24+x,y+.03,Math.cos(a)*side*.24+z],[1,.3,1],'GLOWING_EMBER');
 }
 for(let i=0;i<7;i++){
  const a=i*2.4,r=i===0?0:.12,h=.56-(i%3)*.09,color=i%2?0xffa73f:0xff6d32;
  const flame=add(root,new THREE.SphereGeometry(.15,12,10),luminous(color,1.5),[Math.sin(a)*r,.42,Math.cos(a)*r]);flame.scale.set(.6,h/.3,.52);flame.userData.craftedFlame={baseY:flame.scale.y,phase:i*.81};flame.userData.collisionDisabled=true;
  const tip=add(root,new THREE.ConeGeometry(.09,.28,10),luminous(0xffcf77,1.25),[Math.sin(a)*r,.72-(i%3)*.06,Math.cos(a)*r]);tip.userData.craftedFlame={baseY:1,phase:i*.81};tip.userData.collisionDisabled=true;
 }
}
function bubbles(root){
 const dark=mat(0x284c49,.52,.63),brass=mat(0xb2ac67,.36,.75),glow=luminous(0x94e96d,1),glass=mat(0xa3f6a1,.19,.13,{transparent:true,opacity:.3,emissive:0x3d9b56,emissiveIntensity:.5});
 cylinder(root,.66,.73,.12,dark,[0,.06,0],48);cylinder(root,.65,.66,.035,brass,[0,.1375,0],48);
 for(const r of [.32,.55])pulse(ring(root,r,.013,glow,[0,.16,0]),1,r);
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4;box(root,[.055,.025,.12],dark,[Math.sin(a)*.45,.166,Math.cos(a)*.45],[0,a,0]);
  if(i%2===0){const marker=add(root,new THREE.OctahedronGeometry(.065),glow,[Math.sin(a)*.61,.21,Math.cos(a)*.61]);marker.scale.y=1.3;}
 }
 for(let i=0;i<9;i++){
  const a=i*2.4,r=.22+(i%3)*.13,y=.38+(i%4)*.28,size=.075+(i%3)*.025;
  const bubble=sphere(root,size,glass,[Math.sin(a)*r,y,Math.cos(a)*r],[1,1,1],'HEALING_ALCHEMY_BUBBLE');bubble.userData.craftedBubble={baseY:y,phase:i*.83};bubble.userData.collisionDisabled=true;
  const core=sphere(root,size*.32,glow,[Math.sin(a)*r-.025,y+.025,Math.cos(a)*r-.035],[1,.7,1],'BUBBLE_INNER_GLEAM');core.userData.craftedBubble={baseY:y+.025,phase:i*.83};core.userData.collisionDisabled=true;
 }
}

const recipes={
 'canopy-tree':root=>tree(root,false),'pine-tree':root=>tree(root,true),'flower-bed':flowerBed,'hedge-corner':hedge,'garden-rocks':rocks,pond,'path-tile':pavers,hill,
 'lamp-post':root=>lamp(root,true),planter,'pillow-ring':pillow,sofa:root=>seating(root,false),armchair:root=>seating(root,true),'coffee-table':table,bookshelf,
 'floor-lamp':root=>lamp(root,false),'room-divider':divider,'kitchen-island':island,'spiral-stairs':stairs,archway:arch,'art-wall':artWall,campfire,'green-bubbles':bubbles
};

export function createCraftedFurnitureModel(id){
 const info=CRAFTED_FURNITURE_MODEL_INFO[id];if(!info)return null;
 const root=new THREE.Group(),assembly=new THREE.Group();root.add(assembly);recipes[id](assembly);
 const bounds=new THREE.Box3().setFromObject(assembly,true),size=bounds.getSize(new THREE.Vector3());
 // Keep the authored starter dimensions so saved furniture and walkable terrain
 // occupy their established footprint. Local idle animation never moves this fit.
 assembly.scale.set(info[2][0]/size.x,info[2][1]/size.y,info[2][2]/size.z);assembly.updateMatrixWorld(true);
 const fitted=new THREE.Box3().setFromObject(assembly,true);assembly.position.y=-fitted.min.y;
 const definition=CRAFTED_FURNITURE_ITEMS.find(item=>item.id===id);
 root.name=info[0];root.userData={craftedFurnitureModel:true,builderObject:true,modelId:id,label:info[0],description:info[1],dimensions:[...info[2]],behavior:definition.behavior,interactive:true,animated:true};
 if(['path-tile','hill','spiral-stairs'].includes(id))root.userData.placementSurface=true;
 root.traverse(node=>{if(node.isMesh){node.userData.builderRoot=root;node.castShadow=!node.userData.collisionDisabled;node.receiveShadow=true;}});
 return finishGameItem(THREE,root);
}

export function updateCraftedFurnitureModel(root,elapsed){
 if(!root?.userData.craftedFurnitureModel||root.userData.animationState?.enabled===false)return;
 const speed=Number(root.userData.animationState?.speed??1),time=(Number.isFinite(elapsed)?elapsed:0)*(Number.isFinite(speed)?Math.max(0,speed):1);
 root.traverse(node=>{
  const {craftedSway:sway,craftedWater:water,craftedPulse:pulse,craftedRipple:ripple,craftedFlame:flame,craftedBubble:bubble}=node.userData;
  if(sway)node.rotation.z=sway.base+Math.sin(time*.7+sway.phase)*sway.strength;
  if(water)node.material.opacity=water.opacity+Math.sin(time*.8)*.035;
  if(pulse&&node.material.emissive)node.material.emissiveIntensity=pulse.base*(1+Math.sin(time*1.5+pulse.phase)*.12);
  if(ripple){const phase=(time*.15+ripple.phase)%(Math.PI*2);node.material.opacity=.22+Math.sin(phase)*.1;}
  if(flame){node.scale.y=flame.baseY*(.92+Math.sin(time*6.7+flame.phase)*.09);node.rotation.z=Math.sin(time*3.2+flame.phase)*.08;}
  if(bubble)node.position.y=bubble.baseY+Math.sin(time*1.3+bubble.phase)*.07;
 });
}
