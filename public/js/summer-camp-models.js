import {finishVehicleDesign} from './vehicle-design-system.js';
import {CAMP_ITEMS} from './summer-camp.js';

export function createCampModel(THREE,id){
 const item=CAMP_ITEMS[id];if(!item)return null;
 const root=new THREE.Group(),mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.78,...extra});
 const wood=mat(0x9b7048),dark=mat(0x493a2e),canvas=mat(0xe9b954),green=mat(0x32716a),metal=mat(0x4f5c60,{metalness:.55,roughness:.4}),cream=mat(0xf5e7c9);
 const part=(geometry,material,at,name='CAMP_DETAIL')=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...at);mesh.name=name;root.add(mesh);return mesh;};
 const box=(size,at,material=wood,name)=>part(new THREE.BoxGeometry(...size),material,at,name);
 const tube=(a,b,r=.06,material=dark)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),mesh=part(new THREE.CylinderGeometry(r,r,delta.length(),10),material,start.add(end).multiplyScalar(.5).toArray());mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return mesh;};
 const floor=(w,d,y=.16)=>{const mesh=box([w,y,d],[0,y/2,0],wood,'BUILDER_WALKABLE_FLOOR_'+id);root.userData.placementSurface=true;return mesh;};
 const roof=mesh=>{mesh.name='ROOF_'+id;mesh.userData.buildingRoof=true;return mesh;};
 if(id==='camp-cabin'){
  floor(6,6);box([.2,2.7,6],[-3,1.51,0]);box([.2,2.7,6],[3,1.51,0]);box([6,2.7,.2],[0,1.51,3]);
  for(const x of [-2.1,2.1])box([1.8,2.7,.2],[x,1.51,-3]);box([2.4,.35,.2],[0,2.685,-3]);
  box([6,.16,1.2],[0,.08,-3.6],wood,'BUILDER_WALKABLE_FLOOR_PORCH');
  for(const x of [-2.8,2.8])tube([x,.16,-4],[x,2.7,-4],.09);
  for(const sign of [-1,1]){const mesh=roof(box([3.5,.16,6.8],[sign*1.53,3.28,0],green));mesh.rotation.z=-sign*.3;}
  roof(box([6.3,.16,1.4],[0,2.85,-3.6],green));
  for(const z of [-1.5,1.5])for(const x of [-3.12,3.12])box([.08,1,1.2],[x,1.65,z],cream);
  root.userData.building=true;root.userData.entrances=[{x:0,y:.16,z:-3}];
 }else if(id==='camp-tent'){
  floor(3.8,4.4,.12);
  // Continuous sloping canvas forms the A-frame. The former axis-aligned
  // stacked bars left daylight between each course and read as scaffolding.
  // Both ends remain open and the centre retains a standing-height passage.
  const tentCanvas=mat(0xe9b954,{roughness:.92,side:THREE.DoubleSide});tentCanvas.name='CAMP_WOVEN_CANVAS';
  const halfWidth=1.86,eave=.15,ridge=3.17,rise=ridge-eave,slope=Math.atan2(rise,halfWidth),length=Math.hypot(halfWidth,rise);
  for(const sign of [-1,1]){
   const shell=box([length,.045,4.5],[sign*halfWidth/2,(eave+ridge)/2,0],tentCanvas,'CAMP_TENT_CANVAS');shell.rotation.z=-sign*slope;shell.userData.buildingRoof=true;
   // Bound hems follow the fabric edge and panel joins rather than bridging
   // the doorway or introducing a new collider across either entrance.
   for(const z of [-2.24,2.24]){
    const hem=tube([sign*halfWidth,eave,z],[0,ridge,z],.018,cream);hem.name='CAMP_TENT_CANVAS_HEM';hem.userData.collisionDisabled=true;
   }
   for(const z of [-1.12,0,1.12]){
    const seam=tube([sign*(halfWidth-.017),eave+.025,z],[sign*.017,ridge-.015,z],.009,cream);seam.name='CAMP_TENT_CANVAS_PANEL_JOIN';seam.userData.collisionDisabled=true;
   }
  }
  for(const z of [-2.2,2.2])tube([0,2.85,z],[0,3.2,z],.055,metal);
  tube([0,3.2,-2.3],[0,3.2,2.3],.065,wood);
 }else if(id==='camp-picnic-table'){
  for(let i=0;i<4;i++)box([2.6,.09,.23],[0,.94,(i-1.5)*.25]);
  for(const z of [-.9,.9])box([2.6,.12,.4],[0,.5,z]);
  for(const x of [-.9,.9]){tube([x,.06,-.9],[x,.92,-.3],.09);tube([x,.06,.9],[x,.92,.3],.09);box([.14,.12,2.1],[x,.36,0],dark);}
 }else if(id==='camp-log-bench'){
  box([2.5,.18,.7],[0,.46,0]);for(const x of [-.85,.85])box([.22,.37,.5],[x,.185,0],dark);
 }else if(id==='camp-lantern'){
  tube([0,0,0],[0,2.25,0],.085);tube([0,2.2,0],[.35,2.2,0],.045,metal);
  box([.32,.42,.32],[.3,1.9,0],mat(0xffd78c,{emissive:0xffab38,emissiveIntensity:.65}),'CAMP_LANTERN_GLOW');
  for(const y of [1.65,2.15])box([.42,.08,.42],[.3,y,0],metal);
 }else if(id==='camp-trail-sign'||id==='camp-activity-board'){
  const board=id==='camp-activity-board';
  if(board)for(const x of [-1.15,1.15])tube([x,0,0],[x,2.5,0],.085);else tube([0,0,0],[0,2.5,0],.09);
  box([board?2.8:2,board?1.45:.45,.16],[0,board?1.65:2,0],board?dark:green);
  if(board){box([2.55,1.2,.05],[0,1.65,-.11],canvas);for(let i=0;i<3;i++)box([.58,.78,.025],[(i-1)*.76,1.65,-.15],i===1?green:cream);}
  else{box([1.6,.35,.16],[.2,1.4,0],canvas);const arrow=part(new THREE.ConeGeometry(.25,.55,3),cream,[.65,2,-.12]);arrow.rotation.z=-Math.PI/2;arrow.rotation.y=Math.PI/2;}
 }else if(id==='camp-canoe-rack'){
  for(const x of [-1.6,1.6]){tube([x,0,0],[x,2.2,0],.09);box([.16,.12,1.6],[x,.7,0],dark);box([.16,.12,1.6],[x,1.6,0],dark);}
  for(const y of [.8,1.7]){
   const shape=new THREE.Shape();shape.moveTo(-2.4,0);shape.quadraticCurveTo(0,-1.5,2.4,0);shape.quadraticCurveTo(0,1.5,-2.4,0);
   const hull=part(new THREE.ExtrudeGeometry(shape,{depth:.22,bevelEnabled:false,curveSegments:10}),y<1?green:canvas,[0,y,0]);hull.rotation.x=Math.PI/2;
   box([2.8,.06,.16],[0,y+.06,0],cream);tube([-1.3,y+.12,-.4],[1.3,y+.12,.4],.04,wood);
  }
 }else if(id==='camp-dock'){
  floor(3.2,6,.18);for(let i=0;i<14;i++)box([3.18,.025,.38],[0,.19,(i-6.5)*.42],i%2?wood:cream);
  for(const x of [-1.5,1.5])for(const z of [-1.4,2.8])tube([x,0,z],[x,1.2,z],.07);for(const x of [-1.5,1.5])tube([x,.85,-1.4],[x,.85,2.8],.035);
 }else if(id==='camp-target'){
  for(const x of [-.5,.5])tube([x,0,-.3],[x,1.75,0],.065);tube([0,0,.6],[0,1.7,0],.065);
  for(const [radius,z,color]of [[.8,0,0xf2dfb7],[.6,-.06,0x32716a],[.4,-.12,0xe9b954],[.18,-.18,0xc6584a]]){const disc=part(new THREE.CylinderGeometry(radius,radius,.07,24),mat(color),[0,1.5,z]);disc.rotation.x=Math.PI/2;}
 }else if(id==='camp-flag'){
  tube([0,0,0],[0,3.8,0],.065,metal);box([.42,.12,.42],[0,.06,0],dark);box([1.5,.72,.04],[.75,3.15,0],canvas);box([.18,.72,.05],[.17,3.15,-.04],green);
 }else if(id==='camp-supply-pack'){
  box([.6,.7,.34],[0,.4,0],green);box([.4,.28,.12],[0,.28,-.22],canvas);for(const x of [-.18,.18])box([.07,.65,.1],[x,.4,.2],dark);tube([-.16,.75,0],[.16,.75,0],.035);
 }else if(id==='camp-trail-badge'){
  const badge=part(new THREE.CylinderGeometry(.27,.27,.12,6),canvas,[0,.55,0]);badge.rotation.x=Math.PI/2;
  const compass=part(new THREE.ConeGeometry(.16,.3,3),green,[0,.55,-.09]);compass.rotation.x=-Math.PI/2;
  tube([-.15,.8,0],[0,.55,0],.035,cream);tube([.15,.8,0],[0,.55,0],.035,cream);
 }else if(id==='camp-climbing-steps'){
  root.userData.placementSurface=true;
  for(let i=0;i<8;i++){const h=Math.min(i+1,8-i)*.3;box([2.8,h,.6],[0,h/2,(i-3.5)*.6],i%2?wood:green,'BUILDER_WALKABLE_FLOOR_STEP');}
 }else if(id==='camp-lake'){
  const water=part(new THREE.CylinderGeometry(1,1,.08,48),mat(0x4fa7b4,{metalness:.15,roughness:.26}),[0,.06,0],'CAMP_WATER');water.scale.set(9,1,6);water.userData.collisionDisabled=true;
  const shore=part(new THREE.TorusGeometry(1,.035,6,48),mat(0xd8c59a),[0,.03,0],'CAMP_WATER_SHORE');shore.rotation.x=Math.PI/2;shore.scale.set(9,6,1);shore.userData.collisionDisabled=true;
 }
 root.name=item.name;Object.assign(root.userData,{builderObject:true,modelId:id,label:item.name,description:item.description,dimensions:item.dimensions,pack:'summer-camp',behavior:item.behavior,interactive:item.behavior!=='decor'});
 return finishVehicleDesign(THREE,root,id);
}
