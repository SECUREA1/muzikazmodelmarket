import * as THREE from '../vendor/three/three.module.min.js';

export const CONSTRUCTION_SITE_MODEL_INFO=Object.freeze({
 'construction-site-office':['Modular Site Office','A fitted steel site office with framed glazing, panel seams, lift-plan furniture and rooftop services.',[12.4,3.9,7.4]],
 'construction-service-canopy':['Steel Service Canopy','An open six-post maintenance shelter with braced roof trusses and corrugated weather sheets.',[33,4.3,7]],
 'construction-floodlight':['Four-head Site Floodlight','A narrow generator base, telescopic mast, cable winch and four individually framed LED optics.',[1.3,8.1,1.3]]
});
export const CONSTRUCTION_SITE_ITEMS=Object.freeze(Object.entries(CONSTRUCTION_SITE_MODEL_INFO).map(([id,[name,description,dimensions]])=>Object.freeze({
 id,buildAssetId:id,name,description,dimensions,type:'interior',category:id==='construction-floodlight'?'props':'buildings',size:88,
 image:`public/images/native-designs/${id}.svg`,behavior:'decor',color:'#53727b',procedural:true,assetKind:'premade',
 function_data:{behavior:'decor',destructible:false,prompt:name}
})));

const material=(color,roughness=.65,metalness=.4,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});

// These support models use the same native finish and exact physical meshes in
// the editor, game and server. Cosmetic corrugation never blocks a walking route.
export function createConstructionSiteModel(id){
 const info=CONSTRUCTION_SITE_MODEL_INFO[id];if(!info)return null;
 const root=new THREE.Group();root.name=info[0];
 root.userData={builderObject:true,modelId:id,dimensions:info[2],constructionSupportModel:true,commonPropModel:true};
 const paint=material(0x486976,.67,.45),steel=material(0x9eafb0,.4,.78),dark=material(0x25383c,.7,.46),yellow=material(0xe6b54c,.55,.5),roof=material(0x91a4a6,.58,.65),wood=material(0x8d7351,.88,.02),glass=material(0x9dccd2,.12,.08,{transparent:true,opacity:.4,depthWrite:false,side:THREE.DoubleSide}),white=material(0xe8e5cf,.74,.05);
 const colliderMaterial=new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide});
 const structural=name=>/OFFICE_(?:FLOOR|BACK_PANEL|WEST_PANEL|EAST_PANEL|FRONT_|CORNER_POST|ROOF$)|CANOPY_(?:COLUMN$|STEEL_HEADER|ROOF_SHEET)|LIGHT_(?:GENERATOR_CABINET|TELESCOPIC_MAST|UPPER_MAST|OPTIC_HOUSING)/.test(name);
 const add=(name,geometry,mat,position=[0,0,0],rotation=[0,0,0],parent=root)=>{
  const mesh=new THREE.Mesh(geometry,mat);mesh.name=name;mesh.position.set(...position);mesh.rotation.set(...rotation);
  mesh.userData={collisionDisabled:!structural(name),nativeDesignDetail:true};mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
 };
 const box=(name,size,position,mat=paint,rotation=[0,0,0],parent=root)=>add(name,new THREE.BoxGeometry(...size),mat,position,rotation,parent);
 const cylinder=(name,radius,length,position,mat=steel,rotation=[0,0,0],parent=root)=>add(name,new THREE.CylinderGeometry(radius,radius,length,10),mat,position,rotation,parent);
 const collider=(name,size,position)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),colliderMaterial);mesh.name='COLLIDER_'+name;mesh.position.set(...position);
  mesh.userData={collider:true,collisionOnly:true,constructionSupportCollider:true};root.add(mesh);return mesh;
 };
 const batch=(name,size,positions,mat=steel,rotation=[0,0,0])=>{
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(...size),mat,positions.length);mesh.name=name;
  positions.forEach((position,index)=>mesh.setMatrixAt(index,new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)).setPosition(...position)));
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.userData={collisionDisabled:!structural(name),nativeDesignDetail:true};mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;
 };
 const tubes=(name,segments,r=.04,mat=steel)=>{
  const mesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(r,r,1,8),mat,segments.length);mesh.name=name;
  segments.forEach(([a,b],index)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);mesh.setMatrixAt(index,new THREE.Matrix4().compose(start.add(end).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()),new THREE.Vector3(1,delta.length(),1)));});
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.userData={collisionDisabled:true,nativeDesignDetail:true};root.add(mesh);return mesh;
 };
 if(id==='construction-site-office'){
  // A real panel assembly with window apertures, door leaf and an interior.
  box('OFFICE_FLOOR',[12,.18,7],[0,.23,0],dark);collider('OFFICE_FLOOR',[12,.32,7],[0,.16,0]);
  batch('OFFICE_STEEL_SKID',[.3,.13,6.5],[[-4.8,.065,0],[4.8,.065,0]],steel);
  for(const [name,size,position]of [['BACK',[12,3.2,.14],[0,1.9,-3.43]],['WEST',[.14,3.2,6.8],[-5.93,1.9,0]],['EAST',[.14,3.2,6.8],[5.93,1.9,0]]]){
   box('OFFICE_'+name+'_PANEL',size,position);collider('OFFICE_'+name,size,position);
  }
  for(const side of [-1,1]){
   const x=side*3.4;
   for(const [name,size,position]of [['SILL',[5.2,.85,.14],[x,.745,3.43]],['HEADER',[5.2,.74,.14],[x,3.18,3.43]],['OUTER',[1.05,1.7,.14],[side*5.405,2.02,3.43]],['INNER',[1.3,1.7,.14],[side*1.45,2.02,3.43]]]){
    box('OFFICE_FRONT_'+name,size,position);collider('OFFICE_FRONT_'+name+'_'+side,size,position);
   }
   const pane=box('OFFICE_WINDOW_GLASS',[2.75,1.5,.035],[side*3.45,2.02,3.46],glass);pane.userData.nativeDesignDetail=false;
   collider('OFFICE_WINDOW_'+side,[2.75,1.5,.035],[side*3.45,2.02,3.46]);
   for(const y of [1.25,2.79])box('OFFICE_WINDOW_FRAME',[2.95,.08,.1],[side*3.45,y,3.48],steel);
   for(const dx of [-1.44,0,1.44])box('OFFICE_WINDOW_MULLION',[.065,1.57,.1],[side*3.45+dx,2.02,3.48],steel);
  }
  for(const x of [-5.93,5.93])for(const z of [-3.43,3.43])box('OFFICE_CORNER_POST',[.17,3.5,.17],[x,1.9,z],steel);
  // The closed glazed door retains the original solid office access boundary.
  box('OFFICE_DOOR_LOWER',[1.38,1.15,.09],[0,.895,3.49],yellow);
  box('OFFICE_DOOR_GLASS',[1.13,1.03,.035],[0,1.99,3.49],glass);
  for(const x of [-.7,.7])box('OFFICE_DOOR_STILE',[.12,2.35,.14],[x,1.495,3.5],steel);
  for(const y of [.37,1.47,2.62])box('OFFICE_DOOR_RAIL',[1.5,.1,.14],[0,y,3.5],steel);
  collider('OFFICE_CLOSED_DOOR',[1.52,2.35,.14],[0,1.495,3.5]);
  box('OFFICE_DOOR_LINTEL',[1.6,.25,.14],[0,2.79,3.43],steel);collider('OFFICE_DOOR_LINTEL',[1.6,.25,.14],[0,2.79,3.43]);
  cylinder('OFFICE_DOOR_HANDLE',.035,.24,[.5,1.46,3.61],dark,[0,0,Math.PI/2]);
  box('OFFICE_ROOF',[12.4,.16,7.4],[0,3.63,0],roof);collider('OFFICE_ROOF',[12.4,.16,7.4],[0,3.63,0]);
  batch('OFFICE_ROOF_CORRUGATION',[.055,.045,7.34],Array.from({length:31},(_,i)=>[-6+i*.4,3.735,0]),steel);
  batch('OFFICE_PANEL_SEAMS',[.045,3.05,.025],Array.from({length:29},(_,i)=>[-5.6+i*.4,1.92,-3.515]),steel);
  for(const side of [-1,1])box('OFFICE_FASCIA',[12.4,.2,.07],[0,3.54,side*3.66],steel);
  box('OFFICE_ROOF_SERVICE_UNIT',[1.5,.2,1],[3.7,3.79,-1.9],dark);
  batch('OFFICE_SERVICE_GRILLE',[.06,.07,.92],Array.from({length:12},(_,i)=>[3.06+i*.115,3.865,-1.9]),steel);
  box('OFFICE_PLAN_TABLE',[2.9,.12,1.25],[3.6,1.05,.8],wood);
  for(const x of [2.35,4.85])for(const z of [.35,1.25])box('OFFICE_TABLE_LEG',[.08,.73,.08],[x,.625,z],steel);
  box('OFFICE_LIFT_PLAN',[2.1,.012,.85],[3.6,1.119,.8],white);
  batch('OFFICE_PLAN_GRID',[.025,.004,.76],Array.from({length:7},(_,i)=>[2.7+i*.3,1.128,.8]),paint);
  box('OFFICE_PLAN_BOARD',[3,1.65,.08],[3.5,2.05,-3.28],white);
  for(const x of [2.4,3.5,4.6])box('OFFICE_DRAWING_RULE',[.035,1.3,.015],[x,2.05,-3.23],paint);
 }else if(id==='construction-service-canopy'){
  // Exact column/roof proxies leave the complete maintenance aisle open.
  const columns=[-15.2,0,15.2].flatMap(x=>[-2.9,2.9].map(z=>[x,1.9,z]));
  batch('CANOPY_COLUMN',[.22,3.8,.22],columns,steel);
  for(const position of columns)collider('CANOPY_COLUMN',[.22,3.8,.22],position);
  batch('CANOPY_BASE_PLATE',[.6,.08,.6],columns.map(([x,,z])=>[x,.04,z]),dark);
  batch('CANOPY_ANCHOR_BOLT',[.07,.06,.07],columns.flatMap(([x,,z])=>[-.2,.2].flatMap(dx=>[-.2,.2].map(dz=>[x+dx,.1,z+dz]))),yellow);
  batch('CANOPY_STEEL_HEADER',[32,.17,.18],[-2.9,2.9].map(z=>[0,3.72,z]),steel);
  batch('CANOPY_TRUSS_CHORD',[32,.07,.07],[-2.9,2.9].map(z=>[0,4.07,z]),dark);
  const braces=[];for(const z of [-2.9,2.9])for(let x=-15.2;x<15;x+=3.8){braces.push([[x,3.72,z],[x+1.9,4.07,z]],[[x+1.9,4.07,z],[x+3.8,3.72,z]]);}
  tubes('CANOPY_DIAGONAL_WEB',braces,.035);
  for(const z of [-1,1])box('CANOPY_ROOF_SHEET',[33,.1,3.5],[0,4.08,z*1.75],roof,[z*.075,0,0]);
  collider('CANOPY_ROOF',[33,.3,7],[0,4.15,0]);
  for(const side of [-1,1])batch('CANOPY_ROOF_SEAMS',[.055,.045,3.5],Array.from({length:42},(_,i)=>[-16.35+i*.8,4.13,side*1.75]),steel,[side*.075,0,0]);
  batch('CANOPY_CROSS_RAFTERS',[.12,.17,6.2],Array.from({length:7},(_,i)=>[-15.2+i*5.067,3.85,0]),dark);
  batch('CANOPY_GUTTER',[33,.16,.12],[-3.43,3.43].map(z=>[0,3.98,z]),steel);
 }else{
  box('LIGHT_GENERATOR_CABINET',[1.15,.5,1.05],[0,.25,0],yellow);collider('LIGHT_BASE',[1.3,.55,1.3],[0,.275,0]);
  batch('LIGHT_BASE_FOOT',[.13,.09,1.3],[-.48,.48].map(x=>[x,.045,0]),dark);
  batch('LIGHT_ENGINE_VENTS',[.035,.24,.025],Array.from({length:14},(_,i)=>[-.45+i*.069,.3,.54]),dark);
  cylinder('LIGHT_TELESCOPIC_MAST',.09,6.8,[0,3.9,0],steel);cylinder('LIGHT_UPPER_MAST',.065,1,[0,7.45,0],steel);
  collider('LIGHT_MAST',[.2,7.3,.2],[0,4.18,0]);
  tubes('LIGHT_MAST_COLLAR',[1.4,3.3,5.1,6.8].map(y=>[[0,y-.06,0],[0,y+.06,0]]),.12,dark);
  add('LIGHT_CABLE_WINCH',new THREE.TorusGeometry(.16,.035,8,16),dark,[.2,1.12,0],[0,Math.PI/2,0]);
  cylinder('LIGHT_WINCH_HANDLE',.027,.26,[.38,1.12,0],steel,[0,0,Math.PI/2]);
  const optic=material(0xffefcf,.2,.05,{emissive:0xffdf9a,emissiveIntensity:1.1});
  const heads=[-.34,.34].flatMap(x=>[7.35,7.85].map(y=>[x,y,0])),tilt=new THREE.Euler(.24,0,0);
  const fitted=(offsets)=>heads.flatMap(head=>offsets.map(offset=>new THREE.Vector3(...offset).applyEuler(tilt).add(new THREE.Vector3(...head)).toArray()));
  batch('LIGHT_OPTIC_HOUSING',[.6,.43,.2],heads,dark,[.24,0,0]);
  batch('LIGHT_OPTIC_REFLECTOR',[.52,.35,.025],fitted([[0,0,.114]]),steel,[.24,0,0]);
  batch('LIGHT_LED_OPTIC',[.22,.13,.03],fitted([-.14,.14].flatMap(x=>[-.09,.09].map(y=>[x,y,.138]))),optic,[.24,0,0]);
 }
 root.traverse(part=>{if(part.isMesh)part.userData.builderRoot=root;});root.updateMatrixWorld(true);return root;
}
