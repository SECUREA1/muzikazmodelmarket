import * as THREE from '../vendor/three/three.module.min.js';

const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
const label=value=>String(value??'').replace(/[\r\n]+/g,' ').slice(0,160);

/** A small, real scene panel. It never changes a camera or a tracked pose.
 * Its pose is mounted on entry/side change so head tracking keeps real parallax.
 * Only UI-confirmed actions are forwarded to the same fishing command path. */
export function createFishingVRScreen({scene,camera,onAction=()=>{},onReel=()=>{},createCanvas=()=>document.createElement('canvas'),getCamera=()=>camera}={}){
 const root=new THREE.Group();root.name='FISHING_VR_SPORTS_SCREEN';root.visible=false;scene.add(root);
 const localRay=new THREE.Ray(),inversePanel=new THREE.Matrix4(),localPoint=new THREE.Vector3(),headPosition=new THREE.Vector3(),anchorPosition=new THREE.Vector3(),anchorBoat=new THREE.Vector3(),headQuaternion=new THREE.Quaternion(),forward=new THREE.Vector3(),tiles=[],disposals=new Set();
 let state={},disposed=false,visible=false,anchorYaw=0,anchorSide=null,anchorBoatId=null,anchorBoatValid=false,anchorExplicit=false,reeling=false,lastSignature='',drawCount=0,hovered=null;const reelPointers=new Set();
 const canvas=createCanvas();canvas.width=1024;canvas.height=456;
 const context=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
 const face=new THREE.Mesh(new THREE.PlaneGeometry(.66,.294),material);face.name='FISHING_VR_STATUS';face.position.y=.075;face.renderOrder=990;root.add(face);
 disposals.add(face.geometry);disposals.add(material);disposals.add(texture);

 const actions=[['auto','Cast',-.225,-.12,.21],['side','Switch side',0,-.12,.21],['exit','Helm',.225,-.12,.21],['keep','Keep',-.225,-.205,.21],['release','Release',0,-.205,.21],['join','Fishing Cup',.225,-.205,.21]];
 for(const [action,text,x,y,width]of actions){
  const surface=createCanvas();surface.width=512;surface.height=150;const ink=surface.getContext('2d'),map=new THREE.CanvasTexture(surface);map.colorSpace=THREE.SRGBColorSpace;
  const paint=new THREE.MeshBasicMaterial({map,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}),mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,.071),paint);mesh.name='FISHING_VR_ACTION_'+action.toUpperCase();mesh.position.set(x,y,.002);mesh.renderOrder=991;mesh.userData.fishingAction=action;root.add(mesh);
  tiles.push({action,text,mesh,ink,map,width,enabled:false,label:text});disposals.add(mesh.geometry);disposals.add(paint);disposals.add(map);
 }
 const safeRun=operation=>{try{const result=operation();result?.catch?.(()=>{});}catch{}};
 const primaryLabel=()=>state.phase==='waiting'?'Waiting for bite':state.phase==='bite'?'Hook now':state.phase==='reeling'?(reeling?'Reeling…':'Hold to reel'):state.phase==='caught'?'Keep catch':state.primaryLabel?.replace(/^Auto\s*·\s*/i,'')||'Cast line';
 function draw(){
  if(!context)return;
  const signature=JSON.stringify([state.phase,state.side,label(state.location),label(state.message||state.status),Math.round(clamp(state.tension)*100),Math.round(clamp(state.progress)*100),state.fish?.name,state.fish?.weightKg,state.pending,state.canAct,state.primaryEnabled,state.tournament?.status,state.tournament?.joined,state.canJoin,state.canClaim,reeling,hovered]);
  if(signature===lastSignature)return;lastSignature=signature;drawCount++;
  context.clearRect(0,0,1024,456);context.fillStyle='rgba(9,31,39,.94)';context.fillRect(0,0,1024,456);context.strokeStyle='#9edab4';context.lineWidth=5;context.strokeRect(3,3,1018,450);
  context.fillStyle='#c9e9c4';context.font='bold 38px system-ui';context.textAlign='left';context.textBaseline='middle';context.fillText('FISHING  ·  '+(state.side==='port'?'PORT':'STARBOARD'),28,48,970);
  context.fillStyle='#a7d4ce';context.font='26px system-ui';context.fillText(label(state.location)||'Fishing station',28,91,970);
  context.fillStyle='#f0f7dd';context.font='bold 46px system-ui';context.fillText(primaryLabel(),28,152,970);
  context.fillStyle='#c9dacc';context.font='26px system-ui';context.fillText(label(state.message||state.status)||'Cast, hook, then hold the trigger to reel.',28,205,970);
  const bar=(title,value,y,color)=>{context.fillStyle='#cee1d2';context.font='25px system-ui';context.fillText(title+'  '+Math.round(value*100)+'%',28,y-17,970);context.fillStyle='#23444a';context.fillRect(28,y+5,968,23);context.fillStyle=color;context.fillRect(28,y+5,968*value,23);};
  bar('LINE',clamp(state.tension),262,state.tension>.78?'#f5c27f':'#b8e8b3');bar('LANDED',clamp(state.progress),331,'#7fd9cf');
  context.fillStyle='#f2e2b9';context.font='27px system-ui';context.fillText(state.fish?label(state.fish.name)+'  ·  '+Number(state.fish.weightKg||0).toFixed(2)+' kg':'Trigger: cast / hook / hold reel · Release to ease line',28,410,970);
  texture.needsUpdate=true;
  for(const tile of tiles){
   const caught=state.phase==='caught',busy=!!state.pending,live=['waiting','bite','reeling','caught'].includes(state.phase);
   tile.label=tile.action==='auto'?primaryLabel():tile.action==='side'?(state.side==='port'?'Starboard →':'← Port'):tile.action==='join'?(state.canClaim?'Claim cup':'Fishing Cup'):tile.text;
   tile.enabled=tile.action==='exit'||!busy&&(tile.action==='auto'?(state.primaryEnabled??state.canAct)!==false&&state.phase!=='waiting':tile.action==='side'?!live:['keep','release'].includes(tile.action)?caught:tile.action==='join'?!live&&(state.canClaim===true||state.canJoin!==false&&state.tournament?.status!=='finished'&&!state.tournament?.joined):true);
   tile.mesh.visible=!['keep','release'].includes(tile.action)||caught;
   const ink=tile.ink;if(!ink)continue;ink.clearRect(0,0,512,150);ink.fillStyle=tile.enabled?(tile.action==='auto'?'#c6e8ae':'#153f47'):'#173039';ink.fillRect(0,0,512,150);ink.strokeStyle=tile.enabled?(hovered===tile.action?'#ffd58a':'#a7d8b1'):'#41615d';ink.lineWidth=hovered===tile.action?9:4;ink.strokeRect(2,2,508,146);ink.fillStyle=tile.enabled?(tile.action==='auto'?'#103b3a':'#e5f1d5'):'#76978f';ink.font='bold 40px system-ui';ink.textAlign='center';ink.textBaseline='middle';ink.fillText(tile.label,256,75,484);tile.map.needsUpdate=true;
  }
 }
 function pointerUp(pointerId=null){if(pointerId===null)reelPointers.clear();else reelPointers.delete(pointerId);if(!reeling||reelPointers.size)return false;reeling=false;safeRun(()=>onReel(false));lastSignature='';draw();return true;}
 function setVisible(next){next=!!next&&!disposed;if(visible===next)return;visible=next;root.visible=next;if(!next){pointerUp();anchorSide=null;anchorBoatId=null;anchorBoatValid=false;anchorExplicit=false;hovered=null;}else lastSignature='';}
 function update(next={}){
  if(disposed)return;state=next||{};const show=state.enabled===true&&state.playing===true&&state.presenting===true&&!state.menuOpen;
  setVisible(show);if(!show)return;
  const explicitPosition=[state.anchorPosition?.x,state.anchorPosition?.y,state.anchorPosition?.z].every(Number.isFinite),explicitYaw=Number.isFinite(state.anchorYaw),tracked=getCamera();
  // The XR ArrayCamera's first world matrix can still describe the old helm
  // until rendering. Prefer the pure boat-seat pose supplied by the runtime.
  if(!tracked&&!explicitPosition){setVisible(false);return;}if(tracked){tracked.updateWorldMatrix?.(true,false);tracked.getWorldPosition(headPosition);tracked.getWorldQuaternion(headQuaternion);}
  const boat=state.boatPosition,boatValid=[boat?.x,boat?.y,boat?.z].every(Number.isFinite);if(anchorSide!==state.side||anchorBoatId!==state.boatId||explicitPosition&&explicitYaw&&!anchorExplicit){forward.set(0,0,-1).applyQuaternion(headQuaternion);if(Math.hypot(forward.x,forward.z)<.001)forward.set(0,0,-1);anchorYaw=explicitYaw?state.anchorYaw:Math.atan2(-forward.x,-forward.z);anchorSide=state.side;anchorBoatId=state.boatId;anchorPosition.copy(explicitPosition?state.anchorPosition:headPosition);anchorExplicit=explicitPosition&&explicitYaw;anchorBoatValid=boatValid;if(boatValid)anchorBoat.set(boat.x,boat.y,boat.z);}else if(boatValid&&!anchorBoatValid){anchorBoat.set(boat.x,boat.y,boat.z);anchorBoatValid=true;}
  // Keep the panel beside and below the cast ray, so even a fish coming
  // toward the boat remains visible in the center of the binocular view.
  const side=state.side==='port'?-1:1,lateral=side*.45,dx=boatValid&&anchorBoatValid?boat.x-anchorBoat.x:0,dy=boatValid&&anchorBoatValid?boat.y-anchorBoat.y:0,dz=boatValid&&anchorBoatValid?boat.z-anchorBoat.z:0;root.position.set(anchorPosition.x+dx-Math.sin(anchorYaw)*1.05+Math.cos(anchorYaw)*lateral,anchorPosition.y+dy-.59,anchorPosition.z+dz-Math.cos(anchorYaw)*1.05-Math.sin(anchorYaw)*lateral);root.rotation.set(0,anchorYaw-Math.atan2(lateral,1.05),0);root.updateMatrixWorld(true);
  if(state.phase!=='reeling'||state.pending||(state.primaryEnabled??state.canAct)===false)pointerUp();draw();
 }
 function hitTile(ray){
  if(disposed||!visible||!root.visible||state.enabled!==true||!state.playing||!state.presenting||state.menuOpen||!ray?.origin||!ray?.direction)return null;
  const origin=ray.origin.isVector3?ray.origin:new THREE.Vector3(ray.origin.x,ray.origin.y,ray.origin.z),direction=ray.direction.isVector3?ray.direction:new THREE.Vector3(ray.direction.x,ray.direction.y,ray.direction.z);
  if(![origin.x,origin.y,origin.z,direction.x,direction.y,direction.z].every(Number.isFinite)||direction.lengthSq()<.00001)return null;
  root.updateMatrixWorld(true);inversePanel.copy(root.matrixWorld).invert();localRay.set(origin,direction.clone().normalize()).applyMatrix4(inversePanel);
  // Analytic rectangle hits avoid a dead pixel on the two triangles' shared
  // diagonal when small controls are placed far from the world origin.
  if(localRay.direction.z>=-.00001)return null;const at=(.002-localRay.origin.z)/localRay.direction.z;if(at<0)return null;localRay.at(at,localPoint);
  const tile=tiles.find(item=>item.mesh.visible&&Math.abs(localPoint.x-item.mesh.position.x)<=item.width/2+.0001&&Math.abs(localPoint.y-item.mesh.position.y)<=.0356);
  if(tile)return {tile};const faceAt=-localRay.origin.z/localRay.direction.z;if(faceAt<0)return null;localRay.at(faceAt,localPoint);return Math.abs(localPoint.x)<=.33&&Math.abs(localPoint.y-.075)<=.147?{}:null;
 }
 function pointerMove(ray){const match=hitTile(ray),next=match?.tile?.enabled?match.tile.action:null;if(next!==hovered){hovered=next;lastSignature='';draw();}return !!match;}
 function pointerDown(ray,pointerId='primary'){
  const match=hitTile(ray);if(!match)return false;const tile=match.tile;if(!tile||!tile.enabled||state.pending&&tile.action!=='exit')return true;
  if(tile.action==='auto'&&state.phase==='reeling'){reelPointers.add(pointerId);if(!reeling){reeling=true;safeRun(()=>onReel(true));lastSignature='';draw();}}
  else{pointerUp();safeRun(()=>onAction(tile.action==='join'&&state.canClaim?'claim':tile.action));}
  return true;
 }
 return {root,update,setVisible,pointerDown,pointerMove,pointerUp,snapshot:()=>({visible,disposed,reeling,drawCount,phase:state.phase,side:state.side,buttons:tiles.map(tile=>({action:tile.action,label:tile.label,enabled:tile.enabled,visible:tile.mesh.visible})),position:root.position.toArray(),yaw:anchorYaw}),dispose(){if(disposed)return;setVisible(false);disposed=true;root.removeFromParent();for(const resource of disposals)resource.dispose();disposals.clear();}};
}
