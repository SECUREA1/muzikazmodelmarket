import * as THREE from '../vendor/three/three.module.min.js';
import {disposeModelResources} from './game-graphics-resources.js';

const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
const point=value=>Number.isFinite(value?.x)&&Number.isFinite(value?.z)?{x:value.x,y:Number.isFinite(value.y)?value.y:0,z:value.z}:null;
const path=values=>Array.isArray(values)?values.map(point).filter(Boolean):[];
const list=value=>Array.isArray(value)?value:[];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const clockNow=()=>globalThis.performance?.now?.()??Date.now();
const moving=record=>record.phase==='driving'||record.phase==='courier'&&record.isCourier===true;
const deliveryEnvironment=value=>typeof value?.id==='string'&&!!value.id&&(value.memberPlot||value.deedId||value.delivery||value.builderScene?.layoutMeta?.delivery||value.id.startsWith('plot-'));

/** Visual interpolation follows measured path distance, rather than treating
 * unequal road segments as equal animation steps. It cannot settle cargo. */
export function deedDeliveryPathPose(values,progress=0){
 const points=path(values);if(!points.length)return null;
 if(points.length===1)return {position:{...points[0]},rotationY:0};
 const lengths=points.slice(1).map((value,index)=>distance(points[index],value)),total=lengths.reduce((sum,value)=>sum+value,0);
 let remaining=total*clamp(progress);
 for(let index=0;index<lengths.length;index++){
  const length=lengths[index];if(remaining>length&&index<lengths.length-1){remaining-=length;continue;}
  const a=points[index],b=points[index+1],t=length?Math.min(1,remaining/length):0;
  return {position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},rotationY:Math.atan2(a.x-b.x,a.z-b.z)};
 }
 return {position:{...points.at(-1)},rotationY:0};
}

/** A lost connection freezes the last confirmed leg within a bounded window.
 * Loading, blocked and delivered records never move on a browser clock. */
export function deedDeliveryVehiclePose(record,serverTime,elapsedMs=0,maxExtrapolationMs=6000){
 const confirmed=point(record?.position);if(!record||!confirmed)return null;
 const fallback={position:confirmed,rotationY:Number(record.rotationY)||0};
 if(!moving(record))return fallback;
 const duration=Number(record.stageDurationMs),start=Number(record.stageStartedAt),clock=Number(serverTime);
 const confirmedProgress=clamp(record.stageProgress??record.progress);
 const elapsed=Math.max(0,Math.min(Number(maxExtrapolationMs)||0,Number(elapsedMs)||0));
 const progress=duration>0&&Number.isFinite(start)&&Number.isFinite(clock)?Math.max(confirmedProgress,clamp((clock+elapsed-start)/duration)):confirmedProgress;
 // The final pose/phase must be confirmed by the server, even after a stall.
 const visualProgress=Math.min(.995,progress);
 return deedDeliveryPathPose(record.waypoints||(record.isCourier?record.courierWaypoints:record.truckWaypoints),visualProgress)||fallback;
}

function dispose(root){
 if(!root)return;root.traverse(node=>{if(node.isInstancedMesh)node.dispose();});disposeModelResources(root);root.removeFromParent();root.clear();
}
function markerLabel(text,createCanvas){
 const canvas=createCanvas?.(),context=canvas?.getContext?.('2d');if(!context)return null;
 canvas.width=640;canvas.height=128;context.fillStyle='#102b35';context.fillRect(0,0,640,128);context.fillStyle='#a2f2db';context.font='bold 34px sans-serif';context.textAlign='center';context.fillText(text,320,77,605);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));label.geometry=label.geometry.clone();label.scale.set(5,.95,1);label.position.y=2.5;label.name='DEED_DELIVERY_LABEL';return label;
}
function crate(){
 const group=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:0xa57c49,roughness:.86}),strap=new THREE.MeshStandardMaterial({color:0x24495a,roughness:.55});
 const box=new THREE.Mesh(new THREE.BoxGeometry(.7,.55,.65),wood);box.position.y=.3;group.add(box);
 for(const x of [-.22,.22]){const band=new THREE.Mesh(new THREE.BoxGeometry(.065,.58,.68),strap);band.position.set(x,.3,0);group.add(band);}return group;
}
function makePad(dropoff,createCanvas){
 const position=point(dropoff.position);if(!position)return null;
 const root=new THREE.Group();root.name='DEED_DELIVERY_PAD_'+dropoff.id;root.position.set(position.x,position.y+.025,position.z);
 const color=dropoff.status==='blocked'?0xe29e65:0x8de1c7,plate=new THREE.Mesh(new THREE.BoxGeometry(2.6,.035,2.3),new THREE.MeshBasicMaterial({color:0x183d48,transparent:true,opacity:.8,depthWrite:false}));root.add(plate);
 const ring=new THREE.Mesh(new THREE.RingGeometry(.8,.9,32),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.95,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.035;root.add(ring);
 const label=markerLabel(['door','doorstep'].includes(dropoff.kind)?'DOORSTEP DELIVERY':'DEED DELIVERY ENTRANCE',createCanvas);if(label)root.add(label);
 const parcel=crate();parcel.name='CONFIRMED_DOORSTEP_PARCEL';parcel.visible=Number.isFinite(dropoff.deliveredAt)||Number.isFinite(dropoff.receivedAt);root.add(parcel);
 root.userData.deedDeliveryDropoff=true;root.userData.deedId=dropoff.deedId;return root;
}
function makeRoute(record){
 const root=new THREE.Group();root.name='DEED_DELIVERY_ROUTE_'+record.id;
 for(const [kind,values]of [['truck',record.truckWaypoints],['courier',record.courierWaypoints]]){
  const points=path(values);if(points.length<2)continue;
  const material=new THREE.LineDashedMaterial({color:record.status==='blocked'?0xe29e65:kind==='truck'?0x8de1c7:0xf2c276,dashSize:kind==='truck'?1.4:.4,gapSize:kind==='truck'?.9:.25,transparent:true,opacity:.72,depthWrite:false});
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(value=>new THREE.Vector3(value.x,value.y+.09,value.z))),material);line.name='DEED_'+kind.toUpperCase()+'_PATH';line.computeLineDistances();root.add(line);
 }
 return root;
}

/** The server owns route validation, motion schedules and doorstep receipts.
 * These optional world decorations do not register controllable road actors. */
export function createWorldDeedDeliveryScene({scene,inventory,pollMs=4000,createCanvas=()=>globalThis.document?.createElement('canvas'),createModel=null,clock=clockNow,autoPoll=true}={}){
 if(!scene?.add||typeof inventory?.api!=='function')throw new TypeError('A delivery scene and inventory API are required.');
 const root=new THREE.Group();root.name='WORLD_DEED_DELIVERIES';root.userData={collisionDisabled:true,collider:false,deedDeliveryProjection:true};root.visible=false;scene.add(root);
 const markers=new THREE.Group(),routes=new THREE.Group(),fleet=new THREE.Group();markers.name='DEED_DELIVERY_MARKERS';routes.name='DEED_DELIVERY_ROUTES';fleet.name='DEED_DELIVERY_FLEET';root.add(markers,routes,fleet);
 const vehicles=new Map();let environment=null,generation=0,disposed=false,timer=null,request=null,receivedAt=0,serverTime=0,markerSignature='',routeSignature='',lastError='',modelsTask=null,modelFactory=createModel;
 const interval=Math.max(1000,Number(pollMs)||4000),document=globalThis.document;
 const clearGroup=group=>{for(const child of [...group.children])dispose(child);};
 const clear=()=>{clearGroup(markers);clearGroup(routes);clearGroup(fleet);vehicles.clear();markerSignature=routeSignature='';serverTime=receivedAt=0;root.visible=false;};
 function factory(){
  if(modelFactory)return Promise.resolve(modelFactory);
  modelsTask ||= import('./builder-models-3d.js').then(module=>{modelFactory=module.createBuilderModel;return modelFactory;}).catch(()=>null);
  return modelsTask;
 }
 async function install(row,entry){
  try{
   const make=await factory();if(disposed||vehicles.get(row.id)!==entry)return;
   const model=make?.(row.isCourier?'scout-avatar':'frontier-pickup');if(!model)return;
   if(disposed||vehicles.get(row.id)!==entry){dispose(model);return;}
   model.name=row.isCourier?'PROJECTED_DELIVERY_COURIER':'PROJECTED_DELIVERY_TRUCK';model.userData.deedDeliveryProjection=true;model.userData.collisionDisabled=true;entry.root.add(model);entry.model=model;
   if(!row.isCourier){const load=crate();load.name='PROJECTED_FREIGHT_PARCEL';load.position.set(0,.9,1.45);entry.root.add(load);entry.parcel=load;}
   tick();
  }catch{} // Optional scenery cannot stop the game or manufacture a receipt.
 }
 function receive(projection){
  if(disposed||!environment||projection?.mapId!==environment.id||!Number.isFinite(projection.serverTime))return false;
  if(serverTime&&projection.serverTime<serverTime)return false;
  serverTime=projection.serverTime;receivedAt=clock();lastError='';
  const drops=list(projection.dropoffs).filter(row=>row&&typeof row.id==='string'&&point(row.position)&&(!row.mapId||row.mapId===environment.id)).slice(0,128);
  const dropSignature=JSON.stringify(drops);
  if(markerSignature!==dropSignature){markerSignature=dropSignature;clearGroup(markers);for(const dropoff of drops){const pad=makePad(dropoff,createCanvas);if(pad)markers.add(pad);}}
  const roads=list(projection.routes).filter(row=>row&&typeof row.id==='string'&&(!row.mapId||row.mapId===environment.id)).slice(0,64),roadSignature=JSON.stringify(roads.map(row=>[row.id,row.revision,row.status,row.truckWaypoints,row.courierWaypoints]));
  if(routeSignature!==roadSignature){routeSignature=roadSignature;clearGroup(routes);for(const route of roads)routes.add(makeRoute(route));}
  const records=[...list(projection.vehicles),...list(projection.couriers).filter(Boolean).map(row=>({...row,isCourier:true}))].filter(row=>row&&typeof row.id==='string'&&point(row.position)&&(!row.mapId||row.mapId===environment.id)).slice(0,64),seen=new Set();
  for(const row of records){if(seen.has(row.id))continue;seen.add(row.id);let entry=vehicles.get(row.id);
   if(entry&&entry.row.isCourier!==row.isCourier){dispose(entry.root);vehicles.delete(row.id);entry=null;}
   if(!entry){const group=new THREE.Group();group.name='DEED_DELIVERY_VEHICLE_'+row.id;fleet.add(group);entry={root:group,row};vehicles.set(row.id,entry);void install(row,entry);}else entry.row=row;
  }
  for(const [id,entry]of vehicles)if(!seen.has(id)){dispose(entry.root);vehicles.delete(id);}
  root.visible=!!(drops.length||roads.length||records.length);tick();return true;
 }
 function tick(now=clock()){
  if(disposed||!environment)return;
  const elapsed=Math.max(0,Number(now)-receivedAt);
  for(const entry of vehicles.values()){
   const pose=deedDeliveryVehiclePose(entry.row,serverTime,elapsed,interval*1.5);if(!pose)continue;entry.root.position.set(pose.position.x,pose.position.y,pose.position.z);entry.root.rotation.y=pose.rotationY;
   if(entry.parcel)entry.parcel.visible=!['delivered','cancelled','port-held','courier','dropoff'].includes(entry.row.phase);
  }
 }
 function refresh(){
  if(disposed||!environment)return Promise.resolve(null);
  if(request)return request.promise;
  const context=generation,id=environment.id,controller=new AbortController(),record={controller,promise:null};request=record;
  record.promise=(async()=>{try{
   const projection=await inventory.api('/api/world-supply/deliveries?mapId='+encodeURIComponent(id),{signal:controller.signal,timeout:6000});if(disposed||context!==generation||environment?.id!==id)return null;
   receive(projection);return projection;
  }catch(error){if(!disposed&&context===generation&&error?.name!=='AbortError')lastError=error?.message||'Delivery map unavailable.';return null;}
  finally{if(request===record)request=null;}})();return record.promise;
 }
 const onVisible=()=>{if(!document?.hidden&&environment)void refresh();};document?.addEventListener?.('visibilitychange',onVisible);
 function reset(){
  generation++;clearInterval(timer);timer=null;request?.controller.abort();request=null;environment=null;lastError='';clear();
 }
 function update(next){
  if(disposed)return;
  // Most shared worlds have no deed freight at all. Do not subscribe them to
  // the supply ledger or build route plans merely because gameplay is live.
  if(!deliveryEnvironment(next)){if(environment||timer||request||root.visible)reset();return;}
  const changed=environment?.id!==next.id,revised=!changed&&String(environment.contentUpdatedAt||environment.updatedAt||'')!==String(next.contentUpdatedAt||next.updatedAt||'');
  if(changed)reset();environment=next;
  if(autoPoll&&!timer)timer=setInterval(()=>{if(!document?.hidden)void refresh();},interval);
  if(changed||revised)void refresh();
 }
 return {root,update,tick,refresh,receive,reset,snapshot:()=>({mapId:environment?.id||null,visible:root.visible,dropoffs:markers.children.length,routes:routes.children.length,vehicles:[...vehicles].map(([id,entry])=>({id,phase:entry.row.phase,isCourier:!!entry.row.isCourier,position:{x:entry.root.position.x,y:entry.root.position.y,z:entry.root.position.z},loaded:!!entry.model})),lastError}),dispose(){if(disposed)return;reset();disposed=true;document?.removeEventListener?.('visibilitychange',onVisible);root.removeFromParent();}};
}
