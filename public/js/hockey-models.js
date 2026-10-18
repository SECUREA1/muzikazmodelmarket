import {addHockeyFacilities} from './hockey-facilities.js';
import * as THREE from '../vendor/three/three.module.min.js';
import {RINK} from './hockey-rules.js';
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.5,...extra});
function box(root,size,pos,color){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat(color));m.position.set(...pos);root.add(m);return m;}
export const HOCKEY_ITEMS=[['hockey-stick','Hockey Stick'],['hockey-skates','Ice Skates'],['hockey-puck','Hockey Puck'],['hockey-net','Regulation Hockey Net'],['hockey-player','AI Hockey Skater'],['hockey-goalie','AI Goaltender'],['hockey-referee','AI Referee'],['hockey-linesman','AI Linesman']].map(([id,name])=>({id,name,type:'interactive',category:'sports',size:85,image:'public/images/hockey.svg',procedural:true,behavior:'hockey',animation:'skate',description:'Hockey equipment and match role; active in hockey arenas.'}));
export function createHockeyItem(id,color='#237ad4'){
 const g=new THREE.Group();g.name=id;g.userData.hockeyRole=id;
 if(id==='hockey-puck'){const m=new THREE.Mesh(new THREE.CylinderGeometry(.0381,.0381,.0254,20),mat('#141822'));m.position.y=.03;g.add(m);}
 else if(id==='hockey-stick'){box(g,[.035,1.4,.035],[0,.78,0],'#292c35');box(g,[.035,.06,.32],[0,.09,.14],'#292c35');g.rotation.x=-.3;}
 else if(id==='hockey-skates'){for(const x of [-.14,.14]){box(g,[.15,.19,.33],[x,.16,0],'#1b2530');box(g,[.025,.05,.35],[x,.025,0],'#a5c6d9');}}
 else if(id==='hockey-net'){
  const w=RINK.goalWidth,h=RINK.goalHeight;for(const z of [-w/2,w/2]){box(g,[.05,h,.05],[0,h/2,z],'#dc3343');box(g,[1,.035,.035],[.5,h,z],'#dc3343');}box(g,[.05,.05,w],[0,h,0],'#dc3343');
  const net=mat('#fafafa',{wireframe:true,side:THREE.DoubleSide});const back=new THREE.Mesh(new THREE.PlaneGeometry(w,h,16,12),net);back.rotation.y=Math.PI/2;back.position.set(1,h/2,0);g.add(back);for(const z of [-w/2,w/2]){const side=new THREE.Mesh(new THREE.PlaneGeometry(1,h,8,12),net);side.position.set(.5,h/2,z);g.add(side);}const top=new THREE.Mesh(new THREE.PlaneGeometry(1,w,8,16),net);top.rotation.x=-Math.PI/2;top.position.set(.5,h,0);g.add(top);
 }else if(['hockey-player','hockey-goalie','hockey-referee','hockey-linesman'].includes(id)){
  const ref=id==='hockey-referee'||id==='hockey-linesman',goalie=id==='hockey-goalie';box(g,[.55,.68,.32],[0,1.1,0],ref?'#fafafa':color);const head=new THREE.Mesh(new THREE.SphereGeometry(.21,14,10),mat('#1d2938'));head.position.set(0,1.65,0);g.add(head);
  const legs=[];for(const x of [-.16,.16]){const leg=new THREE.Group();leg.name=x<0?'HOCKEY_LEG_LEFT':'HOCKEY_LEG_RIGHT';leg.position.set(x,.78,0);box(leg,[goalie?.25:.17,.58,.2],[0,-.28,0],goalie?'#f5f1de':'#243143');box(leg,[.18,.16,.36],[0,-.63,.05],'#172431');box(leg,[.025,.04,.4],[0,-.73,.05],'#a2c8dc');g.add(leg);legs.push(leg);}
  for(const x of [-.37,.37]){const arm=box(g,[.17,.55,.2],[x,1.02,0],ref?'#151c28':color);arm.name=x<0?'HOCKEY_ARM_LEFT':'HOCKEY_ARM_RIGHT';}
  if(id==='hockey-referee')for(const x of [-.37,.37])box(g,[.18,.1,.21],[x,1.13,0],'#ee842e');
  if(ref)for(let x=-.22;x<=.23;x+=.11)box(g,[.045,.67,.015],[x,1.1,.17],'#151c28');else{const stick=createHockeyItem('hockey-stick');stick.position.set(.43,0,.18);stick.name='HOCKEY_STICK';g.add(stick);}

 }else return null;return g;
}
export function animateHockeyPose(g,animation,time,signal='play'){
 for(const [i,name]of ['HOCKEY_ARM_LEFT','HOCKEY_ARM_RIGHT'].entries()){const arm=g.getObjectByName(name);if(arm)arm.rotation.z=signal!=='play'?(i?1:-1)*(signal==='goal'?Math.PI/2:Math.PI):0;}
 const stride=animation==='skate'?Math.sin(time*12)*.42:0;
 for(const [i,name]of ['HOCKEY_LEG_LEFT','HOCKEY_LEG_RIGHT'].entries()){const leg=g.getObjectByName(name);if(leg)leg.rotation.x=stride*(i?-1:1);}
 const stick=g.getObjectByName('HOCKEY_STICK');if(stick)stick.rotation.z=['shoot','pass','check'].includes(animation)?-.8:0;
}
export function animateHockeyPlayer(g,p,time){animateHockeyPose(g,p.animation,time,p.signal||'play');g.position.set(p.x,0,p.z);g.rotation.y=p.yaw||0;g.rotation.z=p.animation==='save'?.35:0;}
export function createHockeyArena(){
 const root=new THREE.Group(),hx=RINK.length/2,hz=RINK.width/2,r=RINK.corner;
 const shape=new THREE.Shape();shape.moveTo(-hx+r,-hz);shape.lineTo(hx-r,-hz);shape.absarc(hx-r,-hz+r,r,-Math.PI/2,0,false);shape.lineTo(hx,hz-r);shape.absarc(hx-r,hz-r,r,0,Math.PI/2,false);shape.lineTo(-hx+r,hz);shape.absarc(-hx+r,hz-r,r,Math.PI/2,Math.PI,false);shape.lineTo(-hx,-hz+r);shape.absarc(-hx+r,-hz+r,r,Math.PI,Math.PI*1.5,false);
 const ice=new THREE.Mesh(new THREE.ShapeGeometry(shape,32),mat('#e6f5ff',{roughness:.18,metalness:.1}));ice.rotation.x=-Math.PI/2;ice.position.y=.005;root.add(ice);
 const points=shape.getPoints(24);for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=a.distanceTo(b),x=(a.x+b.x)/2,z=-(a.y+b.y)/2;const board=box(root,[len+.015,1.07,.12],[x,.535,z],'#f2f7fa');board.rotation.y=Math.atan2(a.y-b.y,b.x-a.x);const glass=box(root,[len,1.2,.025],[x,1.67,z],'#92cddd');glass.rotation.y=board.rotation.y;glass.material.transparent=true;glass.material.opacity=.2;}
 for(const x of [-RINK.goalX,-RINK.blue,0,RINK.blue,RINK.goalX])box(root,[Math.abs(x)===RINK.blue?.3:.12,.012,RINK.width-1],[x,.022,0],Math.abs(x)===RINK.blue?'#2477d8':'#e04b63');
 function ring(x,z,r,color){const m=new THREE.Mesh(new THREE.RingGeometry(r-.04,r,64),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.set(x,.031,z);root.add(m);}
 function dot(x,z,r,color){const m=new THREE.Mesh(new THREE.CircleGeometry(r,32),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.set(x,.033,z);root.add(m);}
 ring(0,0,4.572,'#2477d8');dot(0,0,.1524,'#2477d8');for(const x of [-21.0312,21.0312])for(const z of [-6.7056,6.7056]){ring(x,z,4.572,'#e04b63');dot(x,z,.3048,'#e04b63');}for(const x of [-6.096,6.096])for(const z of [-6.7056,6.7056])dot(x,z,.3048,'#e04b63');
 for(const sign of [-1,1]){const net=createHockeyItem('hockey-net');net.position.set(sign*RINK.goalX,0,0);if(sign<0)net.rotation.y=Math.PI;root.add(net);const start=sign>0?Math.PI/2:-Math.PI/2,crease=new THREE.Mesh(new THREE.CircleGeometry(1.8288,40,start,Math.PI),new THREE.MeshBasicMaterial({color:'#9dd7ed',side:THREE.DoubleSide}));crease.rotation.x=-Math.PI/2;crease.position.set(sign*RINK.goalX,.023,0);root.add(crease);const arc=new THREE.Mesh(new THREE.RingGeometry(1.79,1.8288,40,1,start,Math.PI),new THREE.MeshBasicMaterial({color:'#e04b63',side:THREE.DoubleSide}));arc.rotation.x=-Math.PI/2;arc.position.set(sign*RINK.goalX,.034,0);root.add(arc);}
 addHockeyFacilities(root);
 return root;
}
