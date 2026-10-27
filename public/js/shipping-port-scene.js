import * as THREE from '../vendor/three/three.module.min.js';
import {isShippingEnvironment} from './shipping-config.js';
import {shippingCommercialTerminals} from './shipping-port-config.js';

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const records=value=>Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];
const countStock=record=>Object.values(record?.stock||record?.inventory||record?.supplies||{}).reduce((sum,value)=>sum+Math.max(0,finite(value&&typeof value==='object'?value.quantity:value)),0);
const cargoPhase=rival=>['loading','unloading'].includes(rival?.phase||rival?.job?.phase);

/** Shared terminal cosmetics follow confirmed manifests. The server remains the
 * owner of every lift, stock change and arrival; this scene never awards cargo. */
export function shippingPortSceneState(snapshot,selfId,environment){
 if(!isShippingEnvironment(environment)||snapshot?.shipping?.enabled!==true)return null;
 const rivals=records(snapshot.shipping.rivals||snapshot.shipping.fleet),economy=records(snapshot.shipping.portEconomy||snapshot.shipping.economy?.ports);
 return shippingCommercialTerminals().map(terminal=>{
  const active=rivals.find(rival=>{const phase=rival.phase||rival.job?.phase,transfer=rival.lastTransfer||rival.job?.lastTransfer,live=transfer&&finite(snapshot.serverTime)>=finite(transfer.at)&&finite(snapshot.serverTime)<=finite(transfer.endsAt),portId=live?(transfer.kind==='load'?rival.job?.originId:rival.job?.destinationId):phase==='loading'?rival.job?.originId:rival.job?.destinationId;return (cargoPhase(rival)||live)&&portId===terminal.portId;});
  const warehouse=economy.find(record=>(record.portId||record.id)===terminal.portId)||snapshot.shipping.portEconomy?.[terminal.portId]||{};
  const actor=snapshot.actors?.[active?.shipId||active?.vesselId||active?.job?.vesselId];
  const transfer=active?.lastTransfer||active?.job?.lastTransfer;
  return {terminal,rival:active||null,actor,transfer,stock:countStock(warehouse),arrivals:Math.max(0,finite(warehouse.arrivals??warehouse.imports??warehouse.deliveries)),departures:Math.max(0,finite(warehouse.departures??warehouse.exports)),receivedUnits:Math.max(0,finite(warehouse.receivedUnits??warehouse.unloaded)),dispatchedUnits:Math.max(0,finite(warehouse.dispatchedUnits??warehouse.loaded))};
 });
}

export function createShippingPortScene(scene,{createCanvas=()=>globalThis.document?.createElement('canvas')}={}){
 const root=new THREE.Group();root.name='LIVE_COMMERCIAL_SHIPPING_TERMINALS';root.userData={collisionDisabled:true,collider:false};scene.add(root);
 const geometries=new Set(),materials=new Set(),textures=new Set(),terminals=shippingCommercialTerminals(),ports=new Map(),batches=new Map();
 const geometry=value=>{geometries.add(value);return value;},material=(color,extra={})=>{const value=new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.25,...extra});materials.add(value);return value;};
 const boxGeometry=geometry(new THREE.BoxGeometry(1,1,1)),cableGeometry=geometry(new THREE.CylinderGeometry(.028,.028,1,5)),lampGeometry=geometry(new THREE.SphereGeometry(.24,6,4));
 const paints={yellow:material(0xe1af4e),steel:material(0x879ca3,{metalness:.65}),dark:material(0x193440),lamp:material(0xe8c976,{emissive:0xe8c976,emissiveIntensity:.65})};
 const fixed={yellow:[],steel:[],dark:[]},lamps=[],matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
 const addBox=(kind,x,y,z,w,h,d)=>fixed[kind].push({x,y,z,w,h,d});
 function addBrace(kind,a,b,width){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);fixed[kind].push({x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,z:(a[2]+b[2])/2,w:width,h:delta.length(),d:width,quaternion:new THREE.Quaternion().setFromUnitVectors(up,delta.normalize())});}
 const makeMesh=(name,mat,size,parent=root)=>{const mesh=new THREE.Mesh(boxGeometry,mat);mesh.name=name;mesh.scale.set(...size);parent.add(mesh);return mesh;};
 for(const terminal of terminals){
  const {berth,shoreSign,crane}=terminal,x=crane.x,z=crane.z,paint=material(terminal.color),group=new THREE.Group();group.name='COMMERCIAL_TERMINAL_'+terminal.portId;root.add(group);
  for(const side of [-1,1]){
   addBox('dark',x+side*7,.16,z,1,.3,30);
   for(const dz of [-6,6]){addBox('yellow',x+side*7,10,z+dz,.7,20,.7);addBox('dark',x+side*7,.7,z+dz,1.7,1.1,3);}
   addBrace('steel',[x+side*7,1,z-6],[x+side*7,20,z+6],.22);
   lamps.push({x:x+side*6,y:21.2,z:z-shoreSign*6});
  }
  addBox('yellow',x,20.1,z,16,1.2,1.2);addBox('yellow',x,22,berth.z+shoreSign*23,1.3,1,62);addBox('steel',x,26,z,.4,9,.4);
  addBrace('steel',[x,30,z],[x,22,berth.z-shoreSign*7],.2);addBrace('steel',[x,30,z],[x,22,z+shoreSign*11],.2);
  addBox('dark',x+20,2,berth.z+shoreSign*52,.18,4,.18);addBox('dark',x+33,2,berth.z+shoreSign*52,.18,4,.18);
  const trolley=makeMesh('LIVE_CARGO_TROLLEY',paint,[2.5,.8,2.8],group),spreader=makeMesh('LIVE_CONTAINER_SPREADER',paints.yellow,[3,.35,6.4],group),container=makeMesh('LIVE_CARGO_TRANSFER',paint,[2.4,2.6,6],group);
  const cable=new THREE.Mesh(cableGeometry,paints.dark);cable.name='LIVE_CARGO_HOIST_CABLE';group.add(cable);
  let board=null,context=null,texture=null;const canvas=createCanvas?.();if(canvas?.getContext){canvas.width=640;canvas.height=192;context=canvas.getContext('2d');if(context){texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);const mat=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});materials.add(mat);board=new THREE.Mesh(geometry(new THREE.PlaneGeometry(16,4.8)),mat);board.name='LIVE_DISPATCH_BOARD_'+terminal.portId;board.position.set(x+26.5,5,berth.z+shoreSign*52);board.rotation.y=shoreSign>0?Math.PI:0;group.add(board);}}
  ports.set(terminal.portId,{terminal,group,trolley,spreader,container,cable,board,context,texture,signature:'',state:null,hook:{x,y:10,z:berth.z+shoreSign*17}});
 }
 function compose(row){position.set(row.x,row.y,row.z);scale.set(row.w,row.h,row.d);quaternion.copy(row.quaternion||new THREE.Quaternion());return matrix.compose(position,quaternion,scale);}
 for(const [key,rows]of Object.entries(fixed)){const batch=new THREE.InstancedMesh(boxGeometry,paints[key],rows.length);batch.name='BATCHED_TERMINAL_'+key.toUpperCase();for(let index=0;index<rows.length;index++)batch.setMatrixAt(index,compose(rows[index]));batch.instanceMatrix.needsUpdate=true;root.add(batch);batches.set(key,batch);}
 const lampBatch=new THREE.InstancedMesh(lampGeometry,paints.lamp,lamps.length);lampBatch.name='TERMINAL_WORK_LIGHTS';for(let index=0;index<lamps.length;index++)lampBatch.setMatrixAt(index,compose({...lamps[index],w:1,h:1,d:1}));lampBatch.instanceMatrix.needsUpdate=true;root.add(lampBatch);
 const stockBatch=new THREE.InstancedMesh(boxGeometry,material(0x719baa),terminals.length*12);stockBatch.name='LIVE_WAREHOUSE_STOCK';stockBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(stockBatch);
 let sequence=-1,environmentId=null,lastElapsed=0,receivedElapsed=0,serverTime=0,disposed=false,enabled=false,stockSignature='';
 function renderStock(rows){const signature=rows.map(row=>row.stock).join('|');if(signature===stockSignature)return;stockSignature=signature;let count=0;for(const row of rows){const terminal=row.terminal,n=Math.min(12,Math.ceil(row.stock/20));for(let index=0;index<n;index++){const level=Math.floor(index/6),column=index%3,r=Math.floor(index%6/3);stockBatch.setMatrixAt(count++,compose({x:terminal.berth.x+19+column*5,y:1.3+level*2.6,z:terminal.berth.z+terminal.shoreSign*(43+r*7),w:4,h:2.6,d:5.5}));}}stockBatch.count=count;stockBatch.instanceMatrix.needsUpdate=true;stockBatch.computeBoundingSphere();}
 function update(snapshot,selfId,environment){
  if(disposed)return;
  if(!isShippingEnvironment(environment)||snapshot?.shipping?.enabled!==true){reset();return;}
  if(environmentId&&environmentId!==environment.id)reset();environmentId=environment.id;
  if(snapshot.shipping.environmentId&&snapshot.shipping.environmentId!==environment.id)return;
  if(Number.isFinite(snapshot.sequence)&&snapshot.sequence<sequence)return;
  if(Number.isFinite(snapshot.sequence)&&snapshot.sequence===sequence&&finite(snapshot.serverTime)<=serverTime)return;
  const rows=shippingPortSceneState(snapshot,selfId,environment);if(!rows){reset();return;}
  sequence=snapshot.sequence??sequence;serverTime=finite(snapshot.serverTime);receivedElapsed=lastElapsed;root.visible=enabled=true;renderStock(rows);
  for(const state of rows){const port=ports.get(state.terminal.portId);port.state=state;const phase=state.rival?.phase||'idle',name=state.rival?.companyName||state.rival?.company||state.rival?.name||'Open commercial quay',text=[state.terminal.portName.split(' · ')[0].toUpperCase(),phase==='idle'?'LIVE CARGO DISPATCH':name+' · '+phase,state.stock+' STOCK UNITS · '+state.arrivals+' ARRIVALS · '+state.departures+' DEPARTURES'];
   const signature=text.join('|');if(port.context&&signature!==port.signature){port.signature=signature;const context=port.context;context.fillStyle='#102a39';context.fillRect(0,0,640,192);context.fillStyle=state.terminal.color;context.fillRect(0,0,640,7);context.fillStyle='#f3e6b8';context.textAlign='center';context.font='bold 31px sans-serif';context.fillText(text[0],320,50,610);context.fillStyle='#d9ecea';context.font='25px sans-serif';context.fillText(text[1],320,103,610);context.font='22px sans-serif';context.fillText(text[2],320,155,610);port.texture.needsUpdate=true;}
  }
  animate(lastElapsed);
 }
 function animate(elapsed){
  if(disposed||!Number.isFinite(elapsed))return;lastElapsed=elapsed;if(!enabled)return;
  const now=serverTime+Math.max(0,Math.min(1,elapsed-receivedElapsed))*1000;
  for(const port of ports.values()){
   const state=port.state,terminal=port.terminal,transfer=state?.transfer,at=finite(transfer?.at),end=finite(transfer?.endsAt),active=!!state?.rival&&!!state.actor&&['load','unload'].includes(transfer?.kind)&&end>at&&now>=at&&now<=end;
   let x=terminal.berth.x,z=terminal.berth.z+terminal.shoreSign*17,height=9;
   port.container.visible=active;
   if(active){const actor=state.actor,yaw=finite(actor.rotation?.y),side=(transfer?.side||'port')==='port'?-1:1,unit=Math.max(0,finite(transfer?.unitIndex)),lx=side*1.1,lz=-4+Math.floor(unit/2)%4*3.6,ship={x:actor.position.x+lx*Math.cos(yaw)+lz*Math.sin(yaw),z:actor.position.z-lx*Math.sin(yaw)+lz*Math.cos(yaw),y:actor.modelId==='shipping-feeder'?1.5:2.3},yard={x:terminal.berth.x+20,z:terminal.berth.z+terminal.shoreSign*43,y:.1},unloading=(transfer?.kind||state.rival.phase)==='unload'||state.rival.phase==='unloading',from=unloading?ship:yard,to=unloading?yard:ship,t=THREE.MathUtils.clamp((now-at)/(end-at),0,1),ease=t*t*(3-2*t);
    x=THREE.MathUtils.lerp(from.x,to.x,ease);z=THREE.MathUtils.lerp(from.z,to.z,ease);height=THREE.MathUtils.lerp(from.y,to.y,ease)+Math.sin(t*Math.PI)*7;port.container.position.set(x,height+1.3,z);port.container.rotation.y=yaw;
   }
   const spreaderY=height+2.9,span=Math.max(.2,22-spreaderY);port.trolley.position.set(x,22,z);port.spreader.position.set(x,spreaderY,z);port.cable.position.set(x,spreaderY+span/2,z);port.cable.scale.set(1,span,1);port.hook={x,y:spreaderY,z};
  }
 }
 function reset(){enabled=root.visible=false;sequence=-1;serverTime=0;environmentId=null;stockSignature='';stockBatch.count=0;for(const port of ports.values()){port.state=null;port.container.visible=false;port.signature='';}}
 reset();
 return {root,update,animate,reset,snapshot:()=>({enabled,sequence,portCount:ports.size,activeTransfers:[...ports.values()].filter(port=>port.container.visible).map(port=>({portId:port.terminal.portId,companyId:port.state?.rival?.id,hook:{...port.hook},kind:port.state?.transfer?.kind||port.state?.rival?.phase})),stockCrates:stockBatch.count}),dispose(){if(disposed)return;disposed=true;root.traverse(node=>{if(node.isInstancedMesh)node.dispose();});for(const value of geometries)value.dispose();for(const value of materials)value.dispose();for(const value of textures)value.dispose();root.removeFromParent();ports.clear();batches.clear();}};
}
