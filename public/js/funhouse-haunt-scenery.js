import * as T from '../vendor/three/three.module.min.js';
import {FUNHOUSE_HAUNT_START,FUNHOUSE_HAUNT_WARDS} from './funhouse-haunt-rules.js';

// Night Watch is theatrical scenery. It never adds walking solids or changes a
// visitor's camera; the same lanterns can be selected by mouse or either hand.
export function createFunhouseHauntScenery(){
 const root=new T.Group();root.name='FUNHOUSE_NIGHT_WATCH';root.userData.collisionDisabled=true;
 const markers=[],shadows=[],targets=[];
 const standard=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.8,...extra});
 const iron=standard('#211b30'),glass=standard('#a06ac1',{emissive:'#572c7a',emissiveIntensity:.8,transparent:true,opacity:.7});
 const nextMaterial=new T.MeshBasicMaterial({color:'#aee8de'}),sealMaterial=new T.MeshBasicMaterial({color:'#f9cd79',side:T.DoubleSide});
 const shadeMaterial=standard('#1a1325',{transparent:true,opacity:.9,side:T.DoubleSide});
 const headMaterial=standard('#b8b4ae',{emissive:'#30202c',emissiveIntensity:.35});
 const sphere=new T.SphereGeometry(.32,12,10),glow=new T.IcosahedronGeometry(.22,1),ring=new T.TorusGeometry(.43,.035,6,32),sealGeometry=new T.CircleGeometry(.16,16),base=new T.CylinderGeometry(.35,.43,.12,12);
 const shroud=new T.LatheGeometry([new T.Vector2(.7,0),new T.Vector2(.57,.5),new T.Vector2(.43,1.1),new T.Vector2(.22,1.55)],12);
 const faceMap=maskTexture(),faceMaterial=new T.MeshBasicMaterial({map:faceMap,color:faceMap?'#ffffff':'#d0c6be',transparent:true,side:T.DoubleSide,depthWrite:false});
 const faceGeometry=new T.PlaneGeometry(.77,.88);
 const mesh=(parent,geometry,material,name,x=0,y=0,z=0)=>{const node=new T.Mesh(geometry,material);node.name=name;node.position.set(x,y,z);node.userData.collisionDisabled=true;node.userData.dynamicDecoration=true;parent.add(node);return node;};
 function maskTexture(){
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=576;const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.clearRect(0,0,512,576);
  const pallor=ctx.createRadialGradient(230,200,20,256,290,250);pallor.addColorStop(0,'#f1e8d6');pallor.addColorStop(.65,'#c8bbb1');pallor.addColorStop(1,'#514252');
  ctx.fillStyle=pallor;ctx.beginPath();ctx.ellipse(256,285,192,263,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#271520';for(const side of [-1,1]){const x=256+side*86;ctx.beginPath();ctx.ellipse(x,221,66,60,side*.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#a45358';ctx.beginPath();ctx.moveTo(x-21,258);ctx.lineTo(x+18,257);ctx.lineTo(x+side*28,389);ctx.closePath();ctx.fill();ctx.fillStyle='#ffd68a';ctx.beginPath();ctx.ellipse(x,220,8,22,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#271520';ctx.save();ctx.translate(x,139);ctx.rotate(side*.19);ctx.fillRect(-69,-9,138,17);ctx.restore();}
  ctx.fillStyle='#8c2742';ctx.beginPath();ctx.ellipse(256,305,39,31,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#7b223d';ctx.lineWidth=31;ctx.beginPath();ctx.moveTo(104,350);ctx.quadraticCurveTo(256,510,408,350);ctx.stroke();
  ctx.strokeStyle='#1a101d';ctx.lineWidth=21;ctx.beginPath();ctx.moveTo(108,352);ctx.quadraticCurveTo(256,492,404,352);ctx.stroke();
  for(let i=0;i<14;i++){const x=121+i*20.7,curve=1-Math.pow((x-256)/145,2);ctx.fillStyle=i%3?'#eee1bd':'#c5b293';ctx.beginPath();ctx.moveTo(x,362+curve*58);ctx.lineTo(x+12,362+curve*58);ctx.lineTo(x+9,384+curve*54);ctx.lineTo(x+3,383+curve*54);ctx.closePath();ctx.fill();}
  ctx.strokeStyle='#645160';ctx.lineWidth=2;for(const [x,y,side]of [[104,114,-1],[399,294,1],[137,449,-1]]){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+side*15,y+27);ctx.lineTo(x-side*4,y+41);ctx.lineTo(x+side*10,y+63);ctx.stroke();}
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;return map;
 }
 function lantern(definition,index){
  // The mirror ward stands beside the Lost Laugh lantern, so either game has
  // its own distinct physical control while sharing the same clear approach.
  const holder=new T.Group();holder.name='FUNHOUSE_HAUNT_LANTERN_'+definition.id;holder.position.set(definition.position.x+(definition.id==='mirror-lantern'?.9:0),0,definition.position.z);holder.userData.collisionDisabled=true;root.add(holder);
  mesh(holder,base,iron,'FUNHOUSE_HAUNT_LANTERN_BASE',0,.09,0);
  const token=mesh(holder,glow,glass,'FUNHOUSE_HAUNT_LANTERN_GLASS',0,1.3,0);
  const highlight=mesh(holder,ring,nextMaterial,'FUNHOUSE_HAUNT_NEXT_WARD',0,1.3,.07);
  const seal=mesh(holder,sealGeometry,sealMaterial,'FUNHOUSE_HAUNT_SEALED_WARD',0,1.3,.28);seal.visible=false;
  const cagePoints=[];for(const side of [-1,1]){cagePoints.push(side*.29,.18,0,side*.29,1.7,0,side*.29,1.7,0,0,1.9,0,side*.29,.95,0,side*.29,1.65,0);}
  const cage=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(cagePoints,3)),new T.LineBasicMaterial({color:'#ad895c'}));cage.name='FUNHOUSE_HAUNT_LANTERN_CAGE';holder.add(cage);
  const fields={id:'haunt-'+definition.id,stationId:FUNHOUSE_HAUNT_START.id,kind:'haunt',operation:index<0?'start':'seal',...(index<0?{}:{wardId:definition.id})};token.userData.funhouseAction=fields;targets.push({...fields,root:token,radius:.48,offset:{x:0,y:0,z:0}});
  markers.push({id:definition.id,wardId:index<0?null:definition.id,index,root:holder,token,highlight,seal,position:{...definition.position},targetPosition:{x:holder.position.x,y:1.3,z:holder.position.z}});
 }
 lantern(FUNHOUSE_HAUNT_START,-1);FUNHOUSE_HAUNT_WARDS.forEach(lantern);
 function phantom(name,x,z,scale=1){
  const node=new T.Group();node.name=name;node.position.set(x,.2,z);node.scale.setScalar(scale);node.userData.collisionDisabled=true;root.add(node);
  mesh(node,shroud,shadeMaterial,'FUNHOUSE_HAUNT_TATTERED_SHROUD');mesh(node,sphere,headMaterial,'FUNHOUSE_HAUNT_MASK_HEAD',0,1.83,0);
  mesh(node,faceGeometry,faceMaterial,'FUNHOUSE_HAUNT_GRINNING_MASK',0,1.83,.27);return node;
 }
 for(const [index,ward]of FUNHOUSE_HAUNT_WARDS.entries()){
  // The nursery already has its own standing clown at (19,-17). Keep the
  // spectral mask beside it, with a clear silhouette from the lantern path.
  const x=index===0?22:ward.position.x+(index%2?.9:-.9),z=index===0?-18:ward.position.z-1.35;
  const node=phantom('FUNHOUSE_HAUNT_SHADOW_'+ward.id,x,z);node.visible=false;shadows.push(node);
 }
 // A normal standing view from the portrait ward includes the entire mask.
 // The finale stays in front of the next maze wall instead of filling the eye.
 const reveal=phantom('FUNHOUSE_HAUNT_FINAL_RINGMASTER',-20,-22.3,1.5);reveal.position.y=0;reveal.visible=false;
 // Back-wall eyes and fine corner webs use a single draw call apiece. Their
 // steady glows leave every maze gap and seated view unobstructed.
 const eyes=new T.InstancedMesh(new T.SphereGeometry(.075,8,6),new T.MeshBasicMaterial({color:'#da9d7f'}),8);eyes.name='FUNHOUSE_HAUNT_WATCHING_EYES';eyes.userData.collisionDisabled=true;
 const eyePositions=[[23.62,3.55,-18,-Math.PI/2],[23.62,3.7,-32,-Math.PI/2],[4,3.9,-43.62,0],[-23.62,3.9,-38,Math.PI/2]];
 const dummy=new T.Object3D();let eyeIndex=0;for(const [x,y,z,rotation]of eyePositions)for(const side of [-1,1]){dummy.position.set(x+Math.cos(rotation)*side*.17,y,z-Math.sin(rotation)*side*.17);dummy.rotation.y=rotation;dummy.scale.set(.65,1.5,.45);dummy.updateMatrix();eyes.setMatrixAt(eyeIndex++,dummy.matrix);}root.add(eyes);
 const webPoints=[];for(const [x,z,side]of [[-23.6,-43.6,1],[23.6,-43.6,-1],[-23.6,-12.4,1],[23.6,-12.4,-1]]){
  const anchor=new T.Vector3(x,5.2,z),endpoints=[];for(let ray=0;ray<5;ray++){const a=ray/4*Math.PI/2,end=anchor.clone().add(new T.Vector3(Math.sin(a)*side*2,-Math.cos(a)*1.8,0));endpoints.push(end);webPoints.push(...anchor,...end);}
  for(const f of [.25,.5,.75,1])for(let ray=0;ray<4;ray++)webPoints.push(...anchor.clone().lerp(endpoints[ray],f),...anchor.clone().lerp(endpoints[ray+1],f));
 }
 const webs=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(webPoints,3)),new T.LineBasicMaterial({color:'#aaa2b3',transparent:true,opacity:.28}));webs.name='FUNHOUSE_HAUNT_CORNER_WEBS';root.add(webs);
 const signMap=signTexture(),sign=mesh(root,new T.PlaneGeometry(3.5,.85),new T.MeshBasicMaterial({map:signMap,color:signMap?'#ffffff':'#e6d1a9',side:T.DoubleSide}),'FUNHOUSE_HAUNT_NIGHT_WATCH_SIGN',0,2.3,-15.55);
 function signTexture(){if(typeof document==='undefined')return null;const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)return null;ctx.fillStyle='#1a1326';ctx.fillRect(0,0,1024,256);ctx.strokeStyle='#ab815e';ctx.lineWidth=8;ctx.strokeRect(6,6,1012,244);ctx.textAlign='center';ctx.fillStyle='#ead8b4';ctx.font='bold 76px Georgia';ctx.fillText('NIGHT WATCH',512,108);ctx.fillStyle='#b7e4dd';ctx.font='31px system-ui';ctx.fillText('LIGHT FOUR LANTERNS. KEEP THE SHADOWS OUT.',512,177,970);ctx.font='26px system-ui';ctx.fillText('AIM + USE / TRIGGER TO BEGIN',512,224,970);const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;return map;}
 function update(haunt,time=0,reducedMotion=false,now=Date.now()){
  const running=haunt?.status==='active'&&now<haunt.endsAt;
  for(const marker of markers){
   const sealed=marker.index>=0&&haunt?.sealed?.includes(marker.id),next=marker.index<0?!running:running&&marker.index===haunt.wardIndex;
   marker.highlight.visible=Boolean(next);marker.seal.visible=Boolean(sealed);marker.token.position.y=1.3+(reducedMotion?0:Math.sin(time*.8+marker.index)*.035);
   marker.highlight.scale.setScalar(next&&!reducedMotion?1+Math.sin(time*1.1)*.035:1);
  }
  for(const [index,node]of shadows.entries()){
   node.visible=Boolean(running&&haunt.wardIndex===index);
   node.position.y=.2+(reducedMotion?0:Math.sin(time*.65+index)*.08);node.rotation.z=reducedMotion?0:Math.sin(time*.45+index)*.035;
  }
  const completedAt=haunt?.finishedAt??haunt?.lastSealedAt;
  reveal.visible=Boolean(haunt?.status==='complete'&&Number.isFinite(completedAt)&&now>=completedAt&&now-completedAt<4500);
  reveal.position.y=reveal.visible&&!reducedMotion?Math.sin(Math.min(Math.PI,(now-completedAt)/4500*Math.PI))*.03:0;reveal.rotation.z=0;
  // Reduced motion remains a stable pose, including the final revealed mask.
  eyes.visible=true;sign.visible=true;
 }
 return {root,markers,shadows,reveal,targets,update};
}
