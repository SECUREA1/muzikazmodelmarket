import * as T from '../vendor/three/three.module.min.js';
import {PRISON_ITEMS} from './prison-items.js';
import {finishGameItem} from './game-item-finish.js';

/** Small, portable earned objects. No live prison actors or security inventory
 * are copied when an owned keepsake is placed in a different world. */
export function createPrisonItemModel(id){
 const item=PRISON_ITEMS[id];if(!item)return null;
 const root=new T.Group();root.name=item.name;
 const materials=new Map(),material=(color,metalness=.1)=>{const key=color+':'+metalness;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,roughness:metalness>.5?.3:.72,metalness}));return materials.get(key);};
 const add=(geometry,color,x,y,z,metalness=.1)=>{const mesh=new T.Mesh(geometry,material(color,metalness));mesh.position.set(x,y,z);root.add(mesh);return mesh;};
 const box=(w,h,d,color,x,y,z,metalness=.1)=>add(new T.BoxGeometry(w,h,d),color,x,y,z,metalness);
 const cylinder=(r1,r2,h,color,x,y,z,metalness=.1)=>add(new T.CylinderGeometry(r1,r2,h,20),color,x,y,z,metalness);
 const sphere=(r,color,x,y,z)=>add(new T.SphereGeometry(r,14,10),color,x,y,z);
 const frontDisc=(r,h,color,x,y,z,metalness=.1)=>{const mesh=cylinder(r,r,h,color,x,y,z,metalness);mesh.rotation.x=Math.PI/2;return mesh;};
 const wood='#9c7853',dark='#263c45',steel='#a9b7b6',cream='#e5ddba',gold='#d5b161';
 if(id==='prison-radio'){
  box(.94,.49,.32,dark,0,.285,0);box(.88,.4,.025,'#536f70',0,.29,-.174);
  for(const x of [-.33,.33]){box(.11,.08,.29,'#182c34',x,.04,0);box(.06,.25,.05,dark,x,.64,0);}
  box(.71,.06,.055,dark,0,.785,0);
  frontDisc(.16,.025,'#1a2e38',-.23,.31,-.196);for(let i=0;i<10;i++){const angle=i/10*Math.PI*2;frontDisc(.012,.008,steel,-.23+Math.cos(angle)*.11,.31+Math.sin(angle)*.11,-.212);}
  box(.29,.105,.018,'#e2c278',.2,.4,-.197);for(let i=0;i<6;i++)box(.008,.055,.006,dark,.08+i*.045,.4,-.209);
  frontDisc(.06,.028,steel,.14,.2,-.202,.7);frontDisc(.045,.028,steel,.32,.2,-.202,.7);
  box(.11,.016,.009,cream,.14,.2,-.221);box(.008,.065,.008,cream,.32,.2,-.221);
  for(const x of [-.41,.41])for(const y of [.1,.47])frontDisc(.012,.012,steel,x,y,-.2,.8);
  const aerial=cylinder(.009,.012,.57,steel,.38,.85,.04,.8);aerial.rotation.z=-.16;sphere(.016,steel,.425,1.131,.04);
  box(.21,.035,.014,cream,-.23,.08,-.198);
 }else if(id==='prison-chess-set'){
  box(.92,.095,.92,wood,0,.055,0);box(.86,.012,.86,dark,0,.109,0);
  for(let x=0;x<8;x++)for(let z=0;z<8;z++)box(.1,.009,.1,(x+z)%2?dark:cream,(x-3.5)*.1,.12,(z-3.5)*.1);
  box(.012,.1,.92,'#664c35',0,.055,0);box(.12,.055,.015,gold,0,.06,-.467,.65);
  for(const x of [-.3,.3])box(.09,.05,.02,gold,x,.055,.465,.65);
  function piece(x,z,color,kind){
   const h=kind==='pawn'?.11:kind==='king'?.24:kind==='queen'?.21:.18;
   cylinder(.028,.037,.024,color,x,.14,z);cylinder(.018,.028,h*.58,color,x,.15+h*.29,z);cylinder(.028,.019,.02,color,x,.15+h*.6,z);
   if(kind==='pawn')sphere(.023,color,x,.15+h*.78,z);
   else if(kind==='rook'){cylinder(.031,.025,.035,color,x,.15+h*.77,z);for(const dx of [-.02,.02])for(const dz of [-.02,.02])box(.014,.025,.014,color,x+dx,.15+h*.94,z+dz);}
   else if(kind==='knight'){const head=box(.034,.085,.048,color,x,.15+h*.82,z);head.rotation.x=-.35;box(.035,.025,.045,color,x,.15+h*1.02,z-.018);}
   else if(kind==='bishop'){const head=add(new T.ConeGeometry(.025,.07,12),color,x,.15+h*.91,z);head.rotation.z=.16;}
   else{sphere(.025,color,x,.15+h*.83,z);if(kind==='king'){box(.012,.055,.012,color,x,.15+h*1.04,z);box(.038,.012,.012,color,x,.15+h*1.1,z);}else cylinder(.03,.015,.035,color,x,.15+h*1.03,z);}
  }
  const back=['rook','knight','bishop','queen','king','bishop','knight','rook'];
  for(const side of [-1,1])for(let file=0;file<8;file++){piece((file-3.5)*.1,side*.25,side<0?cream:'#34434a','pawn');piece((file-3.5)*.1,side*.35,side<0?cream:'#34434a',back[file]);}
 }else if(id==='prison-earned-trophy'){
  box(.58,.13,.46,dark,0,.065,0);box(.51,.075,.39,'#4b5e64',0,.165,0);box(.33,.095,.016,gold,0,.077,-.239,.72);
  for(let i=0;i<3;i++)box(.23-i*.035,.007,.004,'#475156',0,.105-i*.025,-.249);
  cylinder(.14,.19,.07,gold,0,.235,0,.72);cylinder(.075,.12,.27,gold,0,.4,0,.72);cylinder(.13,.075,.06,gold,0,.56,0,.72);
  const points=[[.1,0],[.12,.04],[.18,.1],[.23,.2],[.25,.36]].map(([x,y])=>new T.Vector2(x,y));
  add(new T.LatheGeometry(points,32),gold,0,.58,0,.72);const rim=add(new T.TorusGeometry(.25,.018,8,32),gold,0,.94,0,.72);rim.rotation.x=Math.PI/2;
  for(const side of [-1,1]){const handle=add(new T.TorusGeometry(.14,.023,8,22),gold,side*.22,.75,0,.72);handle.scale.x=.8;}
  cylinder(.045,.045,.075,gold,0,1.02,0,.72);
  const star=new T.Shape();for(let i=0;i<10;i++){const angle=Math.PI/2+i*Math.PI/5,r=i%2?.047:.1;const x=Math.cos(angle)*r,y=Math.sin(angle)*r;i?star.lineTo(x,y):star.moveTo(x,y);}star.closePath();
  add(new T.ExtrudeGeometry(star,{depth:.025,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:1}),gold,0,1.11,-.012,.72);
 }else{
  box(1.1,.78,.8,'#715b43',0,.42,0);for(const x of [-.49,.49])for(const z of [-.34,.34])box(.095,.9,.095,steel,x,.45,z,.65);
  for(const y of [.19,.42,.65])for(const z of [-.413,.413])box(.94,.18,.035,wood,0,y,z);
  for(const y of [.19,.42,.65])for(const x of [-.563,.563])box(.035,.18,.65,wood,x,y,0);
  for(let i=0;i<6;i++)box(.17,.065,.77,wood,-.46+i*.184,.83,0);
  for(const x of [-.33,.33]){box(.055,.025,.82,steel,x,.876,0,.65);box(.055,.84,.025,steel,x,.44,-.437,.65);box(.055,.84,.025,steel,x,.44,.437,.65);}
  for(const x of [-.576,.576]){box(.025,.13,.31,dark,x,.5,0);for(const z of [-.12,.12])box(.035,.085,.035,steel,x,.51,z,.6);}
  box(.35,.21,.025,cream,0,.43,-.447);for(let i=0;i<4;i++)box(.23-i*.025,.012,.006,dark,0,.49-i*.04,-.463);
  for(const x of [-.49,.49])for(const y of [.12,.75])for(const z of [-.4,.4])sphere(.018,'#50636c',x,y,z);
 }
 root.userData={builderObject:true,modelId:id,prisonCollectible:true,label:item.name,description:item.description,dimensions:[...item.dimensions]};
 root.traverse(node=>{if(node.isMesh){node.userData.builderRoot=root;node.castShadow=true;node.receiveShadow=true;}});
 return finishGameItem(T,root);
}
