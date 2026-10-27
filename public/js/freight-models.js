import {finishVehicleDesign} from './vehicle-design-system.js';
import * as T from '../vendor/three/three.module.min.js';
const wood=new T.MeshStandardMaterial({color:0xa67b4c,roughness:.85}),steel=new T.MeshStandardMaterial({color:0x526572,metalness:.8,roughness:.3}),rubber=new T.MeshStandardMaterial({color:0x171b20,roughness:.9}),amber=new T.MeshStandardMaterial({color:0xf1c35e,emissive:0x795019});
function box(root,size,pos,mat=steel){const mesh=new T.Mesh(new T.BoxGeometry(...size),mat);mesh.position.set(...pos);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;}
export function createFreightModel(id){
 const root=new T.Group();root.userData={builderObject:true,modelId:id};
 if(id==='freight-loading-bay'){
  root.name='Freight loading and shipping bay';root.userData.collisionDisabled=true;
  const base=new T.MeshStandardMaterial({color:0x35484b}),mark=new T.MeshStandardMaterial({color:0xf0d77b});box(root,[7,.04,8],[0,.02,0],base);
  for(const x of [-3,3])box(root,[.12,.015,7],[x,.05,0],mark);for(const z of [-3.5,3.5])box(root,[6,.015,.12],[0,.05,z],mark);
  for(const x of [-3,3]){box(root,[.12,2.8,.12],[x,1.4,3.5]);box(root,[.25,.1,.25],[x,2.85,3.5],amber);}box(root,[6.2,.55,.12],[0,2.65,3.5]);
  if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#233c43';ctx.fillRect(0,0,1024,128);ctx.fillStyle='#ffe0a2';ctx.font='bold 62px system-ui';ctx.fillText('FREIGHT · LOAD / SHIP',32,88);const sign=box(root,[5.8,.47,.02],[0,2.65,3.42],new T.MeshBasicMaterial({map:new T.CanvasTexture(canvas)}));sign.rotation.y=Math.PI;}
  for(let i=0;i<3;i++)cargoCrate(root,[-2.4+i*.8,.5,2.4]);
 }else{
  root.name='Frontier Tandem Cargo Trailer';root.userData.cargoTrailer=true;
  box(root,[2,.16,3.8],[0,.62,.3]);box(root,[1.86,.08,3.65],[0,.74,.3],wood);
  for(const x of [-1,1]){box(root,[.08,.42,3.9],[x,.92,.3]);for(const z of [-1.5,.3,2.1])box(root,[.1,.65,.1],[x,1.08,z]);box(root,[.08,.08,3.9],[x,1.38,.3]);}
  for(const z of [-1.6,2.2])box(root,[2,.42,.08],[0,.92,z]);
  for(const x of [-.43,.43]){const beam=box(root,[.09,.1,1.45],[x,.65,-2.13]);beam.rotation.y=x>0?-.55:.55;}box(root,[.18,.15,.35],[0,.65,-2.65]);box(root,[.08,.55,.08],[.2,.36,-2.15]);
  for(const z of [-.25,.8])for(const x of [-1.02,1.02]){const wheel=new T.Mesh(new T.CylinderGeometry(.34,.34,.22,24),rubber);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.36,z);root.add(wheel);const hub=new T.Mesh(new T.CylinderGeometry(.19,.19,.24,16),steel);hub.rotation.z=Math.PI/2;hub.position.copy(wheel.position);root.add(hub);box(root,[.32,.08,1.7],[x,.8,.28]);}
  for(const x of [-.78,.78])box(root,[.23,.1,.04],[x,.7,2.26],new T.MeshStandardMaterial({color:0xf45c4a,emissive:0xb12d20}));
 }
 root.traverse(mesh=>{if(mesh.isMesh)mesh.userData.builderRoot=root;});return finishVehicleDesign(T,root,id);
}
function cargoCrate(root,pos){const crate=new T.Group();crate.position.set(...pos);box(crate,[.68,.54,.72],[0,0,0],wood);for(const x of [-.25,.25])box(crate,[.06,.57,.76],[x,0,0],steel);box(crate,[.25,.2,.015],[0,0,-.37],amber);root.add(crate);return crate;}
export function updateFreightVisual(root){
 const freight=root.userData.freight||{crates:[],secured:true},key=freight.crates.length+':'+freight.secured;if(root.userData.freightReading===key)return;root.userData.freightReading=key;
 let group=root.getObjectByName('VISIBLE_FREIGHT');if(!group){group=new T.Group();group.name='VISIBLE_FREIGHT';group.userData.collisionDisabled=true;root.add(group);}while(group.children.length){const old=group.children.pop();old.traverse(m=>m.geometry?.dispose());}
 const trailer=root.userData.cargoTrailer,capacity=trailer?8:4;
 freight.crates.slice(0,capacity).forEach((crate,index)=>cargoCrate(group,[(index%2?1:-1)*.4,(trailer?.99:1.1)+Math.floor(index/4)*.56,(trailer?.1:1.15)+Math.floor(index%4/2)*.8]));
 if(freight.crates.length&&freight.secured)for(const z of trailer?[.1,.9]:[1.15,1.95])box(group,[1.6,.04,.06],[0,trailer&&freight.crates.length>4?1.85:trailer?1.29:1.4,z],amber);
}
