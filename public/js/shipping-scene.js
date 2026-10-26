import * as THREE from '../vendor/three/three.module.min.js';
import {isShippingEnvironment,SHIPPING_PORTS} from './shipping-config.js';

const point=value=>Number.isFinite(value?.x)&&Number.isFinite(value?.z)?{x:value.x,y:Number(value.y)||0,z:value.z}:null;
// Project confirmed objectives only. Visible rings never advance a quest or
// approve a docking operation; the server checks the entire route and berth.
export function shippingSceneState(snapshot,selfId,environment){
 const self=snapshot?.players?.[selfId],job=self?.shipping?.job;
 if(!isShippingEnvironment(environment)||snapshot?.shipping?.enabled!==true||!self||self.health<=0)return null;
 const sailing=job?.phase==='sailing',index=Math.max(0,job?.checkpointIndex||0),waypoints=job?.waypoints||[],next=sailing?waypoints[index]:null;
 const ports=snapshot.shipping.ports||SHIPPING_PORTS,destination=ports.find(port=>port.id===job?.destinationId),origin=ports.find(port=>port.id===job?.originId);
 const berth=job?.phase==='loading'||job?.phase==='secured'?origin:destination;
 const hazard=sailing&&job?.hazard&&!job.hazard.resolved?job.hazard:null;
 const receiving=job?.phase!=='loading'&&job?.phase!=='secured'?point(job?.receivingBerth):null;
 return {next:next&&point(next),name:next?.name||'',route:sailing?waypoints.slice(index).map(point).filter(Boolean):[],berth:receiving||point(berth?.berth||berth),hazard:hazard?{...hazard,position:point(hazard.position||hazard.point)||point(next)}:null,phase:job?.phase||'ready'};
}

export function createShippingScene(scene,{createCanvas=()=>globalThis.document?.createElement('canvas')}={}){
 const root=new THREE.Group();root.name='SHARED_SHIPPING_OBJECTIVES';root.userData={collisionDisabled:true,collider:false};scene.add(root);
 const material=(color,extra={})=>new THREE.MeshBasicMaterial({color,...extra});
 const mint=material(0x8ee1cd),red=material(0xeea3a2),gold=material(0xffd680),dark=material(0x102b3d),warning=material(0xf3a35b),lineMaterial=new THREE.LineBasicMaterial({color:0xffd680,transparent:true,opacity:.45});
 function mesh(parent,geometry,mat,position){const obj=new THREE.Mesh(geometry,mat);if(position)obj.position.set(...position);parent.add(obj);return obj;}
 function buoy(parent,x,mat){
  mesh(parent,new THREE.CylinderGeometry(.6,.95,.85,10),dark,[x,.25,0]);
  mesh(parent,new THREE.ConeGeometry(.48,2.2,8),mat,[x,1.75,0]);
  mesh(parent,new THREE.SphereGeometry(.26,8,6),mat,[x,3,0]);
 }
 const gate=new THREE.Group();gate.name='NEXT_SHIPPING_CHANNEL_GATE';root.add(gate);buoy(gate,-17,red);buoy(gate,17,mint);
 const gateRing=mesh(gate,new THREE.TorusGeometry(10,.14,6,48),gold,[0,1.6,0]);gateRing.rotation.x=-Math.PI/2;
 const flag=mesh(gate,new THREE.ConeGeometry(1.2,2.5,4),gold,[0,7,0]);flag.rotation.z=Math.PI;
 const berth=new THREE.Group();berth.name='ASSIGNED_CARGO_BERTH';root.add(berth);
 const berthRing=mesh(berth,new THREE.RingGeometry(12,13,48),material(0x8ee1cd,{side:THREE.DoubleSide,transparent:true,opacity:.6}),[0,.12,0]);berthRing.rotation.x=-Math.PI/2;
 const berthBeam=mesh(berth,new THREE.CylinderGeometry(.3,.3,9,8),material(0x8ee1cd,{transparent:true,opacity:.35}),[0,4.5,0]);
 const hazard=new THREE.Group();hazard.name='SHIPPING_HAZARD_WARNING';root.add(hazard);
 const hazardRing=mesh(hazard,new THREE.RingGeometry(15,16.2,40),material(0xf08f63,{side:THREE.DoubleSide,transparent:true,opacity:.65}),[0,.15,0]);hazardRing.rotation.x=-Math.PI/2;
 const mine=new THREE.Group();mine.name='ARCADE_MINE_WARNING';hazard.add(mine);
 mesh(mine,new THREE.SphereGeometry(1,12,8),dark,[0,.4,0]);for(let i=0;i<8;i++){const angle=i*Math.PI/4,spike=mesh(mine,new THREE.ConeGeometry(.23,.75,5),warning,[Math.cos(angle)*1.1,.4,Math.sin(angle)*1.1]);spike.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.cos(angle),0,Math.sin(angle)));}
 const warningSign=mesh(hazard,new THREE.ConeGeometry(1.2,2.2,3),warning,[0,4.5,0]);warningSign.rotation.z=Math.PI;
 const route=new THREE.Line(new THREE.BufferGeometry(),lineMaterial);route.name='CONFIRMED_SHIPPING_ROUTE';root.add(route);
 const canvas=createCanvas?.(),context=canvas?.getContext?.('2d');let label=null,texture=null,labelText='',routeKey='',state=null,lastTime=0,disposed=false;
 if(context){canvas.width=512;canvas.height=80;texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true,transparent:true}));label.name='SHIPPING_CHECKPOINT_NAME';label.position.set(0,10,0);label.scale.set(34,5.3,1);gate.add(label);}
 const show=(node,visible)=>{node.visible=!!visible;};
 function update(snapshot,selfId,environment){
  if(disposed)return;state=shippingSceneState(snapshot,selfId,environment);show(root,!!state);show(gate,!!state?.next);show(berth,!!state?.berth);show(hazard,!!state?.hazard?.position);
  if(!state){route.visible=false;return;}
  if(state.next){gate.position.set(state.next.x,.05,state.next.z);if(state.name!==labelText&&context){labelText=state.name;context.clearRect(0,0,512,80);context.fillStyle='rgba(9,33,45,.9)';context.fillRect(0,0,512,80);context.fillStyle='#fff1bd';context.font='600 25px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(labelText.slice(0,42),256,40,490);texture.needsUpdate=true;}}
  if(state.berth)berth.position.set(state.berth.x,.05,state.berth.z);
  if(state.hazard?.position){hazard.position.set(state.hazard.position.x,.05,state.hazard.position.z);mine.visible=state.hazard.type==='mines';warningSign.visible=state.hazard.type!=='mines';}
  const key=JSON.stringify(state.route);if(key!==routeKey){routeKey=key;route.geometry.dispose();route.geometry=new THREE.BufferGeometry().setFromPoints(state.route.map(p=>new THREE.Vector3(p.x,.16,p.z)));}
  route.visible=state.route.length>1;
 }
 function animate(time){if(disposed||!root.visible||!Number.isFinite(time))return;lastTime=time;flag.position.y=7+Math.sin(time*2)*.35;gateRing.material.opacity=.85;berthBeam.scale.x=berthBeam.scale.z=1+Math.sin(time*1.5)*.15;hazardRing.material.opacity=.4+Math.sin(time*4)*.2;warningSign.rotation.y=time*.4;mine.position.y=Math.sin(time*1.4)*.15;}
 function reset(){state=null;routeKey='';route.visible=root.visible=false;labelText='';}
 reset();
 return {root,update,animate,reset,snapshot:()=>({enabled:root.visible,next:state?.next||null,hazard:state?.hazard||null,phase:state?.phase||null,time:lastTime}),dispose(){if(disposed)return;disposed=true;const geometries=new Set(),materials=new Set();root.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const mat of Array.isArray(node.material)?node.material:node.material?[node.material]:[])materials.add(mat);});for(const geometry of geometries)geometry.dispose();for(const mat of materials)mat.dispose();texture?.dispose();root.removeFromParent();}};
}
